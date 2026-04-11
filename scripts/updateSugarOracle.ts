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

  const oracleAddress = getAddress(requireEnv("SUGAR_ORACLE_ADDRESS"));
  const targetPriceText = requireEnv("SUGAR_USD_PRICE_PER_TON");
  const targetPrice = parseEther(targetPriceText);

  const oracle = await viem.getContractAt("SugarPriceOracle", oracleAddress);

  const currentSugarUsdPrice = await oracle.read.getLatestSugarUsdPricePerTon();
  const currentNativePrice = await oracle.read.getLatestPrice();

  console.log(`Network: ${connection.networkName}`);
  console.log(`Signer: ${signer.account.address}`);
  console.log(`Oracle: ${oracleAddress}`);
  console.log(
    `Current sugar USD price / ton: ${formatEther(currentSugarUsdPrice)} USD`,
  );
  console.log(
    `Current native price / ton: ${formatEther(currentNativePrice)} ETH`,
  );
  console.log(`Target sugar USD price / ton: ${targetPriceText} USD`);

  const hash = await oracle.write.updateSugarUsdPrice([targetPrice], {
    account: signer.account,
  });
  console.log(`Update tx sent: ${hash}`);

  await publicClient.waitForTransactionReceipt({ hash });

  const updatedSugarUsdPrice = await oracle.read.getLatestSugarUsdPricePerTon();
  const updatedNativePrice = await oracle.read.getLatestPrice();

  console.log("Oracle update confirmed.");
  console.log(
    `Updated sugar USD price / ton: ${formatEther(updatedSugarUsdPrice)} USD`,
  );
  console.log(
    `Updated native price / ton: ${formatEther(updatedNativePrice)} ETH`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
