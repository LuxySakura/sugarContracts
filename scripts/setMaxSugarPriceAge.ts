import hre from "hardhat";
import { getAddress } from "viem";

const DEFAULT_MAX_SUGAR_PRICE_AGE_SECONDS = 90n * 24n * 60n * 60n;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getTargetAgeSeconds(): bigint {
  const value = process.env.SUGAR_MAX_PRICE_AGE_SECONDS?.trim();
  if (value === undefined || value === "") {
    return DEFAULT_MAX_SUGAR_PRICE_AGE_SECONDS;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("SUGAR_MAX_PRICE_AGE_SECONDS must be a positive integer.");
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error("SUGAR_MAX_PRICE_AGE_SECONDS must be greater than 0.");
  }

  return parsed;
}

function formatDuration(seconds: bigint): string {
  const days = seconds / 86400n;
  const remainder = seconds % 86400n;
  if (remainder === 0n) {
    return `${days} days`;
  }

  return `${seconds} seconds`;
}

function getPrivateKeyEnvName(networkName: string): string {
  if (networkName === "baseSepolia" || networkName === "sepolia") {
    return "SEPOLIA_PRIVATE_KEY";
  }

  if (networkName === "base") {
    return "PRIVATE_KEY_ADMIN";
  }

  return "the private key required by this network";
}

async function main() {
  const connection = await hre.network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();
  if (signer === undefined) {
    const privateKeyEnvName = getPrivateKeyEnvName(connection.networkName);
    throw new Error(
      `No wallet client configured. Set ${privateKeyEnvName} before running this script on ${connection.networkName}.`,
    );
  }

  const oracleAddress = getAddress(requireEnv("SUGAR_ORACLE_ADDRESS"));
  const targetAge = getTargetAgeSeconds();

  const oracle = await viem.getContractAt("SugarPriceOracle", oracleAddress);
  const defaultAdminRole = await oracle.read.DEFAULT_ADMIN_ROLE();
  const isAdmin = await oracle.read.hasRole([
    defaultAdminRole,
    signer.account.address,
  ]);
  if (!isAdmin) {
    throw new Error(
      `Signer ${signer.account.address} does not have DEFAULT_ADMIN_ROLE on ${oracleAddress}.`,
    );
  }

  const currentAge = (await oracle.read.maxSugarPriceAge()) as bigint;

  console.log(`Network: ${connection.networkName}`);
  console.log(`Signer: ${signer.account.address}`);
  console.log(`Oracle: ${oracleAddress}`);
  console.log(
    `Current max sugar price age: ${currentAge} seconds (${formatDuration(currentAge)})`,
  );
  console.log(
    `Target max sugar price age: ${targetAge} seconds (${formatDuration(targetAge)})`,
  );

  if (currentAge === targetAge) {
    console.log("No update needed.");
    return;
  }

  const hash = await oracle.write.setMaxSugarPriceAge([targetAge], {
    account: signer.account,
  });
  console.log(`Update tx sent: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Update confirmed in block: ${receipt.blockNumber}`);

  const updatedAge = (await oracle.read.maxSugarPriceAge()) as bigint;
  console.log(
    `Updated max sugar price age: ${updatedAge} seconds (${formatDuration(updatedAge)})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
