ARG OPTIMISM_VERSION=v1.1.4

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:${OPTIMISM_VERSION} as op-node

FROM --platform=linux/amd64 frolvlad/alpine-glibc:alpine-3.17 as optimism-genesis-deployer
COPY --from=op-node /usr/local/bin/op-node /usr/local/bin
COPY --from=ghcr.io/foundry-rs/foundry:latest /usr/local/bin /usr/local/bin
ARG OPTIMISM_VERSION

RUN apk add git bash jq nodejs-current openssl \
    && corepack enable \
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
    && rm -rf /optimism /root/.cache /root/.local/share/pnpm

COPY deploy.sh /deploy.sh

CMD ["/bin/sh", "/deploy.sh"]
