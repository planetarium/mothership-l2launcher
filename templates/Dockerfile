ARG OPTIMISM_VERSION=v1.1.4

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:${OPTIMISM_VERSION} as op-node

FROM node:lts as builder
ARG OPTIMISM_VERSION
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        git curl jq ca-certificates python3 build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && curl -L https://foundry.paradigm.xyz | bash \
    && export PATH=$PATH:~/.foundry/bin \
    && foundryup \
    && git clone https://github.com/ethereum-optimism/optimism.git /optimism \
        -b ${OPTIMISM_VERSION} --no-checkout --depth=1 \
    && cd /optimism \
    && git sparse-checkout init --cone \
    && git sparse-checkout set packages/contracts-bedrock \
    && git checkout \
    && cd /optimism/packages/contracts-bedrock \
    && git submodule update --depth=1 --recursive --init lib/* \
    && pnpm install \
    && pnpm build \
    && mkdir -p /deploy \
    && mv * /deploy \
    && rm -rf /optimism /root/.cache /root/.local

FROM debian:12-slim as optimism-genesis-deployer
RUN apt-get update \
    && apt-get install --no-install-recommends -y jq openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /deploy/ /deploy/
COPY --from=builder /root/.foundry/bin/cast /usr/local/bin/cast
COPY --from=builder /root/.foundry/bin/forge /usr/local/bin/forge
COPY --from=builder /usr/bin/git /usr/bin/git
COPY --from=op-node /usr/local/bin/op-node /usr/local/bin/op-node
COPY deploy.sh /deploy.sh

CMD ["/bin/sh", "/deploy.sh"]
