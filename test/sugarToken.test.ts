import { describe, it } from "node:test";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import { parseEther } from "viem";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarToken", function () {
    async function deploySugarTokenFixture() {
        const [admin, operator, buyer] = await viem.getWalletClients();
        const sugarToken = await viem.deployContract("SugarToken", [admin.account.address]);

        const MINTER_ROLE = await sugarToken.read.MINTER_ROLE();
        const BURNER_ROLE = await sugarToken.read.BURNER_ROLE();

        await sugarToken.write.grantRole([MINTER_ROLE, operator.account.address]);
        await sugarToken.write.grantRole([BURNER_ROLE, operator.account.address]);

        return { sugarToken, admin, operator, buyer };
    }

    it("allows authorized inventory minting and burning", async function () {
        const { sugarToken, operator, buyer } = await networkHelpers.loadFixture(deploySugarTokenFixture);
        const operatorToken = await viem.getContractAt("SugarToken", sugarToken.address, {
            client: { wallet: operator },
        });

        await operatorToken.write.mint([buyer.account.address, parseEther("500")]);
        expect(await sugarToken.read.balanceOf([buyer.account.address])).to.equal(parseEther("500"));

        await operatorToken.write.mint([operator.account.address, parseEther("200")]);
        await operatorToken.write.burnInventory([parseEther("50")]);

        expect(await sugarToken.read.balanceOf([operator.account.address])).to.equal(parseEther("150"));
    });

    it("blocks transfers while paused", async function () {
        const { sugarToken, buyer } = await networkHelpers.loadFixture(deploySugarTokenFixture);

        await sugarToken.write.mint([buyer.account.address, parseEther("10")]);
        await sugarToken.write.pause();

        await expect(
            sugarToken.write.transfer([buyer.account.address, parseEther("1")]),
        ).to.be.rejected;
    });
});
