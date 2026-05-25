// ignition/modules/SugarCoin.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SugarCoinModule = buildModule(
    "SugarCoinModule",
    (m) => {
        // 1. 定义参数
        // getParameter("参数名", 默认值)
        const deployer = m.getAccount(0);
        const tokenName = m.getParameter("tokenName", "SugarCoin");
        const tokenSymbol = m.getParameter("tokenSymbol", "SUGAR");
        const initialSupplyTokens = m.getParameter("initialSupplyTokens", 2000000000n);

        // 2. 部署合约
        const sugarCoin = m.contract("SugarCoin", [
            deployer,
            tokenName,
            tokenSymbol,
            initialSupplyTokens,
        ]);

        // 4. 返回合约实例
        return { sugarCoin };
});

export default SugarCoinModule;
