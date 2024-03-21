ARG OP_GETH_VERSION="v1.101308.2"

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:${OP_GETH_VERSION} as op-geth

FROM buildpack-deps:scm as foundry
ARG TARGETARCH
ARG FOUNDRY_URL="https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_linux_${TARGETARCH}.tar.gz"
RUN curl -L ${FOUNDRY_URL} | tar -xz -C /usr/local/bin

FROM denoland/deno:debian as genesis-init-predeploy
COPY --from=op-geth /usr/local/bin/geth /usr/local/bin
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin
ADD predeploy.ts /
RUN deno cache predeploy.ts
CMD ["deno", "run", "--allow-all", "predeploy.ts"]
