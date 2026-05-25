import hre from "hardhat";
import { formatEther, getAddress, parseEther } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

async function main() {
  const connection = await hre.network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();
  if (signer === undefined) {
    throw new Error(
      "No wallet client configured. Set SEPOLIA_PRIVATE_KEY before running the Base Sepolia script.",
    );
  }

  const oracleAddress = getAddress(requireEnv("SUGAR_ORACLE_ADDRESS"));
  const targetPriceText = requireEnv("SUGAR_USD_PRICE_PER_TON");
  const targetPrice = parseEther(targetPriceText);
  if (targetPrice <= 0n) {
    throw new Error("SUGAR_USD_PRICE_PER_TON must be greater than 0.");
  }

  const oracle = await viem.getContractAt("SugarPriceOracle", oracleAddress);
  const updaterRole = await oracle.read.PRICE_UPDATER_ROLE();
  const canUpdate = await oracle.read.hasRole([
    updaterRole,
    signer.account.address,
  ]);
  if (!canUpdate) {
    throw new Error(
      `Signer ${signer.account.address} does not have PRICE_UPDATER_ROLE on ${oracleAddress}.`,
    );
  }

  // Read raw state so stale oracle data does not block the update transaction.
  const currentSugarUsdPrice =
    (await oracle.read.sugarUsdPricePerTon()) as bigint;
  const currentUpdatedAt = (await oracle.read.sugarPriceUpdatedAt()) as bigint;

  console.log(`Network: ${connection.networkName}`);
  console.log(`Signer: ${signer.account.address}`);
  console.log(`Oracle: ${oracleAddress}`);
  console.log(
    `Current sugar USD price / ton: ${formatEther(currentSugarUsdPrice)} USD`,
  );
  console.log(`Current sugar price updated at: ${currentUpdatedAt}`);
  console.log(`Target sugar USD price / ton: ${targetPriceText} USD`);

  const hash = await oracle.write.updateSugarUsdPrice([targetPrice], {
    account: signer.account,
  });
  console.log(`Update tx sent: ${hash}`);

  await publicClient.waitForTransactionReceipt({ hash });

  const updatedSugarUsdPrice =
    (await oracle.read.sugarUsdPricePerTon()) as bigint;
  const updatedAt = (await oracle.read.sugarPriceUpdatedAt()) as bigint;

  console.log("Oracle update confirmed.");
  console.log(
    `Updated sugar USD price / ton: ${formatEther(updatedSugarUsdPrice)} USD`,
  );
  console.log(`Updated sugar price at: ${updatedAt}`);

  try {
    const updatedNativePrice = (await oracle.read.getLatestPrice()) as bigint;
    console.log(
      `Updated native price / ton: ${formatEther(updatedNativePrice)} ETH`,
    );
  } catch (error) {
    console.warn(
      "Oracle price was updated, but native price conversion is unavailable:",
      error,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
