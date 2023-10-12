ARG OPTIMISM_VERSION="v1.1.4"
ARG OP_GETH_VERSION="v1.101200.1"

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:${OPTIMISM_VERSION} as op-node
FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:${OP_GETH_VERSION} as op-geth

FROM pkgxdev/pkgx as optimism-genesis-predeploy
COPY --from=op-geth /usr/local/bin/geth /usr/local/bin
RUN pkgx +deno@1.37 +getfoundry.sh@2023.7.16 \
    && pkgx install deno getfoundry.sh
ADD predeploy.ts /
RUN deno cache predeploy.ts
CMD ["deno", "run", "--allow-all", "predeploy.ts"]

FROM buildpack-deps:scm as foundry
ARG TARGETARCH
ARG FOUNDRY_URL="https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_linux_${TARGETARCH}.tar.gz"
RUN curl -L ${FOUNDRY_URL} | tar -xz -C /usr/local/bin

FROM --platform=$BUILDPLATFORM node:lts as builder
ARG BUILDARCH
ARG FOUNDRY_URL="https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_linux_${BUILDARCH}.tar.gz"
ARG OPTIMISM_VERSION
RUN curl -L ${FOUNDRY_URL} | tar -xz -C /usr/local/bin \
    && git clone https://github.com/ethereum-optimism/optimism.git /optimism \
        -b ${OPTIMISM_VERSION} --no-checkout --depth=1 \
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
