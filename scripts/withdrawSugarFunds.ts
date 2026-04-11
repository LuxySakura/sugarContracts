import hre from "hardhat";
import { formatEther, formatUnits, getAddress } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBalanceChange(
  reader: () => Promise<bigint>,
  expectedDelta: bigint,
  before: bigint,
  retries = 5,
  delayMs = 1500,
) {
  let current = before;

  for (let attempt = 0; attempt < retries; attempt++) {
    current = await reader();
    if (current - before === expectedDelta) {
      return current;
    }

    if (attempt < retries - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Balance change check failed. Expected delta ${expectedDelta.toString()}, got ${(current - before).toString()}`,
  );
}

async function main() {
  const connection = await hre.network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();

  const tokenAddress = getAddress(requireEnv("SUGAR_TOKEN_ADDRESS"));
  const usdcAddress = getAddress(requireEnv("SUGAR_USDC_ADDRESS"));
  const withdrawTo = getAddress(
    process.env.WITHDRAW_TO?.trim() || signer.account.address,
  );

  const withdrawEth = envBoolean("WITHDRAW_ETH", true);
  const withdrawUsdc = envBoolean("WITHDRAW_USDC", true);

  const sugarToken = await viem.getContractAt("SugarCommodityToken", tokenAddress);
  const usdc = await viem.getContractAt("MockERC20", usdcAddress);
  const usdcDecimals = Number(await usdc.read.decimals());

  console.log(`Network: ${connection.networkName}`);
  console.log(`Signer: ${signer.account.address}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`USDC: ${usdcAddress}`);
  console.log(`Withdraw recipient: ${withdrawTo}`);

  if (withdrawEth) {
    console.log("\n[1] ETH withdrawal");
    const contractEthBalance = await publicClient.getBalance({
      address: sugarToken.address,
    });

    if (contractEthBalance === 0n) {
      console.log("Skipping ETH withdrawal: contract ETH balance is 0.");
    } else {
      const recipientEthBefore = await publicClient.getBalance({
        address: withdrawTo,
      });

      const hash = await sugarToken.write.withdrawFunds([withdrawTo], {
        account: signer.account,
      });
      console.log(`ETH withdraw tx: ${hash}`);

      await publicClient.waitForTransactionReceipt({ hash });

      await waitForBalanceChange(
        () => publicClient.getBalance({ address: withdrawTo }),
        contractEthBalance,
        recipientEthBefore,
      );

      const contractEthAfter = await publicClient.getBalance({
        address: sugarToken.address,
      });

      console.log(`Withdrawn ETH: ${formatEther(contractEthBalance)} ETH`);
      console.log(`Contract ETH balance after: ${formatEther(contractEthAfter)} ETH`);
    }
  }

  if (withdrawUsdc) {
    console.log("\n[2] USDC withdrawal");
    const contractUsdcBalance = await usdc.read.balanceOf([sugarToken.address]);

    if (contractUsdcBalance === 0n) {
      console.log("Skipping USDC withdrawal: contract USDC balance is 0.");
    } else {
      const recipientUsdcBefore = await usdc.read.balanceOf([withdrawTo]);

      const hash = await sugarToken.write.withdrawERC20([usdc.address, withdrawTo], {
        account: signer.account,
      });
      console.log(`USDC withdraw tx: ${hash}`);

      await publicClient.waitForTransactionReceipt({ hash });

      await waitForBalanceChange(
        () => usdc.read.balanceOf([withdrawTo]),
        contractUsdcBalance,
        recipientUsdcBefore,
      );

      const contractUsdcAfter = await usdc.read.balanceOf([sugarToken.address]);

      console.log(
        `Withdrawn USDC: ${formatUnits(contractUsdcBalance, usdcDecimals)} USDC`,
      );
      console.log(
        `Contract USDC balance after: ${formatUnits(contractUsdcAfter, usdcDecimals)} USDC`,
      );
    }
  }

  console.log("\nWithdrawal checks completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
