import hre from "hardhat";
import {parseEther, formatEther, parseUnits} from "viem";
const { viem } = await hre.network.connect('base');

async function main() {
    // 1. 测试网已部署的合约地址
    const CONTRACT_ADDRESS = "0x17E0a4B5a62C0fF8FeF8F09c4D0F18574C7AD22D";
    const PRESAEL_ADDRESS = "0x512C748222Adc10F251655a16812199D44938a2a"

    // 2. 获取默认钱包 (Admin)
    const [owner] = await viem.getWalletClients();
    // const publicClient = await viem.getPublicClient();

    console.log("正在连接合约:", CONTRACT_ADDRESS);

    // 3. 获取合约实例
    const sugarCoin = await viem.getContractAt(
        "SugarCoin", CONTRACT_ADDRESS
    );

    const presale = await viem.getContractAt(
        "Presale", PRESAEL_ADDRESS
    );

    // // 获取转账权限
    // const TRANSFER_ROLE = await sugarCoin.read.TRANSFER_ROLE();
    //
    // // 赋予 预售合约 转账权限
    // await sugarCoin.write.grantRole([TRANSFER_ROLE, presale.address]);

    // 给预售合约转入代币
    const tokensToSell = parseEther("200000000");
    await sugarCoin.write.transfer([presale.address, tokensToSell]);

    const tokenPrice = parseEther("0.08");
    await presale.write.startRound([1, tokenPrice]);

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
