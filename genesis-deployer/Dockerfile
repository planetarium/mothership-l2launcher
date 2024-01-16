ARG OPTIMISM_CONTRACTS_HEAD="op-node/v1.4.2"
ARG OP_NODE_VERSION="v1.4.2"

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:${OP_NODE_VERSION} as op-node

FROM buildpack-deps:scm as foundry
ARG TARGETARCH
ARG FOUNDRY_URL="https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_linux_${TARGETARCH}.tar.gz"
RUN curl -L ${FOUNDRY_URL} | tar -xz -C /usr/local/bin

FROM --platform=$BUILDPLATFORM node:lts as builder
ARG BUILDARCH
ARG FOUNDRY_URL="https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_linux_${BUILDARCH}.tar.gz"
ARG OPTIMISM_CONTRACTS_HEAD
RUN curl -L ${FOUNDRY_URL} | tar -xz -C /usr/local/bin \
    && git clone https://github.com/ethereum-optimism/optimism.git /optimism \
        -b ${OPTIMISM_CONTRACTS_HEAD} --no-checkout --depth=1 \
    && cd /optimism \
    && git sparse-checkout init --cone \
    && git sparse-checkout set packages/contracts-bedrock \
    && git checkout \
    && cd /optimism/packages/contracts-bedrock \
    && git submodule update --depth=1 --recursive --init lib/* \
    && forge build \
    && mkdir -p /deploy \
    && mv * /deploy \
    && rm -rf /optimism /root/.cache /root/.local

FROM debian:12-slim as optimism-genesis-deployer
RUN apt-get update \
    && apt-get install --no-install-recommends -y jq openssl musl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /deploy/ /deploy/
COPY --from=foundry /usr/bin/git /usr/bin/git
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=op-node /usr/local/bin/op-node /usr/local/bin/op-node
COPY deploy.sh /deploy.sh

CMD ["/bin/sh", "/deploy.sh"]
