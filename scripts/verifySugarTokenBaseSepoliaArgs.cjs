function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getAddressEnv(name) {
  const value = requireEnv(name);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return value;
}

function getPositiveBigIntEnv(name) {
  const value = requireEnv(name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${name} must be greater than 0.`);
  }

  return parsed;
}

module.exports = [
  getAddressEnv("SEPOLIA_TOKEN_ADMIN_ADDRESS"),
  getAddressEnv("SEPOLIA_SUGAR_ORACLE_ADDRESS"),
  getAddressEnv("SEPOLIA_USDC_ADDRESS"),
  getAddressEnv("SEPOLIA_USDT_ADDRESS"),
  getPositiveBigIntEnv("SUGAR_TOKENS_PER_TON"),
];
