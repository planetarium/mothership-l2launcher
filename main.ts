#!/usr/bin/env -S deno run --allow-read=./ --allow-write=./ --allow-run=docker

import { join } from "std/path/mod.ts";
import { Confirm, Input } from "cliffy/prompt/mod.ts";
import { bufferToHex } from "hextools";
import { utils as secp256k1Utils } from "secp256k1";

let accounts: {
  admin: string;
  proposer: string;
  batcher: string;
  sequencer: string;
};

await Deno.mkdir("out", { recursive: true });

const hasAccounts = await Confirm.prompt({
  message: "Do you have Admin, Proposer, Batcher, and Sequencer accounts?",
  default: true,
});
if (hasAccounts) {
  accounts = {
    admin: await Input.prompt({ message: "Admin account's private key:" }),
    proposer: await Input.prompt({ message: "Proposer account's private key:" }),
    batcher: await Input.prompt({ message: "Batcher account's private key:" }),
    sequencer: await Input.prompt({ message: "Sequencer account's private key:" }),
  };
} else {
  accounts = {
    admin: "0x" + bufferToHex(secp256k1Utils.randomPrivateKey()),
    proposer: "0x" + bufferToHex(secp256k1Utils.randomPrivateKey()),
    batcher: "0x" + bufferToHex(secp256k1Utils.randomPrivateKey()),
    sequencer: "0x" + bufferToHex(secp256k1Utils.randomPrivateKey()),
  };
  await Deno.writeTextFile("out/accounts.json", JSON.stringify(accounts, null, 2));
  console.log("Generated random private keys to out/accounts.json");
}

const l1Rpc = await Input.prompt({
  message: "RPC address to L1 chain:",
  default: "http://devnet.tests.mothership-pla.net:8545/",
});

const dockerfileTemplate = await Deno.readTextFile("templates/Dockerfile");
const dockerfile = dockerfileTemplate
  .replace("{{ADMIN_KEY}}", accounts.admin)
  .replace("{{PROPOSER_KEY}}", accounts.proposer)
  .replace("{{BATCHER_KEY}}", accounts.batcher)
  .replace("{{SEQUENCER_KEY}}", accounts.sequencer)
  .replace("{{L1_RPC}}", l1Rpc);

await Deno.writeTextFile("out/Dockerfile", dockerfile);
console.log("Dockerfile generated with given account private keys and L1 RPC.");

let dockerComposeYml = await Deno.readTextFile("templates/docker-compose.yml");
if (
  await Confirm.prompt({ message: "Add stackup bundler to docker-compose.yml?", default: true })
) {
  const bundlerKey = await Input.prompt({ message: "Bundler private key:" });
  const bundlerYml = await Deno.readTextFile("templates/docker-compose-bundler.yml");
  dockerComposeYml += bundlerYml.replace("{{ERC4337_BUNDLER_PRIVATE_KEY}}", bundlerKey);
}
await Deno.writeTextFile("out/docker-compose.yml", dockerComposeYml);
console.log("docker-compose.yml generated.");

if (
  await Confirm.prompt({ message: "Build docker image now? (docker build .)", default: true }) &&
  await Confirm.prompt({
    message: "Before deploying L1 contracts during build process, accounts should be funded.\n" +
      "Refer https://stack.optimism.io/docs/build/getting-started/#generate-some-keys.\n" +
      "Continue?",
  })
) {
  const cwd = join(Deno.cwd(), "out");

  await new Deno.Command("docker", {
    args: ["build", "."],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    cwd,
  }).spawn().output();

  if (
    await Confirm.prompt({
      message: "Run docker compose now? (docker compose up -d)",
      default: true,
    })
  ) {
    await new Deno.Command("docker", {
      args: ["compose", "up", "-d"],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      cwd,
    }).spawn().output();
  }
}
