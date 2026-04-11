import { describe, it } from "node:test";
import hre from "hardhat";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { getAddress, parseEther } from "viem";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarPriceOracle", function () {
  async function deploySugarPriceOracleFixture() {
    const [admin, updater, otherAccount] = await viem.getWalletClients();

    const nativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
      8,
      3000_00000000n,
    ]);

    const initialSugarUsdPricePerTon = parseEther("600");
    const initialMaxSugarPriceAge = 24n * 60n * 60n;
    const initialMaxNativePriceAge = 2n * 60n * 60n;

    const sugarPriceOracle = await viem.deployContract("SugarPriceOracle", [
      admin.account.address,
      updater.account.address,
      nativeUsdFeed.address,
      initialSugarUsdPricePerTon,
      initialMaxSugarPriceAge,
      initialMaxNativePriceAge,
    ]);

    const PRICE_UPDATER_ROLE = await sugarPriceOracle.read.PRICE_UPDATER_ROLE();
    const DEFAULT_ADMIN_ROLE = await sugarPriceOracle.read.DEFAULT_ADMIN_ROLE();

    return {
      admin,
      updater,
      otherAccount,
      nativeUsdFeed,
      sugarPriceOracle,
      initialSugarUsdPricePerTon,
      initialMaxSugarPriceAge,
      initialMaxNativePriceAge,
      PRICE_UPDATER_ROLE,
      DEFAULT_ADMIN_ROLE,
    };
  }

  describe("Deployment", function () {
    it("Should set the initial roles and configuration", async function () {
      const {
        admin,
        updater,
        nativeUsdFeed,
        sugarPriceOracle,
        initialSugarUsdPricePerTon,
        initialMaxSugarPriceAge,
        initialMaxNativePriceAge,
        PRICE_UPDATER_ROLE,
        DEFAULT_ADMIN_ROLE,
      } = await networkHelpers.loadFixture(deploySugarPriceOracleFixture);

      expect(await sugarPriceOracle.read.nativeUsdFeed()).to.equal(
        getAddress(nativeUsdFeed.address),
      );
      expect(await sugarPriceOracle.read.sugarUsdPricePerTon()).to.equal(
        initialSugarUsdPricePerTon,
      );
      expect(await sugarPriceOracle.read.maxSugarPriceAge()).to.equal(
        initialMaxSugarPriceAge,
      );
      expect(await sugarPriceOracle.read.maxNativePriceAge()).to.equal(
        initialMaxNativePriceAge,
      );
      expect(
        await sugarPriceOracle.read.hasRole([
          DEFAULT_ADMIN_ROLE,
          admin.account.address,
        ]),
      ).to.be.true;
      expect(
        await sugarPriceOracle.read.hasRole([
          PRICE_UPDATER_ROLE,
          updater.account.address,
        ]),
      ).to.be.true;
    });

    it("Should revert with an invalid feed address", async function () {
      const [admin, updater] = await viem.getWalletClients();

      await expect(
        viem.deployContract("SugarPriceOracle", [
          admin.account.address,
          updater.account.address,
          "0x0000000000000000000000000000000000000000",
          parseEther("600"),
          86400n,
          7200n,
        ]),
      ).to.be.rejectedWith("SugarOracle: Invalid feed");
    });
  });

  describe("Price Updates", function () {
    it("Should allow the updater to write the sugar USD price", async function () {
      const { sugarPriceOracle, updater } = await networkHelpers.loadFixture(
        deploySugarPriceOracleFixture,
      );

      await networkHelpers.time.increase(10);

      const oracleAsUpdater = await viem.getContractAt(
        "SugarPriceOracle",
        sugarPriceOracle.address,
        { client: { wallet: updater } },
      );

      await oracleAsUpdater.write.updateSugarUsdPrice([parseEther("650")]);

      expect(await sugarPriceOracle.read.sugarUsdPricePerTon()).to.equal(
        parseEther("650"),
      );
      expect(await sugarPriceOracle.read.sugarPriceUpdatedAt()).to.be.greaterThan(
        0n,
      );
    });

    it("Should reject price updates from non-updaters", async function () {
      const { sugarPriceOracle, otherAccount } =
        await networkHelpers.loadFixture(deploySugarPriceOracleFixture);

      const oracleAsOther = await viem.getContractAt(
        "SugarPriceOracle",
        sugarPriceOracle.address,
        { client: { wallet: otherAccount } },
      );

      await expect(
        oracleAsOther.write.updateSugarUsdPrice([parseEther("650")]),
      ).to.be.rejected;
    });
  });

  describe("Price Reads", function () {
    it("Should convert sugar USD price into native token price", async function () {
      const { sugarPriceOracle } = await networkHelpers.loadFixture(
        deploySugarPriceOracleFixture,
      );

      expect(
        await sugarPriceOracle.read.getLatestSugarUsdPricePerTon(),
      ).to.equal(parseEther("600"));
      expect(await sugarPriceOracle.read.getLatestNativeUsdPrice()).to.equal(
        parseEther("3000"),
      );
      expect(await sugarPriceOracle.read.getLatestPrice()).to.equal(
        parseEther("0.2"),
      );
    });

    it("Should revert when the sugar price is stale", async function () {
      const { sugarPriceOracle, initialMaxSugarPriceAge } =
        await networkHelpers.loadFixture(deploySugarPriceOracleFixture);

      await networkHelpers.time.increase(Number(initialMaxSugarPriceAge + 1n));

      await expect(sugarPriceOracle.read.getLatestPrice()).to.be.rejectedWith(
        "SugarOracle: Sugar price stale",
      );
    });

    it("Should revert when the native feed price is stale", async function () {
      const { sugarPriceOracle, updater, initialMaxNativePriceAge } =
        await networkHelpers.loadFixture(deploySugarPriceOracleFixture);

      const oracleAsUpdater = await viem.getContractAt(
        "SugarPriceOracle",
        sugarPriceOracle.address,
        { client: { wallet: updater } },
      );

      await oracleAsUpdater.write.updateSugarUsdPrice([parseEther("610")]);
      await networkHelpers.time.increase(Number(initialMaxNativePriceAge + 1n));

      await expect(sugarPriceOracle.read.getLatestPrice()).to.be.rejectedWith(
        "SugarOracle: Native price stale",
      );
    });

    it("Should revert when the native feed returns an invalid price", async function () {
      const { sugarPriceOracle, nativeUsdFeed } = await networkHelpers.loadFixture(
        deploySugarPriceOracleFixture,
      );

      await nativeUsdFeed.write.updateAnswer([0n]);

      await expect(sugarPriceOracle.read.getLatestPrice()).to.be.rejectedWith(
        "SugarOracle: Invalid native price",
      );
    });
  });

  describe("Admin Controls", function () {
    it("Should let the admin update feed and freshness thresholds", async function () {
      const { sugarPriceOracle } = await networkHelpers.loadFixture(
        deploySugarPriceOracleFixture,
      );

      const newNativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
        8,
        2500_00000000n,
      ]);

      await sugarPriceOracle.write.setNativeUsdFeed([newNativeUsdFeed.address]);
      await sugarPriceOracle.write.setMaxSugarPriceAge([172800n]);
      await sugarPriceOracle.write.setMaxNativePriceAge([14400n]);

      expect(await sugarPriceOracle.read.nativeUsdFeed()).to.equal(
        getAddress(newNativeUsdFeed.address),
      );
      expect(await sugarPriceOracle.read.maxSugarPriceAge()).to.equal(172800n);
      expect(await sugarPriceOracle.read.maxNativePriceAge()).to.equal(14400n);
      expect(await sugarPriceOracle.read.getLatestNativeUsdPrice()).to.equal(
        parseEther("2500"),
      );
    });

    it("Should reject admin operations from non-admin accounts", async function () {
      const { sugarPriceOracle, otherAccount } =
        await networkHelpers.loadFixture(deploySugarPriceOracleFixture);

      const newNativeUsdFeed = await viem.deployContract("MockV3Aggregator", [
        8,
        2500_00000000n,
      ]);

      const oracleAsOther = await viem.getContractAt(
        "SugarPriceOracle",
        sugarPriceOracle.address,
        { client: { wallet: otherAccount } },
      );

      await expect(
        oracleAsOther.write.setNativeUsdFeed([newNativeUsdFeed.address]),
      ).to.be.rejected;
      await expect(
        oracleAsOther.write.setMaxSugarPriceAge([172800n]),
      ).to.be.rejected;
      await expect(
        oracleAsOther.write.setMaxNativePriceAge([14400n]),
      ).to.be.rejected;
    });
  });
});
