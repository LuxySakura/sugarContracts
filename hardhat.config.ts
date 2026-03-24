import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatViemAssertions from "@nomicfoundation/hardhat-viem-assertions";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatIgnitionViemPlugin from "@nomicfoundation/hardhat-ignition-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

import * as dotenv from "dotenv";
dotenv.config();

const adminKey = process.env.PRIVATE_KEY_ADMIN || "";

export default defineConfig({
  plugins: [
    hardhatViem,
    hardhatViemAssertions,
    hardhatNodeTestRunner,
    hardhatNetworkHelpers,
    hardhatIgnitionViemPlugin,
    hardhatVerify,
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.27",
      },
      production: {
        version: "0.8.27",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: adminKey !== "" ? [adminKey] : [],
      chainId: 84532,
    },
    base: {
      type: "http",
      chainType: "op",
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: adminKey !== "" ? [adminKey] : [],
      chainId: 8453,
    },
  },
  chainDescriptors: {
    84532: {
      name: "baseSepolia",
      blockExplorers: {
        etherscan: {
          name: "BaseScan",
          url: "https://sepolia.basescan.org",
          apiUrl: "https://api-sepolia.basescan.org/api",
        },
      },
    },
    8453: {
      name: "base",
      blockExplorers: {
        etherscan: {
          name: "Base Scan",
          url: "https://basescan.org",
          apiUrl: "https://api.basescan.org/api",
        },
      },
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.BASESCAN_API_KEY || "",
    }
  }
});
