import { type Address } from 'viem';

// 1. 统一读取并验证环境变量 (Fail Fast 原则)
const projectId = "7b203c4a25b9777012250f76e180ff00"
if (!projectId) {
  throw new Error('Project ID is not defined in .env')
}

// 2. 导出环境配置 (供 AppKitProvider 使用)
export const ENV_CONFIG = {
  projectId,
  isDev: process.env.NODE_ENV === 'development',
}

// 3. 导出合约相关常量
export const CONTRACTS = {
  presaleContractAddress: "0x512C748222Adc10F251655a16812199D44938a2a", // 预售合约地址
}

// Base ChainLink ETH/USD 价格数据
export const PRICE_FEED = {
  testnetAddress: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1', // Base Sepolia 测试网 price feed
  mainnetAddress: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' // Base Mainnet 测试网 price feed地址
}

const BUY_WITH_USDT_ABI = [
  {
    inputs: [{ name: '_usdtAmount', type: 'uint256' }],
    name: 'buyWithUSDT',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  }
] as const

const BUY_WITH_USDC_ABI = [
  {
    inputs: [{ name: '_usdcAmount', type: 'uint256' }],
    name: 'buyWithUSDC',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  }
] as const

const BUY_WITH_ETH_ABI = [
  {
    inputs: [],
    name: 'buyWithETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  }
] as const

export const GET_ETH_PRICE_ABI = [
  {
    "inputs": [],
    "name": "getTokensAmountPerETH",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const

export const GET_TOKEN_SOLD_ABI = [
  {
    "inputs": [],
    "name": "totalTokensSold",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const

export const SUPPORTED_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet 正式币地址 as Address, // Base Native USDC
    decimals: 6, 
    abi: BUY_WITH_USDC_ABI,
    icon: 'usdc.svg'
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address, // Base Mainnet USDT 主网地址
    decimals: 6,
    abi: BUY_WITH_USDT_ABI,
    icon: 'usdt.svg'
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x4200000000000000000000000000000000000006' as Address, // Base Mainnet ETH 主网地址
    decimals: 18,
    abi: BUY_WITH_ETH_ABI,
    icon: 'eth.svg'
  }
]

export const TOKEN_CONFIG = {
  address: "0x17E0a4B5a62C0fF8FeF8F09c4D0F18574C7AD22D" as Address,
  symbol: "SUGAR",
  decimals: 18,
  image: "https://www.sugarcoin.online//logo.svg",
  chainId: 8453,
};