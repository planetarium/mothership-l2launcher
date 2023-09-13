FROM --platform=linux/amd64 frolvlad/alpine-glibc:alpine-3.17 as build
ENV PATH="$PATH:/usr/local/go/bin" \
    ADMIN="{{ADMIN_KEY}}" \
    PROPOSER_KEY="{{PROPOSER_KEY}}" \
    BATCHER_KEY="{{BATCHER_KEY}}" \
    SEQ_KEY="{{SEQUENCER_KEY}}" \
    L1_RPC="{{L1_RPC}}" \
    RPC_KIND="debug_geth"
RUN apk add git curl jq make nodejs-current npm bash openssl \
    && corepack enable \
    && curl -L https://go.dev/dl/go1.20.7.linux-amd64.tar.gz -o go.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && curl -L https://foundry.paradigm.xyz | bash \
    && source /root/.profile \
    && foundryup \
    && git clone https://github.com/ethereum-optimism/optimism.git \
    && cd optimism \
    && pnpm install \
    && pnpm build \
    && make op-node op-batcher op-proposer \
    && cd / \
    && git clone https://github.com/ethereum-optimism/op-geth.git \
    && cd op-geth \
    && make geth \
    && cd / \
    && cd /optimism/packages/contracts-bedrock \
    && printf 'export ETH_RPC_URL="${L1_RPC}"\nexport PRIVATE_KEY="${ADMIN}"\nexport DEPLOYMENT_CONTEXT="getting-started"\n' > .envrc \
    && source .envrc \
    && curl -X POST -H 'content-type:application/json' -d '{"jsonrpc": "2.0", "id": "1", "method": "eth_getBlockByNumber", "params": ["finalized",false]}' ${L1_RPC} -o l1_finalized \
    && export blockHash="$(cat l1_finalized | jq -r .result.hash)" \
    && export timestamp="$(printf %d $(cat l1_finalized | jq -r .result.timestamp))" \
    && export chainId="$(curl -X POST -H 'content-type:application/json' -d '{"jsonrpc": "2.0", "id": "1", "method": "eth_chainId"}' ${L1_RPC} | jq -r '.result')" \
    && cat deploy-config/getting-started.json \
    | sed "s/ADMIN/$(cast wallet address --private-key ${ADMIN})/; s/PROPOSER/$(cast wallet address --private-key ${PROPOSER_KEY})/; s/BATCHER/$(cast wallet address --private-key ${BATCHER_KEY})/; s/SEQUENCER/$(cast wallet address --private-key ${SEQ_KEY})/; s/BLOCKHASH/$blockHash/; s/\"\\?TIMESTAMP\"\\?/\"TIMESTAMP\"/" \
    | jq -r ".l1ChainID=$(printf %d $chainId) | .l2OutputOracleStartingTimestamp=$timestamp" > deploy-config/getting-started.json.new \
    && mv deploy-config/getting-started.json.new deploy-config/getting-started.json \
    && mkdir deployments/getting-started \
    && forge script scripts/Deploy.s.sol:Deploy --private-key $PRIVATE_KEY --broadcast --rpc-url $ETH_RPC_URL \
    && forge script scripts/Deploy.s.sol:Deploy --sig 'sync()' --private-key $PRIVATE_KEY --broadcast --rpc-url $ETH_RPC_URL \
    && cd /optimism/packages/contracts-bedrock \
    && source .envrc \
    && cd /optimism/op-node \
    && go run cmd/main.go genesis l2 \
        --deploy-config ../packages/contracts-bedrock/deploy-config/getting-started.json \
        --deployment-dir ../packages/contracts-bedrock/deployments/getting-started/ \
        --outfile.l2 genesis.json \
        --outfile.rollup rollup.json \
        --l1-rpc ${L1_RPC} \
    && openssl rand -hex 32 > jwt.txt \
    && cp genesis.json /op-geth \
    && cp jwt.txt /op-geth \
    && cd /op-geth \
    && mkdir datadir \
    && build/bin/geth init --datadir=datadir genesis.json
FROM build as op-geth
WORKDIR /op-geth
EXPOSE 8545 8546 8551
CMD ["/bin/sh", "-c", "export L2OO_ADDR=\"$(cat /optimism/packages/contracts-bedrock/deployments/getting-started/L2OutputOracleProxy.json | jq -r .address)\"; \
    ./build/bin/geth \
        --datadir ./datadir \
        --http \
        --http.corsdomain=\"*\" \
        --http.vhosts=\"*\" \
        --http.addr=0.0.0.0 \
        --http.api=web3,debug,eth,txpool,net,engine \
        --ws \
        --ws.addr=0.0.0.0 \
        --ws.port=8546 \
        --ws.origins=\"*\" \
        --ws.api=debug,eth,txpool,net,engine \
        --syncmode=full \
        --gcmode=archive \
        --nodiscover \
        --maxpeers=0 \
        --networkid=42069 \
        --authrpc.vhosts=\"*\" \
        --authrpc.addr=0.0.0.0 \
        --authrpc.port=8551 \
        --authrpc.jwtsecret=./jwt.txt \
        --rollup.disabletxpoolgossip=true"]
FROM build as op-node
WORKDIR /optimism/op-node
EXPOSE 8547
CMD ["/bin/sh", "-c", "export L2OO_ADDR=\"$(cat /optimism/packages/contracts-bedrock/deployments/getting-started/L2OutputOracleProxy.json | jq -r .address)\"; \
    ./bin/op-node \
        --l2=http://op-geth:8551 \
        --l2.jwt-secret=./jwt.txt \
        --sequencer.enabled \
        --sequencer.l1-confs=3 \
        --verifier.l1-confs=3 \
        --rollup.config=./rollup.json \
        --rpc.addr=0.0.0.0 \
        --rpc.port=8547 \
        --p2p.disable \
        --rpc.enable-admin \
        --p2p.sequencer.key=${SEQ_KEY#0x} \
        --l1=${L1_RPC} \
        --l1.rpckind=${RPC_KIND}"]
FROM build as op-batcher
WORKDIR /optimism/op-batcher
EXPOSE 8548
CMD ["/bin/sh", "-c", "export L2OO_ADDR=\"$(cat /optimism/packages/contracts-bedrock/deployments/getting-started/L2OutputOracleProxy.json | jq -r .address)\"; \
    ./bin/op-batcher \
        --l2-eth-rpc=http://op-geth:8545 \
        --rollup-rpc=http://op-node:8547 \
        --poll-interval=1s \
        --sub-safety-margin=6 \
        --num-confirmations=1 \ 
        --safe-abort-nonce-too-low-count=3 \
        --resubmission-timeout=30s \
        --rpc.addr=0.0.0.0 \
        --rpc.port=8548 \
        --rpc.enable-admin \
        --max-channel-duration=1 \
        --l1-eth-rpc=${L1_RPC} \
        --private-key=${BATCHER_KEY}"]
FROM build as op-proposer
WORKDIR /optimism/op-proposer
EXPOSE 8560
CMD ["/bin/sh", "-c", "export L2OO_ADDR=\"$(cat /optimism/packages/contracts-bedrock/deployments/getting-started/L2OutputOracleProxy.json | jq -r .address)\"; \
    ./bin/op-proposer \
        --poll-interval=12s \
        --rpc.port=8560 \
        --rollup-rpc=http://op-node:8547 \
        --l2oo-address=${L2OO_ADDR} \
        --private-key=${PROPOSER_KEY} \
        --l1-eth-rpc=${L1_RPC}"]
