import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarShare", function () {
    async function deploySugarShareFixture() {
        const [treasury] = await viem.getWalletClients();
        const sugarShare = await viem.deployContract("SugarShare", [treasury.account.address]);

        return { sugarShare, treasury };
    }

    it("mints the fixed 100 million supply on deployment", async function () {
        const { sugarShare, treasury } = await networkHelpers.loadFixture(deploySugarShareFixture);
        const totalSupply = 100_000_000n * 10n ** 18n;

        expect(await sugarShare.read.totalSupply()).to.equal(totalSupply);
        expect(await sugarShare.read.balanceOf([treasury.account.address])).to.equal(totalSupply);
    });
});
