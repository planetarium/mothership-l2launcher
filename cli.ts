#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write=./ --allow-run=docker

import { crypto } from "std/crypto/mod.ts";
import { load as loadDotenv } from "std/dotenv/mod.ts";
import { join as joinPath } from "std/path/mod.ts";

import { Confirm, type ConfirmOptions, Input } from "cliffy/prompt/mod.ts";
import { bufferToHex } from "hextools";
import { getPublicKey, utils as secp256k1Utils } from "secp256k1";
import { createPublicClient, type Hex, http } from "viem";

import { type Account, ETHER_WEI_UNIT, listAndFundAccounts } from "./fundAccounts.ts";

const generatePrivateKey = () => "0x" + bufferToHex(secp256k1Utils.randomPrivateKey()) as Hex;

const getAddressFromPrivateKey = async (key: string | Uint8Array) => {
  const pub = getPublicKey(typeof key === "string" ? key.replace("0x", "") : key, false);
  const hashed = await crypto.subtle.digest("KECCAK-256", pub.slice(1));
  return "0x" + bufferToHex(hashed.slice(-20)) as Hex;
};

const confirmOptions: Partial<ConfirmOptions> = { active: "y", inactive: "n" };

const fetchTemplate = (path: string) => {
  if (globalThis.location) return fetch(path).then((res) => res.text());
  return Deno.readTextFile(path);
}

const envKeys = [
  "L1_RPC",
  "L2_CHAIN_ID",
  "ADMIN_KEY",
  "PROPOSER_KEY",
  "BATCHER_KEY",
  "SEQUENCER_KEY",
  "ERC4337_BUNDLER_KEY",
  "BLOCKSCOUT_IMAGE",
] as const;

const env = {
  ...await loadDotenv({ allowEmptyValues: true }),
  ...Deno.env,
} as unknown as Partial<Record<typeof envKeys[number], string>>;

env.L1_RPC = env.L1_RPC || await Input.prompt({ message: "RPC address to L1 chain:" });
env.L2_CHAIN_ID = env.L2_CHAIN_ID || await Input.prompt({ message: "Chain ID for new L2 chain:" });

const l1RpcClient = createPublicClient({ transport: http(env.L1_RPC) });

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
    env.ADMIN_KEY = env.ADMIN_KEY || generatePrivateKey();
    env.PROPOSER_KEY = env.PROPOSER_KEY || generatePrivateKey();
    env.BATCHER_KEY = env.BATCHER_KEY || generatePrivateKey();
    env.SEQUENCER_KEY = env.SEQUENCER_KEY || generatePrivateKey();
    console.log("Generated random keys.");
  }
}

let dockerComposeYml = await fetchTemplate("templates/docker-compose.yml");

await Deno.mkdir("out", { recursive: true });

if (
  await Confirm.prompt({
    message: "Add blockscout explorer to docker-compose.yml?",
    ...confirmOptions,
  })
) {
  dockerComposeYml += "\n" + await fetchTemplate("templates/docker-compose-blockscout.yml");
  if (Deno.build.arch === "aarch64") {
    env.BLOCKSCOUT_IMAGE = "ghcr.io/planetarium/mothership-l2launcher-blockscout";
  }
}

if (
  await Confirm.prompt({ message: "Add Stackup bundler to docker-compose.yml?", ...confirmOptions })
) {
  dockerComposeYml += "\n" + await fetchTemplate("templates/docker-compose-bundler.yml");
  if (!env.ERC4337_BUNDLER_KEY) {
    if (
      await Confirm.prompt({
        message: "Do you have ERC-4337 bundler private key?",
        ...confirmOptions,
      })
    ) {
      env.ERC4337_BUNDLER_KEY = await Input.prompt({ message: "Bundler private key:" });
    } else {
      env.ERC4337_BUNDLER_KEY = generatePrivateKey();
      console.log("Generated a random bundler account.");
    }
    if (env.ERC4337_BUNDLER_KEY.startsWith('0x')) {
      env.ERC4337_BUNDLER_KEY = env.ERC4337_BUNDLER_KEY.slice(2);
    }
  }
}

console.log("Using predeploys from templates/predeploy.json.");
await Deno.writeTextFile("out/predeploy.json", await fetchTemplate("templates/predeploy.json"));

await Deno.writeTextFile("out/docker-compose.yml", dockerComposeYml);
console.log("out/docker-compose.yml copied.");

const dotenv = Object.entries(env)
  .filter(([k]) => envKeys.includes(k as typeof envKeys[number]))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");
await Deno.writeTextFile("out/.env", dotenv + "\n");
console.log("out/.env generated with given account private keys and L1 RPC.");

const accounts: Account[] = await Promise.all(([
  ["Admin", env.ADMIN_KEY, 2n],
  ["Proposer", env.PROPOSER_KEY, 5n],
  ["Batcher", env.BATCHER_KEY, 10n],
  ["Sequencer", env.SEQUENCER_KEY, 0n],
  ...(env.ERC4337_BUNDLER_KEY ? [["Bundler", env.ERC4337_BUNDLER_KEY, 1n] as const] : []),
] as const).map(async ([name, privateKey, recommendedBalance]) => {
  const address = await getAddressFromPrivateKey(privateKey);

  return {
    name,
    address,
    balance: await l1RpcClient.getBalance({ address }),
    recommendedBalance: recommendedBalance * ETHER_WEI_UNIT,
  };
}));

await listAndFundAccounts(accounts, env);

if (
  await Confirm.prompt({
    message: "Run docker compose now? (docker compose up -d)",
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
