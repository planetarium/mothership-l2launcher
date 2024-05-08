#!/bin/sh
set -e

test -e /data/genesis.json && exit 0

mkdir -p /data
openssl rand -hex 32 > /data/jwt.txt

export GS_ADMIN_ADDRESS="$(cast wallet address --private-key ${ADMIN_KEY})";
export GS_PROPOSER_ADDRESS="$(cast wallet address --private-key ${PROPOSER_KEY})";
export GS_BATCHER_ADDRESS="$(cast wallet address --private-key ${BATCHER_KEY})";
export GS_SEQUENCER_ADDRESS="$(cast wallet address --private-key ${SEQUENCER_KEY})";

export L1_RPC_URL="${L1_RPC}"
export L1_CHAIN_ID="$(cast chain-id --rpc-url ${L1_RPC_URL})"
export IMPL_SALT=$(openssl rand -hex 32)
export DEPLOYMENT_CONTEXT="getting-started"

cd /deploy
./scripts/getting-started/config.sh
mv deploy-config/getting-started.json deploy-config/${DEPLOYMENT_CONTEXT}.json.old

cat deploy-config/${DEPLOYMENT_CONTEXT}.json.old \
  | jq ".l1ChainID=$(printf %d ${L1_CHAIN_ID})" \
  | jq ".l2ChainID=$(printf %d ${L2_CHAIN_ID})" \
  > deploy-config/${DEPLOYMENT_CONTEXT}.json

cat deploy-config/${DEPLOYMENT_CONTEXT}.json

mkdir -p deployments/${DEPLOYMENT_CONTEXT}
forge script scripts/Deploy.s.sol:Deploy --private-key ${ADMIN_KEY} --broadcast --rpc-url ${L1_RPC_URL}

cat deployments/${DEPLOYMENT_CONTEXT}/.deploy \
  | jq -r .L2OutputOracleProxy \
  > /data/L2OutputOracleProxyAddress

op-node genesis l2 \
  --deploy-config deploy-config/${DEPLOYMENT_CONTEXT}.json \
  --l1-deployments deployments/${DEPLOYMENT_CONTEXT}/.deploy \
  --l1-rpc ${L1_RPC_URL} \
  --outfile.l2 /data/genesis.json.out \
  --outfile.rollup /data/rollup.json

cat /data/genesis.json.out | jq ".config.fjordTime=0" > /data/genesis.json
rm -f /data/genesis.json.out