import { delay } from "std/async/delay.ts";

import { Select } from "cliffy/prompt/mod.ts";
import Kia from "kia";
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  etherUnits,
  formatEther,
  type Hex,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ETHER_WEI_UNIT = 10n ** BigInt(etherUnits.wei);

export interface Account {
  name: string;
  address: Hex;
  balance: bigint;
  recommendedBalance: bigint;
}

export const listAndFundAccounts = async (accounts: Account[], env: Record<string, string>) => {
  const balanceWarningAccounts = accounts.filter((account) =>
    account.balance < account.recommendedBalance
  );

  if (balanceWarningAccounts.length === 0) {
    console.log("Account addresses:");
    console.log(accounts.map(({ name, address }) => `  ${name}: ${address}`).join("\n"));
    console.log("Account balances are sufficient.");

    return;
  }

  console.log("OP Stack requires accounts with L1 native token funded in order to be launched.");
  console.log("These accounts have lower balance than recommended balance:");
  for (const { name, address, balance, recommendedBalance } of balanceWarningAccounts) {
    console.log(
      `  ${name} (${address}): ${formatEther(balance)} (recommended: ${
        formatEther(recommendedBalance)
      })`,
    );
  }

  const opt = await Select.prompt({
    message: "Please choose:",
    options: [
      { name: "Automated funding", value: "auto" },
      { name: "Manual funding", value: "manual" },
      { name: "Continue without funding", value: "continue" },
    ],
  });

  if (opt === "continue") return;

  const publicClient = createPublicClient({ transport: http(env.L1_RPC) });

  if (opt === "auto") {
    const adminAccount = { ...accounts[0] };
    const requiredAmount = balanceWarningAccounts.reduce(
      (prev, curr) => prev + curr.recommendedBalance - curr.balance,
      0n,
    );
    adminAccount.recommendedBalance = requiredAmount + adminAccount.balance;

    console.log(
      `Send ${
        formatEther(requiredAmount)
      } L1 native token to Admin account: ${adminAccount.address}`,
    );

    await waitForTransfer([adminAccount], publicClient);
    balanceWarningAccounts.shift();

    const walletClient = createWalletClient({
      transport: http(env.L1_RPC),
      account: privateKeyToAccount(env.ADMIN_KEY as Hex),
      chain: { id: await publicClient.getChainId() } as Chain,
    });

    const spinner = new Kia("Sending transactions...").start();
    for await (const account of balanceWarningAccounts) {
      await walletClient.sendTransaction({
        to: account.address,
        value: account.recommendedBalance - account.balance,
      });
    }
    spinner.succeed(spinner.getText() + " Done!");
  }

  await waitForTransfer(balanceWarningAccounts, publicClient);
  console.log("All accounts are funded enough!");
};

const waitForTransfer = async (accounts: Account[], publicClient: PublicClient) => {
  const getMessage = () => `Waiting for ${accounts.map((acc) => acc.name).join(", ")} transfer...`;

  const spinner = new Kia(getMessage()).start();

  while (true) {
    accounts = (await Promise.all(accounts.map(async (account) => {
      const balance = await publicClient.getBalance({ address: account.address });

      if (balance !== account.balance) {
        const msg = `${account.name} balance changed: ${formatEther(balance)}`;
        if (balance >= account.recommendedBalance) {
          spinner.succeed(msg);
        } else {
          spinner.warn(
            msg + ` (requires ${formatEther(account.recommendedBalance - balance)} more)`,
          );
        }
      }

      return { ...account, balance };
    }))).filter((account) => account.balance < account.recommendedBalance);

    if (accounts.length === 0) break;
    spinner.start(getMessage());
    await delay(4000);
  }

  spinner.stop();
  return accounts;
};
