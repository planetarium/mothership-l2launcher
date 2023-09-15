#!/usr/bin/env -S deno run --allow-read=./ --allow-write=./ --allow-run=docker

import { load as loadDotenv } from "std/dotenv/mod.ts";
import { join as joinPath } from "std/path/mod.ts";
import { Confirm, Input } from "cliffy/prompt/mod.ts";
import { bufferToHex } from "hextools";
import { utils as secp256k1Utils } from "secp256k1";

await Deno.mkdir("out", { recursive: true });

const envKeys = [
  "ADMIN_KEY",
  "PROPOSER_KEY",
  "BATCHER_KEY",
  "SEQUENCER_KEY",
  "L1_RPC",
  "ERC4337_BUNDLER_KEY",
] as const;

const env = {
  ...await loadDotenv({ allowEmptyValues: true }),
  ...Deno.env,
} as unknown as Record<typeof envKeys[number], string>;

if (!(env.ADMIN_KEY && env.PROPOSER_KEY && env.BATCHER_KEY && env.SEQUENCER_KEY)) {
  if (
    await Confirm.prompt({
      message: "Do you have Admin, Proposer, Batcher, and Sequencer accounts?",
    })
  ) {
    const msg = "account's private key:";
    env.ADMIN_KEY = env.ADMIN_KEY || await Input.prompt({ message: `Admin ${msg}` });
    env.PROPOSER_KEY = env.PROPOSER_KEY || await Input.prompt({ message: `Proposer ${msg}` });
    env.BATCHER_KEY = env.BATCHER_KEY || await Input.prompt({ message: `Batcher ${msg}` });
    env.SEQUENCER_KEY = env.SEQUENCER_KEY || await Input.prompt({ message: `Sequencer ${msg}` });
  } else {
    env.ADMIN_KEY = env.ADMIN_KEY || "0x" + bufferToHex(secp256k1Utils.randomPrivateKey());
    env.PROPOSER_KEY = env.PROPOSER_KEY || "0x" + bufferToHex(secp256k1Utils.randomPrivateKey());
    env.BATCHER_KEY = env.BATCHER_KEY || "0x" + bufferToHex(secp256k1Utils.randomPrivateKey());
    env.SEQUENCER_KEY = env.SEQUENCER_KEY || "0x" + bufferToHex(secp256k1Utils.randomPrivateKey());
  }
}

env.L1_RPC = env.L1_RPC || await Input.prompt({ message: "RPC address to L1 chain:" });

let dockerComposeYml = await Deno.readTextFile("templates/docker-compose.yml");
if (
  await Confirm.prompt({ message: "Add stackup bundler to docker-compose.yml?", default: true })
) {
  dockerComposeYml += await Deno.readTextFile("templates/docker-compose-bundler.yml");
  env.ERC4337_BUNDLER_KEY = env.ERC4337_BUNDLER_KEY ||
    await Input.prompt({ message: "Bundler private key:" });
}
await Deno.writeTextFile("out/docker-compose.yml", dockerComposeYml);
await Deno.copyFile("templates/Dockerfile", "out/Dockerfile");
await Deno.copyFile("templates/deploy.sh", "out/deploy.sh");
console.log("out/docker-compose.yml, out/Dockerfile, out/deploy.sh copied.");

const dotenv = Object.entries(env)
  .filter(([k]) => envKeys.includes(k as typeof envKeys[number]))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");
await Deno.writeTextFile("out/.env", dotenv);
console.log("out/.env generated with given account private keys and L1 RPC.");

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
    cwd: joinPath(Deno.cwd(), "out"),
  }).spawn().output();
}
