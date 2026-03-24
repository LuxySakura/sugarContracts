import hre from "hardhat";
import {parseEther, formatEther, parseUnits} from "viem";
const { viem } = await hre.network.connect('baseSepolia');

async function main() {
    // 1. 测试网已部署的合约地址
    const CONTRACT_ADDRESS = "0x2Ef4E7b1B1f4F6fe7dFaEc330da13dC2345c722f";
    const USDT_ADDRESS = "0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673";
    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

    // 2. 获取默认钱包 (Admin)
    const [owner, user] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    console.log("正在连接合约:", CONTRACT_ADDRESS);

    // 3. 获取合约实例
    const presale = await viem.getContractAt(
        "Presale", CONTRACT_ADDRESS
    );

    // // 获取当前价格
    // const price = await presale.read.getLatestETHPrice();
    // console.log("Current ETH/USD Price:", price);
    //
    // // 调用buyWithETH
    // const ethAmountToPay = parseEther("0.001");
    //
    // const tx = await presale.write.buyWithETH({
    //     value: ethAmountToPay ,
    //     account: user.account
    // });

    // 提取资金
    const tx = await presale.write.withdrawFunds([ETH_ADDRESS])
    console.log("✅ 交易发送成功，Hash:", tx);

    await publicClient.waitForTransactionReceipt({ hash: tx });

    // // 技巧：我们可以用 SugarCoin 的 ABI 来连接 USDT，因为大家都是 ERC20，都有 approve 函数
    // const usdcContract = await viem.getContractAt("SugarCoin", USDC_ADDRESS);
    //
    // // 使用USDC购买
    // const amount = parseUnits("0.1", 6);
    // const userUsdtBalance = await usdcContract.read.balanceOf([user.account.address]);
    // console.log(`用户 USDC 余额: ${userUsdtBalance}`);
    //
    // if (userUsdtBalance < amount) {
    //     console.error("❌ 错误: 你的 User 账号中没有足够的 Base Sepolia 测试网 USDC！");
    //     console.log("请先去水龙头领取测试币，或使用 owner 账号转账给 user。");
    //     return;
    // }
    //
    // // --- 🔑 关键步骤 B: 授权 (Approve) ---
    // console.log("正在授权预售合约使用 USDC...");
    // const approveTx = await usdcContract.write.approve([CONTRACT_ADDRESS, amount], {
    //     account: user.account
    // });
    // // 等待授权交易上链
    // await publicClient.waitForTransactionReceipt({ hash: approveTx });
    // console.log("✅ 授权成功！");
    //
    // // --- 🚀 步骤 C: 购买 (Buy) ---
    // console.log("正在执行购买...");
    // try {
    //     const tx = await presale.write.buyWithUSDC([amount], {
    //         account: user.account
    //     });
    //     console.log("✅ 交易发送成功，Hash:", tx);
    //
    //     // 等待交易确认
    //     await publicClient.waitForTransactionReceipt({ hash: tx });
    //
    //     // --- 📊 步骤 D: 检查结果 ---
    //     const newBalance = await sugarCoin.read.balanceOf([user.account.address]);
    //     console.log(`购买后 SugarCoin 余额: ${formatEther(newBalance)} SUGAR`);
    //
    // } catch (error) {
    //     console.error("购买失败:", error);
    // }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
