ARG OP_GETH_VERSION="v1.101200.1"

FROM us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:${OP_GETH_VERSION} as op-geth

FROM pkgxdev/pkgx as genesis-init-predeploy
COPY --from=op-geth /usr/local/bin/geth /usr/local/bin
RUN pkgx +deno@1.37 +getfoundry.sh@2023.7.16 \
    && pkgx install deno getfoundry.sh
ADD predeploy.ts /
RUN deno cache predeploy.ts
CMD ["deno", "run", "--allow-all", "predeploy.ts"]
