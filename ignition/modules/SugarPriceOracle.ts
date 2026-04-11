import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SugarPriceOracleModule = buildModule("SugarPriceOracleModule", (m) => {
  const defaultAdmin = m.getAccount(0);
  const updaterAddress = m.getParameter(
    "updaterAddress",
    "0x0000000000000000000000000000000000000001",
  );
  const nativeUsdFeedAddress = m.getParameter(
    "nativeUsdFeedAddress",
    "0x0000000000000000000000000000000000000002",
  );
  const initialSugarUsdPricePerTon = m.getParameter(
    "initialSugarUsdPricePerTon",
    600000000000000000000n,
  );
  const initialMaxSugarPriceAge = m.getParameter(
    "initialMaxSugarPriceAge",
    86400n,
  );
  const initialMaxNativePriceAge = m.getParameter(
    "initialMaxNativePriceAge",
    7200n,
  );

  const sugarPriceOracle = m.contract("SugarPriceOracle", [
    defaultAdmin,
    updaterAddress,
    nativeUsdFeedAddress,
    initialSugarUsdPricePerTon,
    initialMaxSugarPriceAge,
    initialMaxNativePriceAge,
  ]);

  return { sugarPriceOracle };
});

export default SugarPriceOracleModule;
