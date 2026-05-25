import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SugarTokenModule = buildModule("SugarTokenModule", (m) => {
  const defaultAdmin = m.getAccount(0);
  const oracleAddress = m.getParameter(
    "oracleAddress",
    "0x0000000000000000000000000000000000000001",
  );
  const usdcAddress = m.getParameter(
    "usdcAddress",
    "0x0000000000000000000000000000000000000002",
  );
  const usdtAddress = m.getParameter(
    "usdtAddress",
    "0x0000000000000000000000000000000000000003",
  );
  const tokensPerTon = m.getParameter("tokensPerTon", 1000n);

  const sugarToken = m.contract("SugarCommodityToken", [
    defaultAdmin,
    oracleAddress,
    usdcAddress,
    usdtAddress,
    tokensPerTon,
  ]);

  return { sugarToken };
});

export default SugarTokenModule;
