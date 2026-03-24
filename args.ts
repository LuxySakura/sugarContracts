import { PRICE_FEED } from "./config/index.js";

const sugarCoinAddress = "0x17E0a4B5a62C0fF8FeF8F09c4D0F18574C7AD22D";
const usdtAddress = "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2";
const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const priceFeedAddress = PRICE_FEED.mainnetAddress;
const args = [
    sugarCoinAddress,
    usdtAddress,
    usdcAddress,
    priceFeedAddress
]

export default args;
