import { describe, it } from "node:test";
import hre from "hardhat";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { getAddress, parseEther, parseUnits } from "viem";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarCommodityToken", function () {
  async function deploySugarTokenFixture() {
    const [owner, updater, buyer, treasury, otherAccount] =
      await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const nativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
      8,
      3000_00000000n,
    ]);

    const sugarOracle = await viem.deployContract("SugarPriceOracle", [
      owner.account.address,
      updater.account.address,
      nativeUsdFeed.address,
      parseEther("600"),
      86400n,
      7200n,
    ]);

    const usdc = await viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6,
    ]);

    const tokensPerTon = 1000n;

    const sugarToken = await viem.deployContract("SugarCommodityToken", [
      owner.account.address,
      sugarOracle.address,
      usdc.address,
      tokensPerTon,
    ]);

    const MINTER_ROLE = await sugarToken.read.MINTER_ROLE();
    const CAPACITY_MANAGER_ROLE = await sugarToken.read.CAPACITY_MANAGER_ROLE();
    const FINANCIAL_ROLE = await sugarToken.read.FINANCIAL_ROLE();
    const DEFAULT_ADMIN_ROLE = await sugarToken.read.DEFAULT_ADMIN_ROLE();

    return {
      sugarToken,
      sugarOracle,
      nativeUsdFeed,
      usdc,
      owner,
      updater,
      buyer,
      treasury,
      otherAccount,
      publicClient,
      tokensPerTon,
      MINTER_ROLE,
      CAPACITY_MANAGER_ROLE,
      FINANCIAL_ROLE,
      DEFAULT_ADMIN_ROLE,
    };
  }

  describe("Deployment", function () {
    it("Should set token metadata, payment token, and initial roles correctly", async function () {
      const {
        sugarToken,
        sugarOracle,
        usdc,
        owner,
        tokensPerTon,
        MINTER_ROLE,
        CAPACITY_MANAGER_ROLE,
        FINANCIAL_ROLE,
        DEFAULT_ADMIN_ROLE,
      } = await networkHelpers.loadFixture(deploySugarTokenFixture);

      expect(await sugarToken.read.name()).to.equal("Real Sugar Token");
      expect(await sugarToken.read.symbol()).to.equal("SUGAR");
      expect(await sugarToken.read.sugarOracle()).to.equal(
        getAddress(sugarOracle.address),
      );
      expect(await sugarToken.read.usdc()).to.equal(getAddress(usdc.address));
      expect(await sugarToken.read.tokensPerTon()).to.equal(tokensPerTon);
      expect(
        await sugarToken.read.hasRole([DEFAULT_ADMIN_ROLE, owner.account.address]),
      ).to.be.true;
      expect(
        await sugarToken.read.hasRole([MINTER_ROLE, owner.account.address]),
      ).to.be.true;
      expect(
        await sugarToken.read.hasRole([
          CAPACITY_MANAGER_ROLE,
          owner.account.address,
        ]),
      ).to.be.true;
      expect(
        await sugarToken.read.hasRole([FINANCIAL_ROLE, owner.account.address]),
      ).to.be.true;
    });

    it("Should revert when deployed with an invalid oracle", async function () {
      const [owner] = await viem.getWalletClients();
      const usdc = await viem.deployContract("MockERC20", [
        "USD Coin",
        "USDC",
        6,
      ]);

      await expect(
        viem.deployContract("SugarCommodityToken", [
          owner.account.address,
          "0x0000000000000000000000000000000000000000",
          usdc.address,
          1000n,
        ]),
      ).to.be.rejectedWith("SugarToken: Invalid oracle address");
    });

    it("Should revert when deployed with an invalid USDC address", async function () {
      const [owner, updater] = await viem.getWalletClients();
      const nativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
        8,
        3000_00000000n,
      ]);
      const sugarOracle = await viem.deployContract("SugarPriceOracle", [
        owner.account.address,
        updater.account.address,
        nativeUsdFeed.address,
        parseEther("600"),
        86400n,
        7200n,
      ]);

      await expect(
        viem.deployContract("SugarCommodityToken", [
          owner.account.address,
          sugarOracle.address,
          "0x0000000000000000000000000000000000000000",
          1000n,
        ]),
      ).to.be.rejectedWith("SugarToken: Invalid USDC address");
    });
  });

  describe("Admin Controls", function () {
    it("Should allow the admin to update oracle, payment token, and exchange rate", async function () {
      const { sugarToken, owner, updater } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      const newNativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
        8,
        2500_00000000n,
      ]);
      const newOracle = await viem.deployContract("SugarPriceOracle", [
        owner.account.address,
        updater.account.address,
        newNativeUsdFeed.address,
        parseEther("650"),
        86400n,
        7200n,
      ]);
      const newUsdc = await viem.deployContract("MockERC20", [
        "USD Coin 2",
        "USDC2",
        6,
      ]);

      await sugarToken.write.setOracle([newOracle.address]);
      await sugarToken.write.setUsdc([newUsdc.address]);
      await sugarToken.write.setTokensPerTon([2000n]);

      expect(await sugarToken.read.sugarOracle()).to.equal(
        getAddress(newOracle.address),
      );
      expect(await sugarToken.read.usdc()).to.equal(getAddress(newUsdc.address));
      expect(await sugarToken.read.tokensPerTon()).to.equal(2000n);
    });

    it("Should block non-admins from updating oracle or payment token", async function () {
      const { sugarToken, otherAccount } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      const sugarTokenAsOther = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: otherAccount } },
      );

      const newUsdc = await viem.deployContract("MockERC20", [
        "USD Coin 2",
        "USDC2",
        6,
      ]);

      await expect(
        sugarTokenAsOther.write.setUsdc([newUsdc.address]),
      ).to.be.rejected;
      await expect(
        sugarTokenAsOther.write.setTokensPerTon([2000n]),
      ).to.be.rejected;
    });
  });

  describe("Minting", function () {
    it("Should mint only within the configured capacity", async function () {
      const { sugarToken, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("500")]);
      await sugarToken.write.mint([buyer.account.address, parseEther("300")]);

      expect(await sugarToken.read.balanceOf([buyer.account.address])).to.equal(
        parseEther("300"),
      );

      await expect(
        sugarToken.write.mint([buyer.account.address, parseEther("201")]),
      ).to.be.rejectedWith(
        "SugarToken: Exceeds physical collateral capacity limit",
      );
    });
  });

  describe("Buying Tokens", function () {
    it("Should buy tokens with USDC using the oracle USD price", async function () {
      const { sugarToken, usdc, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const amountToBuy = parseEther("100");
      const usdcAmount = parseUnits("60", 6);

      await usdc.write.mint([buyer.account.address, usdcAmount]);

      const usdcAsBuyer = await viem.getContractAt("MockERC20", usdc.address, {
        client: { wallet: buyer },
      });
      await usdcAsBuyer.write.approve([sugarToken.address, usdcAmount]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await sugarTokenAsBuyer.write.buyTokensWithUSDC([amountToBuy]);

      expect(await sugarToken.read.balanceOf([buyer.account.address])).to.equal(
        amountToBuy,
      );
      expect(await usdc.read.balanceOf([sugarToken.address])).to.equal(
        usdcAmount,
      );
    });

    it("Should buy tokens with ETH through the backward-compatible buyTokens entrypoint", async function () {
      const { sugarToken, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const amountToBuy = parseEther("100");
      const totalCost = parseEther("0.02");

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await sugarTokenAsBuyer.write.buyTokens([amountToBuy], { value: totalCost });

      expect(await sugarToken.read.balanceOf([buyer.account.address])).to.equal(
        amountToBuy,
      );
      expect(await sugarToken.read.totalSupply()).to.equal(amountToBuy);
    });

    it("Should refund ETH overpayment and retain only the required cost", async function () {
      const { sugarToken, buyer, publicClient } =
        await networkHelpers.loadFixture(deploySugarTokenFixture);

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await sugarTokenAsBuyer.write.buyTokensWithETH([parseEther("100")], {
        value: parseEther("0.03"),
      });

      expect(
        await publicClient.getBalance({ address: sugarToken.address }),
      ).to.equal(parseEther("0.02"));
    });

    it("Should revert ETH purchases when payment is insufficient", async function () {
      const { sugarToken, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await expect(
        sugarTokenAsBuyer.write.buyTokensWithETH([parseEther("100")], {
          value: parseEther("0.019"),
        }),
      ).to.be.rejectedWith("SugarToken: Insufficient funds sent");
    });

    it("Should revert USDC purchases when the sugar price is stale", async function () {
      const { sugarToken, usdc, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);
      await networkHelpers.time.increase(86401);

      const usdcAsBuyer = await viem.getContractAt("MockERC20", usdc.address, {
        client: { wallet: buyer },
      });
      await usdc.write.mint([buyer.account.address, parseUnits("100", 6)]);
      await usdcAsBuyer.write.approve([sugarToken.address, parseUnits("100", 6)]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await expect(
        sugarTokenAsBuyer.write.buyTokensWithUSDC([parseEther("100")]),
      ).to.be.rejectedWith("SugarOracle: Sugar price stale");
    });

    it("Should revert ETH purchases when the native feed is invalid", async function () {
      const { sugarToken, nativeUsdFeed, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);
      await nativeUsdFeed.write.updateAnswer([0n]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await expect(
        sugarTokenAsBuyer.write.buyTokensWithETH([parseEther("100")], {
          value: parseEther("1"),
        }),
      ).to.be.rejectedWith("SugarOracle: Invalid native price");
    });
  });

  describe("Financial Operations", function () {
    it("Should allow the financial role to withdraw collected ETH funds", async function () {
      const { sugarToken, buyer, treasury, publicClient } =
        await networkHelpers.loadFixture(deploySugarTokenFixture);

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await sugarTokenAsBuyer.write.buyTokensWithETH([parseEther("100")], {
        value: parseEther("0.02"),
      });

      const treasuryBalanceBefore = await publicClient.getBalance({
        address: treasury.account.address,
      });

      await sugarToken.write.withdrawFunds([treasury.account.address]);

      const treasuryBalanceAfter = await publicClient.getBalance({
        address: treasury.account.address,
      });

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
        parseEther("0.02"),
      );
      expect(
        await publicClient.getBalance({ address: sugarToken.address }),
      ).to.equal(0n);
    });

    it("Should allow the financial role to withdraw collected USDC funds", async function () {
      const { sugarToken, usdc, buyer, treasury } =
        await networkHelpers.loadFixture(deploySugarTokenFixture);

      await sugarToken.write.updateCapacity([parseEther("1000")]);

      const usdcAmount = parseUnits("60", 6);
      await usdc.write.mint([buyer.account.address, usdcAmount]);

      const usdcAsBuyer = await viem.getContractAt("MockERC20", usdc.address, {
        client: { wallet: buyer },
      });
      await usdcAsBuyer.write.approve([sugarToken.address, usdcAmount]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );
      await sugarTokenAsBuyer.write.buyTokensWithUSDC([parseEther("100")]);

      const treasuryBalanceBefore = await usdc.read.balanceOf([
        treasury.account.address,
      ]);

      await sugarToken.write.withdrawERC20([usdc.address, treasury.account.address]);

      const treasuryBalanceAfter = await usdc.read.balanceOf([
        treasury.account.address,
      ]);

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(usdcAmount);
      expect(await usdc.read.balanceOf([sugarToken.address])).to.equal(0n);
    });

    it("Should reject withdrawals from non-financial accounts", async function () {
      const { sugarToken, otherAccount, treasury, usdc } =
        await networkHelpers.loadFixture(deploySugarTokenFixture);

      const sugarTokenAsOther = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: otherAccount } },
      );

      await expect(
        sugarTokenAsOther.write.withdrawFunds([treasury.account.address]),
      ).to.be.rejected;
      await expect(
        sugarTokenAsOther.write.withdrawERC20([usdc.address, treasury.account.address]),
      ).to.be.rejected;
    });
  });

  describe("Redemption", function () {
    it("Should burn tokens when redeeming physical sugar", async function () {
      const { sugarToken, buyer } = await networkHelpers.loadFixture(
        deploySugarTokenFixture,
      );

      await sugarToken.write.updateCapacity([parseEther("1000")]);
      await sugarToken.write.mint([buyer.account.address, parseEther("200")]);

      const sugarTokenAsBuyer = await viem.getContractAt(
        "SugarCommodityToken",
        sugarToken.address,
        { client: { wallet: buyer } },
      );

      await sugarTokenAsBuyer.write.redeemPhysicalSugar([
        parseEther("50"),
        "DO-20260411-001",
      ]);

      expect(await sugarToken.read.balanceOf([buyer.account.address])).to.equal(
        parseEther("150"),
      );
      expect(await sugarToken.read.totalSupply()).to.equal(parseEther("150"));
    });
  });
});
