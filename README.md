# L2launcher

This repository contains base `docker-compose.yml` template to setup [Optimism Stack] and optional
[Stackup Bundler] with a CLI script to fill out required environment variables into .env.

[Optimism Stack]: https://stack.optimism.io/
[Stackup Bundler]: https://github.com/stackup-wallet/stackup-bundler

## Usage

### Prerequisites

- [Docker] with `docker compose`
- [Deno] (only if using CLI script)
- Required environment variables or .env file (optional if using CLI script)
  - Private keys for accounts used in Optimism stack (should be prefunded, [reference])
    - ADMIN_KEY (Recommended funding amounts: 2 ETH)
    - PROPOSER_KEY (Recommended funding amounts: 5 ETH)
    - BATCHER_KEY (Recommended funding amounts: 10 ETH)
    - SEQUENCER_KEY
  - L1_RPC
  - L2_CHAIN_ID
  - ERC4337_BUNDLER_KEY (optional, used for Stackup Bundler)

[Docker]: https://docs.docker.com/engine/install/
[Deno]: https://deno.com/
[reference]: https://stack.optimism.io/docs/build/getting-started/#generate-some-keys

### Using CLI script

`deno task start`

If environment variables are set or `.env` file present in current directory, the script will use
given variables and only prompt unset variables.

You can find output files at `out` directory, `.env` and `docker-compose.yml`.

### Using `docker compose` directly

If every required environment variables are set or present in `.env` file, you can just run
`docker compose up -d` with `templates/docker-compose.yml` directly without running the CLI.

However, the base compose template doesn't include Stackup Bundler and BlockScout explorer, so you
might need to copy `templates/docker-compose-bundler.yml` and
`templates/docker-compose-blockscout.yml` templates respectively into the base compose template or
setup manually.
