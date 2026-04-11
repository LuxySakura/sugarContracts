import hre from "hardhat";
import {
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
} from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

function envDecimal(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function scaleFrom18(amount18: bigint, targetDecimals: bigint): bigint {
  if (targetDecimals === 18n) {
    return amount18;
  }

  if (targetDecimals < 18n) {
    const divisor = 10n ** (18n - targetDecimals);
    return (amount18 + divisor - 1n) / divisor;
  }

  return amount18 * 10n ** (targetDecimals - 18n);
}

function assertCondition(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAssertion(
  assertion: () => Promise<void>,
  retries = 5,
  delayMs = 1500,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

async function main() {
  const connection = await hre.network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();

  const oracleAddress = getAddress(requireEnv("SUGAR_ORACLE_ADDRESS"));
  const tokenAddress = getAddress(requireEnv("SUGAR_TOKEN_ADDRESS"));
  const usdcAddress = getAddress(requireEnv("SUGAR_USDC_ADDRESS"));

  const usdSpendText = envDecimal(
    "TEST_USD_SPEND",
    envDecimal("TEST_USDC_SPEND", "0.1"),
  );
  const buyAmountText = envDecimal("TEST_TOKEN_BUY_AMOUNT", "");
  const redeemAmountText = envDecimal("TEST_REDEEM_AMOUNT", "0.01");
  const capacityText = envDecimal("TEST_CAPACITY", "1000000");

  const runUsdcFlow = envBoolean("RUN_USDC_FLOW", true);
  const runEthFlow = envBoolean("RUN_ETH_FLOW", true);
  const runRedeem = envBoolean("RUN_REDEEM", true);
  const runWithdrawals = envBoolean("RUN_WITHDRAWALS", false);

  const sugarOracle = await viem.getContractAt("SugarPriceOracle", oracleAddress);
  const sugarToken = await viem.getContractAt("SugarCommodityToken", tokenAddress);
  const usdc = await viem.getContractAt("MockERC20", usdcAddress);

  const redeemAmount = parseEther(redeemAmountText);
  const targetCapacity = parseEther(capacityText);
  const tokensPerTon = await sugarToken.read.tokensPerTon();
  const tokenDecimals = BigInt(await sugarToken.read.decimals());
  const usdcDecimals = BigInt(await usdc.read.decimals());
  const usdSpend18 =
    buyAmountText === "" ? parseEther(usdSpendText) : undefined;

  console.log(`Network: ${connection.networkName}`);
  console.log(`Signer: ${signer.account.address}`);
  console.log(`Oracle: ${oracleAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`USDC: ${usdcAddress}`);

  console.log("\n[1] Reading oracle state");
  const sugarUsdPricePerTon = await sugarOracle.read.getLatestSugarUsdPricePerTon();
  const nativeUsdPrice = await sugarOracle.read.getLatestNativeUsdPrice();
  const nativePricePerTon = await sugarOracle.read.getLatestPrice();
  const buyAmount =
    usdSpend18 !== undefined
      ? (usdSpend18 * tokensPerTon * 10n ** tokenDecimals) / sugarUsdPricePerTon
      : parseEther(buyAmountText);

  console.log(
    `Sugar USD price / ton: ${formatEther(sugarUsdPricePerTon)} USD`,
  );
  console.log(`ETH/USD price: ${formatEther(nativeUsdPrice)} USD`);
  console.log(`Sugar native price / ton: ${formatEther(nativePricePerTon)} ETH`);

  console.log("\n[2] Ensuring token capacity");
  const currentCapacity = await sugarToken.read.maxMintableCapacity();
  if (currentCapacity < targetCapacity) {
    console.log(
      `Updating capacity from ${formatEther(currentCapacity)} to ${formatEther(targetCapacity)}`,
    );
    const capacityHash = await sugarToken.write.updateCapacity([targetCapacity], {
      account: signer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: capacityHash });
  } else {
    console.log(`Capacity already sufficient: ${formatEther(currentCapacity)}`);
  }

  const usdcCost18 =
    (buyAmount * sugarUsdPricePerTon) /
    (tokensPerTon * 10n ** tokenDecimals);
  const usdcCost = scaleFrom18(usdcCost18, usdcDecimals);
  const ethCost =
    (buyAmount * nativePricePerTon) /
    (tokensPerTon * 10n ** tokenDecimals);

  console.log("\n[3] Calculated purchase costs");
  console.log(`Token amount to buy: ${formatEther(buyAmount)} SUGAR`);
  console.log(
    `Required USDC: ${formatUnits(usdcCost, Number(usdcDecimals))} USDC`,
  );
  console.log(`Required ETH: ${formatEther(ethCost)} ETH`);

  if (runUsdcFlow) {
    console.log("\n[4] Testing USDC purchase flow");

    const usdcBalanceBefore = await usdc.read.balanceOf([signer.account.address]);
    assertCondition(
      usdcBalanceBefore >= usdcCost,
      `Insufficient USDC balance. Need ${formatUnits(usdcCost, Number(usdcDecimals))} USDC, have ${formatUnits(usdcBalanceBefore, Number(usdcDecimals))} USDC`,
    );

    const allowance = await usdc.read.allowance([
      signer.account.address,
      sugarToken.address,
    ]);

    if (allowance < usdcCost) {
      console.log("Approving USDC spending...");
      const approveHash = await usdc.write.approve([sugarToken.address, usdcCost], {
        account: signer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const tokenBalanceBefore = await sugarToken.read.balanceOf([
      signer.account.address,
    ]);
    const contractUsdcBefore = await usdc.read.balanceOf([sugarToken.address]);

    const buyHash = await sugarToken.write.buyTokensWithUSDC([buyAmount], {
      account: signer.account,
    });
    const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });

    await waitForAssertion(async () => {
      const tokenBalanceAfter = await sugarToken.read.balanceOf([
        signer.account.address,
      ]);
      const contractUsdcAfter = await usdc.read.balanceOf([sugarToken.address]);

      assertCondition(
        tokenBalanceAfter - tokenBalanceBefore === buyAmount,
        `USDC purchase did not mint the expected SUGAR amount. Expected ${formatEther(buyAmount)}, got ${formatEther(tokenBalanceAfter - tokenBalanceBefore)}. Tx: ${buyReceipt.transactionHash}`,
      );
      assertCondition(
        contractUsdcAfter - contractUsdcBefore === usdcCost,
        `USDC purchase did not transfer the expected USDC amount. Expected ${formatUnits(usdcCost, Number(usdcDecimals))}, got ${formatUnits(contractUsdcAfter - contractUsdcBefore, Number(usdcDecimals))}. Tx: ${buyReceipt.transactionHash}`,
      );
    });

    console.log("USDC purchase passed.");
  }

  if (runEthFlow) {
    console.log("\n[5] Testing ETH purchase flow");

    const tokenBalanceBefore = await sugarToken.read.balanceOf([
      signer.account.address,
    ]);
    const contractEthBefore = await publicClient.getBalance({
      address: sugarToken.address,
    });

    const buyHash = await sugarToken.write.buyTokensWithETH([buyAmount], {
      account: signer.account,
      value: ethCost,
    });
    const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });

    await waitForAssertion(async () => {
      const tokenBalanceAfter = await sugarToken.read.balanceOf([
        signer.account.address,
      ]);
      const contractEthAfter = await publicClient.getBalance({
        address: sugarToken.address,
      });

      assertCondition(
        tokenBalanceAfter - tokenBalanceBefore === buyAmount,
        `ETH purchase did not mint the expected SUGAR amount. Expected ${formatEther(buyAmount)}, got ${formatEther(tokenBalanceAfter - tokenBalanceBefore)}. Tx: ${buyReceipt.transactionHash}`,
      );
      assertCondition(
        contractEthAfter - contractEthBefore === ethCost,
        `ETH purchase did not retain the expected ETH amount. Expected ${formatEther(ethCost)}, got ${formatEther(contractEthAfter - contractEthBefore)}. Tx: ${buyReceipt.transactionHash}`,
      );
    });

    console.log("ETH purchase passed.");
  }

  if (runRedeem) {
    console.log("\n[6] Testing redemption flow");

    const tokenBalanceBefore = await sugarToken.read.balanceOf([
      signer.account.address,
    ]);
    assertCondition(
      tokenBalanceBefore >= redeemAmount,
      `Insufficient SUGAR balance to redeem ${formatEther(redeemAmount)} SUGAR`,
    );

    const totalSupplyBefore = await sugarToken.read.totalSupply();
    const orderId = `TEST-${Date.now()}`;

    const redeemHash = await sugarToken.write.redeemPhysicalSugar(
      [redeemAmount, orderId],
      { account: signer.account },
    );
    const redeemReceipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });

    await waitForAssertion(async () => {
      const tokenBalanceAfter = await sugarToken.read.balanceOf([
        signer.account.address,
      ]);
      const totalSupplyAfter = await sugarToken.read.totalSupply();

      assertCondition(
        tokenBalanceBefore - tokenBalanceAfter === redeemAmount,
        `Redeem did not burn the expected SUGAR amount. Expected ${formatEther(redeemAmount)}, got ${formatEther(tokenBalanceBefore - tokenBalanceAfter)}. Tx: ${redeemReceipt.transactionHash}`,
      );
      assertCondition(
        totalSupplyBefore - totalSupplyAfter === redeemAmount,
        `Redeem did not reduce total supply by the expected amount. Expected ${formatEther(redeemAmount)}, got ${formatEther(totalSupplyBefore - totalSupplyAfter)}. Tx: ${redeemReceipt.transactionHash}`,
      );
    });

    console.log(`Redemption passed. Delivery order id: ${orderId}`);
  }

  if (runWithdrawals) {
    console.log("\n[7] Testing withdrawal flow");

    const contractEthBalance = await publicClient.getBalance({
      address: sugarToken.address,
    });
    if (contractEthBalance > 0n) {
      const withdrawEthHash = await sugarToken.write.withdrawFunds(
        [signer.account.address],
        { account: signer.account },
      );
      await publicClient.waitForTransactionReceipt({ hash: withdrawEthHash });
      console.log(`ETH withdrawal passed: ${formatEther(contractEthBalance)} ETH`);
    } else {
      console.log("Skipping ETH withdrawal: no ETH in contract.");
    }

    const contractUsdcBalance = await usdc.read.balanceOf([sugarToken.address]);
    if (contractUsdcBalance > 0n) {
      const withdrawUsdcHash = await sugarToken.write.withdrawERC20(
        [usdc.address, signer.account.address],
        { account: signer.account },
      );
      await publicClient.waitForTransactionReceipt({ hash: withdrawUsdcHash });
      console.log(
        `USDC withdrawal passed: ${formatUnits(contractUsdcBalance, Number(usdcDecimals))} USDC`,
      );
    } else {
      console.log("Skipping USDC withdrawal: no USDC in contract.");
    }
  }

  console.log("\nAll selected checks completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
