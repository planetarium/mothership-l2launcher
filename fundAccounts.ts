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
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ETHER_WEI_UNIT = 10n ** BigInt(etherUnits.wei);

export interface Account {
  name: string;
  address: Hex;
  balance: bigint;
  recommendedBalance: bigint;
}

export const fundAccounts = async (accounts: Account[], env: Record<string, string>) => {
  let balanceWarningAccounts = accounts.filter((account) =>
    account.balance < account.recommendedBalance
  );

  if (balanceWarningAccounts.length === 0) {
    console.log("Account balances are sufficient.");
  } else {
    console.log("OP Stack requires accounts with L1 native token funded in order to be launched.");
    console.log("These accounts have lower balance than recommended balance:");
    for (const { name, balance, recommendedBalance } of balanceWarningAccounts) {
      console.log(
        `  ${name}: ${formatEther(balance)} (recommended: ${formatEther(recommendedBalance)})`,
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
    if (opt !== "continue") {
      const publicClient = createPublicClient({ transport: http(env.L1_RPC) });

      if (opt === "auto") {
        const adminAccount = accounts[0];
        const requiredAmount = balanceWarningAccounts.reduce(
          (prev, curr) => prev + curr.recommendedBalance - curr.balance,
          0n,
        );
        const requiredBalance = requiredAmount + adminAccount.balance;

        console.log(
          `Send ${
            formatEther(requiredAmount)
          } L1 native token to Admin account: ${adminAccount.address}`,
        );
        const spinner = new Kia("Waiting for transfer...").start();
        let prevBalance = adminAccount.balance;
        do {
          const balance = await publicClient.getBalance({ address: adminAccount.address });
          if (balance !== prevBalance) {
            const msg = `Admin account balance change detected: ${formatEther(balance)}`;
            if (balance >= requiredBalance) {
              spinner.succeed(msg);
              adminAccount.balance = balance;
            } else {
              spinner.warn(msg + ` (need ${formatEther(requiredBalance - balance)} more)`).start();
            }
          }
          prevBalance = balance;
          await delay(4000);
        } while (prevBalance < requiredBalance);

        const walletClient = createWalletClient({
          transport: http(env.L1_RPC),
          account: privateKeyToAccount(env.ADMIN_KEY as Hex),
          chain: { id: await publicClient.getChainId() } as Chain,
        });

        spinner.start("Sending transactions...");
        for await (const account of balanceWarningAccounts.slice(1, undefined)) {
          await walletClient.sendTransaction({
            to: account.address,
            value: account.recommendedBalance - account.balance,
          });
        }
        spinner.succeed();
      }

      const spinner = new Kia("Waiting for transfer...").start();
      while (balanceWarningAccounts.length > 0) {
        balanceWarningAccounts = (await Promise.all(balanceWarningAccounts.map(async (account) => {
          const balance = await publicClient.getBalance({ address: account.address });
          if (balance !== account.balance) {
            const msg = `${account.name} balance change detected: ${formatEther(balance)}`;
            if (balance >= account.recommendedBalance) {
              spinner.succeed(msg);
            } else {
              spinner.warn(
                msg + ` (recommended balance: ${formatEther(account.recommendedBalance)})`,
              );
            }
            spinner.start();
          }
          return { ...account, balance };
        }))).filter((account) => account.balance < account.recommendedBalance);
        await delay(4000);
      }
      spinner.succeed("All accounts are funded enough!");
    }
  }
};
