const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function requireAddressEnv(name) {
  const value = requireEnv(name);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return value;
}

loadDotEnv();

const tokenAddress = requireAddressEnv("SEPOLIA_TOKEN_ADDRESS");
const hardhatBin = resolve(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "hardhat.cmd" : "hardhat",
);

const result = spawnSync(
  hardhatBin,
  [
    "verify",
    "--network",
    "baseSepolia",
    "--contract",
    "contracts/SugarToken.sol:SugarCommodityToken",
    "--constructor-args-path",
    "scripts/verifySugarTokenBaseSepoliaArgs.cjs",
    tokenAddress,
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: true,
  },
);

if (result.error !== undefined) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
