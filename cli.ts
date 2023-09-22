#!/usr/bin/env -S deno run --allow-read=./ --allow-write=./ --allow-run=docker

import { crypto } from "std/crypto/mod.ts";
import { load as loadDotenv } from "std/dotenv/mod.ts";
import { copy } from "std/fs/mod.ts";
import { join as joinPath } from "std/path/mod.ts";

import { Confirm, type ConfirmOptions, Input } from "cliffy/prompt/mod.ts";
import { bufferToHex } from "hextools";
import { getPublicKey, utils as secp256k1Utils } from "secp256k1";

const getAddressFromPrivateKey = async (key: string | Uint8Array) => {
  const pub = getPublicKey(typeof key === "string" ? key.replace("0x", "") : key, false);
  const hashed = await crypto.subtle.digest("KECCAK-256", pub.slice(1));
  return "0x" + bufferToHex(hashed.slice(-20));
};

const confirmOptions: Partial<ConfirmOptions> = { active: "y", inactive: "n" };

await Deno.mkdir("out", { recursive: true });

const envKeys = [
  "ADMIN_KEY",
  "PROPOSER_KEY",
  "BATCHER_KEY",
  "SEQUENCER_KEY",
  "L1_RPC",
  "L2_CHAIN_ID",
  "ERC4337_BUNDLER_KEY",
] as const;

const env = {
  ...await loadDotenv({ allowEmptyValues: true }),
  ...Deno.env,
} as unknown as Partial<Record<typeof envKeys[number], string>>;

if (!(env.ADMIN_KEY && env.PROPOSER_KEY && env.BATCHER_KEY && env.SEQUENCER_KEY)) {
  if (
    await Confirm.prompt({
      message: "Do you have Admin, Proposer, Batcher, and Sequencer accounts?",
      ...confirmOptions,
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
    console.log("Generated random keys.");
  }
}

console.log("Account addresses:");
await Promise.all([
  ["Admin", env.ADMIN_KEY],
  ["Proposer", env.PROPOSER_KEY],
  ["Batcher", env.BATCHER_KEY],
  ["Sequencer", env.SEQUENCER_KEY],
].map(async ([name, key]) => console.log(`  ${name}:`, await getAddressFromPrivateKey(key))));

env.L1_RPC = env.L1_RPC || await Input.prompt({ message: "RPC address to L1 chain:" });

env.L2_CHAIN_ID = env.L2_CHAIN_ID || await Input.prompt({ message: "Chain ID for new L2 chain:" });

let dockerComposeYml = await Deno.readTextFile("templates/docker-compose.yml");

if (
  await Confirm.prompt({ message: "Add stackup bundler to docker-compose.yml?", ...confirmOptions })
) {
  dockerComposeYml += "\n" + await Deno.readTextFile("templates/docker-compose-bundler.yml");
  if (!env.ERC4337_BUNDLER_KEY) {
    if (
      await Confirm.prompt({
        message: "Do you have ERC-4337 bundler private key?",
        ...confirmOptions,
      })
    ) {
      env.ERC4337_BUNDLER_KEY = await Input.prompt({ message: "Bundler private key:" });
    } else {
      env.ERC4337_BUNDLER_KEY = "0x" + bufferToHex(secp256k1Utils.randomPrivateKey());
      console.log("Generated a random bundler private key.");
    }
  }
}

if (
  await Confirm.prompt({
    message: "Add blockscout explorer to docker-compose.yml?",
    ...confirmOptions,
  })
) {
  dockerComposeYml += "\n" + await Deno.readTextFile("templates/docker-compose-blockscout.yml");
  await Promise.all([
    copy("templates/services", "out/services", { overwrite: true }),
    copy("templates/envs", "out/envs", { overwrite: true }),
  ]);
}

await Deno.writeTextFile("out/docker-compose.yml", dockerComposeYml);
console.log("out/docker-compose.yml copied.");

const dotenv = Object.entries(env)
  .filter(([k]) => envKeys.includes(k as typeof envKeys[number]))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");
await Deno.writeTextFile("out/.env", dotenv);
console.log("out/.env generated with given account private keys and L1 RPC.");

if (
  await Confirm.prompt({
    message: "Run docker compose now? (docker compose up -d)",
    ...confirmOptions,
  }) &&
  await Confirm.prompt({
    message:
      "Please ensure the Admin, Proposer, Batcher, and Sequencer accounts are funded to continue.\n" +
      "Recommended funding amounts: Admin - 2 ETH, Proposer - 5 ETH, Batcher - 10 ETH\n" +
      "(Reference: https://stack.optimism.io/docs/build/getting-started/#generate-some-keys)",
    ...confirmOptions,
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
