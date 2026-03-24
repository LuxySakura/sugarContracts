import { describe, it } from "node:test";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import { parseEther } from "viem";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarVesting", function () {
    async function deploySugarVestingFixture() {
        const [admin, investor] = await viem.getWalletClients();
        const publicClient = await viem.getPublicClient();
        const latestBlock = await publicClient.getBlock();
        const startTimestamp = BigInt(latestBlock.timestamp) + 10n;

        const sugarShare = await viem.deployContract("SugarShare", [admin.account.address]);
        const vesting = await viem.deployContract("SugarVesting", [
            sugarShare.address,
            admin.account.address,
            startTimestamp,
            10n,
            90n,
        ]);

        const allocation = parseEther("1000");
        await sugarShare.write.transfer([vesting.address, allocation]);
        await vesting.write.setAllocation([investor.account.address, allocation]);

        return { admin, investor, sugarShare, vesting, startTimestamp, allocation };
    }

    it("releases after cliff and then linearly until completion", async function () {
        const { investor, sugarShare, vesting, startTimestamp, allocation } =
            await networkHelpers.loadFixture(deploySugarVestingFixture);

        expect(await vesting.read.releasableAmount([investor.account.address])).to.equal(0n);

        await networkHelpers.time.increaseTo(Number(startTimestamp + 55n));
        const vestedMidway = await vesting.read.vestedAmount([investor.account.address]) as bigint;
        expect(vestedMidway >= allocation / 2n).to.equal(true);
        expect(vestedMidway < parseEther("520")).to.equal(true);

        const vestingAsInvestor = await viem.getContractAt("SugarVesting", vesting.address, {
            client: { wallet: investor },
        });

        await vestingAsInvestor.write.claim();
        const claimedMidway = await sugarShare.read.balanceOf([investor.account.address]) as bigint;
        expect(claimedMidway >= allocation / 2n).to.equal(true);
        expect(claimedMidway < parseEther("530")).to.equal(true);

        await networkHelpers.time.increaseTo(Number(startTimestamp + 100n));
        await vestingAsInvestor.write.claim();

        expect(await sugarShare.read.balanceOf([investor.account.address])).to.equal(allocation);
        expect(await vesting.read.outstandingObligation()).to.equal(0n);
    });

    it("allows admin to withdraw excess inventory only", async function () {
        const { admin, sugarShare, vesting } = await networkHelpers.loadFixture(deploySugarVestingFixture);
        const excess = parseEther("200");

        await sugarShare.write.transfer([vesting.address, excess]);
        await vesting.write.withdrawExcess([admin.account.address, excess]);

        expect(await sugarShare.read.balanceOf([vesting.address])).to.equal(parseEther("1000"));
    });
});
