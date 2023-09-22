#!/bin/bash
set -e

test -e /data/genesis.json && exit 0

mkdir -p /data
openssl rand -hex 32 > /data/jwt.txt

echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

cast block finalized --json --rpc-url ${L1_RPC} > l1_finalized
export blockHash="$(cat l1_finalized | jq -r .hash)"
export timestamp="$(printf %d $(cat l1_finalized | jq -r .timestamp))"
export chainId="$(cast chain-id --rpc-url ${L1_RPC})"

export ETH_RPC_URL="${L1_RPC}"
export PRIVATE_KEY="${ADMIN_KEY}"
export DEPLOYMENT_CONTEXT="getting-started"

cd /deploy
cat deploy-config/${DEPLOYMENT_CONTEXT}.json \
  | sed "s/ADMIN/$(cast wallet address --private-key ${ADMIN_KEY})/" \
  | sed "s/PROPOSER/$(cast wallet address --private-key ${PROPOSER_KEY})/" \
  | sed "s/BATCHER/$(cast wallet address --private-key ${BATCHER_KEY})/" \
  | sed "s/SEQUENCER/$(cast wallet address --private-key ${SEQUENCER_KEY})/" \
  | sed "s/\"\\?TIMESTAMP\"\\?/\"TIMESTAMP\"/" \
  | jq ".l1BlockTime=12" \
  | jq ".l1StartingBlockTag=\"${blockHash}\"" \
  | jq ".l1ChainID=$(printf %d ${chainId})" \
  | jq ".l2ChainID=$(printf %d ${L2_CHAIN_ID})" \
  | jq ".l2OutputOracleStartingTimestamp=${timestamp}" \
  > deploy-config/${DEPLOYMENT_CONTEXT}.json.new
mv deploy-config/${DEPLOYMENT_CONTEXT}.json.new deploy-config/${DEPLOYMENT_CONTEXT}.json

mkdir -p deployments/${DEPLOYMENT_CONTEXT}
forge script scripts/Deploy.s.sol:Deploy --private-key ${ADMIN_KEY} --broadcast --rpc-url ${L1_RPC}
forge script scripts/Deploy.s.sol:Deploy --sig 'sync()' --private-key ${ADMIN_KEY} --broadcast --rpc-url ${L1_RPC}

cat deployments/${DEPLOYMENT_CONTEXT}/L2OutputOracleProxy.json \
  | jq -r .address \
  > /data/L2OutputOracleProxyAddress

op-node genesis l2 \
  --deploy-config deploy-config/${DEPLOYMENT_CONTEXT}.json \
  --deployment-dir deployments/${DEPLOYMENT_CONTEXT} \
  --outfile.l2 /data/genesis.json \
  --outfile.rollup /data/rollup.json \
  --l1-rpc ${L1_RPC}
