import $ from "https://deno.land/x/dax@0.35.0/mod.ts";
import { getFreePort } from "https://deno.land/x/free_port@v1.2.0/mod.ts";
import {
  type Address,
  type Chain,
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  type Hash,
  type Hex,
  http,
  HttpRequestError,
  pad,
  parseAbiItem,
} from "https://esm.sh/viem@1.15.3";

type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  // deno-lint-ignore ban-types
  & {};
type PredeployBaseItem = { bytecode: Hex; deployerAddress: Hex };
export type PredeployItem = Prettify<
  | PredeployBaseItem
  | PredeployBaseItem & { signature: string; args: string[] }
>;

async function getPredeploy(preset: { [K: Hex]: PredeployItem }, chainId: number) {
  const port = await getFreePort(1025);
  const tempStateFilePath = await Deno.makeTempFile();

  const transport = http(`http://localhost:${port}`);
  const chain = { id: await chainId } as Chain;
  const publicClient = createPublicClient({ transport, chain });
  const walletClient = createWalletClient({ transport, chain });
  const testClient = createTestClient({ transport, chain, mode: "anvil" });

  const anvil =
    $`anvil --chain-id ${chainId} --port ${port} --dump-state ${tempStateFilePath} --no-mining`
      .quiet()
      .spawn();

  while (true) {
    try {
      await publicClient.getChainId();
      break;
    } catch (e) {
      if (!(e instanceof HttpRequestError)) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  await Promise.all(
    Object.values(preset).reduce(
      (acc, x) => {
        const addr = getAddress(x.deployerAddress);
        return acc.includes(addr) ? acc : [...acc, addr];
      },
      [] as Address[],
    ).map(
      async (address) =>
        await testClient.setBalance({ address, value: (10n ** 10n) * (10n ** 18n) }),
    ),
  );

  const deploy = await Object.entries(preset).reduce(
    async (accPromise, [destinationAddress, params]) => {
      const acc = await accPromise;
      const account = getAddress(params.deployerAddress);
      await testClient.impersonateAccount({ address: account });
      return [...acc, {
        destinationAddress: destinationAddress.toLowerCase() as `0x${string}`,
        hash: await walletClient.deployContract({
          account,
          bytecode: params.bytecode,
          abi: "signature" in params ? [parseAbiItem(params.signature)] : [],
          args: "args" in params ? params.args : undefined,
        }),
      }];
    },
    Promise.resolve([] as { destinationAddress: `0x${string}`; hash: `0x${string}` }[]),
  );

  await testClient.mine({ blocks: 1 });

  const contractAddresses = await Promise.all(deploy.map(async ({ destinationAddress, hash }) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const actualDeployedAddress = receipt.contractAddress!.toLowerCase();
    return {
      destinationAddress,
      actualDeployedAddress,
      changedAddresses: (await publicClient.request<
        {
          Parameters: [hash: Hash];
          ReturnType: ({
            type: "create";
            result: { address: Address };
          } | { type: "call"; action: { to: Address } })[];
        }
      >({
        method: "trace_transaction",
        params: [receipt.transactionHash],
      })).reduce(
        (
          acc,
          x,
        ) => [
          ...acc,
          ...(x.type === "create"
            ? acc.includes(x.result.address)
              ? []
              : [x.result.address.toLowerCase() as `0x${string}`]
            : acc.includes(x.action.to)
            ? []
            : [x.action.to.toLowerCase() as `0x${string}`]),
        ],
        [] as Address[],
      ).filter((x) => x !== actualDeployedAddress),
    };
  }));

  anvil.kill("SIGINT");
  await anvil;

  const state = JSON.parse(await Deno.readTextFile(tempStateFilePath))["accounts"];
  await Deno.remove(tempStateFilePath);

  return contractAddresses.reduce((acc, x) => ({
    ...acc,
    [x.destinationAddress.startsWith("0x") ? x.destinationAddress.slice(2) : x.destinationAddress]:
      {
        balance: state[x.actualDeployedAddress].balance,
        code: state[x.actualDeployedAddress].code,
        storage: normalizeStorage(state[x.actualDeployedAddress].storage),
      },
    ...(x.changedAddresses.reduce(
      (acc, x) => ({
        ...acc,
        [x.startsWith("0x") ? x.slice(2) : x]: {
          balance: state[x].balance,
          code: state[x].code,
          storage: normalizeStorage(state[x].storage),
        },
      }),
      {},
    )),
  }), {});
}

function normalizeStorage(storage: { [K: `0x${string}`]: `0x${string}` }) {
  return Object.entries(storage).map(([k, v]) => ({
    [pad(k as `0x${string}`) as string]: pad(v),
  })).reduce((acc, x) => ({ ...acc, ...x }), {});
}

async function main() {
  try {
    await Deno.stat("/data/geth/chaindata/CURRENT");
    Deno.exit(0);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const genesis = JSON.parse(await Deno.readTextFile("/genesis/genesis.json"));
  await Deno.writeTextFile(
    "/genesis/genesis.json",
    JSON.stringify({
      ...genesis,
      alloc: {
        ...genesis.alloc,
        ...await getPredeploy(
          JSON.parse(await Deno.readTextFile("/genesis/predeploy.json")),
          genesis.config.chainId,
        ),
      },
    }),
  );
  await $`geth init --datadir=/data /genesis/genesis.json`.quiet();
  const rollupConfig = JSON.parse(await Deno.readTextFile("/genesis/rollup.json"));
  rollupConfig.genesis.l2.hash =
    (await $`geth --datadir=/data --exec="eth.getBlockByNumber(0).hash" console`
      .quiet()
      .text())
      .slice(1, -1);
  await Deno.writeTextFile("/genesis/rollup.json", JSON.stringify(rollupConfig));
}

if (import.meta.main) await main();
