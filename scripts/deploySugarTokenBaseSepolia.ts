import hre from "hardhat";
import { getAddress, type Address, type PublicClient } from "viem";

const DEFAULT_TOKENS_PER_TON = 1n;
const CODE_POLL_INTERVAL_MS = 2_000;
const CODE_POLL_MAX_ATTEMPTS = 30;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getOptionalPositiveBigInt(name: string, defaultValue: bigint): bigint {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${name} must be greater than 0.`);
  }

  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContractCode(
  publicClient: PublicClient,
  address: Address,
): Promise<void> {
  for (let attempt = 1; attempt <= CODE_POLL_MAX_ATTEMPTS; attempt++) {
    const code = await publicClient.getCode({ address });
    if (code !== undefined && code !== "0x") {
      return;
    }

    if (attempt < CODE_POLL_MAX_ATTEMPTS) {
      console.log(
        `Waiting for contract code at ${address} (${attempt}/${CODE_POLL_MAX_ATTEMPTS})...`,
      );
      await sleep(CODE_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `No contract code found at ${address} after ${CODE_POLL_MAX_ATTEMPTS} attempts. The transaction may still be pending, the RPC may be stale, or the deployment may have failed.`,
  );
}

async function main() {
  const connection = await hre.network.connect();
  if (connection.networkName !== "baseSepolia") {
    throw new Error(
      `This deployment script is for baseSepolia only. Current network: ${connection.networkName}.`,
    );
  }

  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  if (deployer === undefined) {
    throw new Error(
      "No wallet client configured. Set SEPOLIA_PRIVATE_KEY before running this Base Sepolia deployment script.",
    );
  }

  const oracleAddress = getAddress(requireEnv("SEPOLIA_SUGAR_ORACLE_ADDRESS"));
  const usdcAddress = getAddress(requireEnv("SEPOLIA_USDC_ADDRESS"));
  const usdtAddress = getAddress(requireEnv("SEPOLIA_USDT_ADDRESS"));
  const tokensPerTon = getOptionalPositiveBigInt(
    "SUGAR_TOKENS_PER_TON",
    DEFAULT_TOKENS_PER_TON,
  );

  console.log("Deploying SugarCommodityToken...");
  console.log(`Network: ${connection.networkName}`);
  console.log(`Deployer/default admin: ${deployer.account.address}`);
  console.log(`Oracle: ${oracleAddress}`);
  console.log(`USDC: ${usdcAddress}`);
  console.log(`USDT: ${usdtAddress}`);
  console.log(`Tokens per ton: ${tokensPerTon}`);

  const sugarToken = await viem.deployContract("SugarCommodityToken", [
    deployer.account.address,
    oracleAddress,
    usdcAddress,
    usdtAddress,
    tokensPerTon,
  ]);

  console.log(`Deployment returned address: ${sugarToken.address}`);
  await waitForContractCode(publicClient, sugarToken.address);

  const defaultAdminRole = await sugarToken.read.DEFAULT_ADMIN_ROLE();
  const hasDefaultAdminRole = await sugarToken.read.hasRole([
    defaultAdminRole,
    deployer.account.address,
  ]);

  console.log("SugarCommodityToken deployed.");
  console.log(`Address: ${sugarToken.address}`);
  console.log(`Name: ${await sugarToken.read.name()}`);
  console.log(`Symbol: ${await sugarToken.read.symbol()}`);
  console.log(`Oracle: ${await sugarToken.read.sugarOracle()}`);
  console.log(`USDC: ${await sugarToken.read.usdc()}`);
  console.log(`USDT: ${await sugarToken.read.usdt()}`);
  console.log(`Tokens per ton: ${await sugarToken.read.tokensPerTon()}`);
  console.log(
    `Default admin granted: ${hasDefaultAdminRole ? "yes" : "no"}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
