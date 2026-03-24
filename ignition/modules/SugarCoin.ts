// ignition/modules/SugarCoin.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SugarCoinModule = buildModule(
    "SugarCoinModule",
    (m) => {
        // 1. 定义参数
        // getParameter("参数名", 默认值)
        const deployer = m.getAccount(0);

        // 2. 部署合约
        const sugarCoin = m.contract("SugarCoin", [deployer]);

        // 4. 返回合约实例
        return { sugarCoin };
});

export default SugarCoinModule;