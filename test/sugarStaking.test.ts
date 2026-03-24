import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await hre.network.connect();

describe("SugarStaking", function () {
    async function deploySugarStakingFixture() {
        const [admin, staker] = await viem.getWalletClients();
        const sugarShare = await viem.deployContract("SugarShare", [admin.account.address]);
        const staking = await viem.deployContract("SugarStaking", [
            sugarShare.address,
            admin.account.address,
            100n,
        ]);

        await sugarShare.write.transfer([staker.account.address, parseEther("200")]);

        const sugarShareAsStaker = await viem.getContractAt("SugarShare", sugarShare.address, {
            client: { wallet: staker },
        });
        const stakingAsStaker = await viem.getContractAt("SugarStaking", staking.address, {
            client: { wallet: staker },
        });

        await sugarShareAsStaker.write.approve([staking.address, parseEther("200")]);

        return { admin, staker, sugarShare, sugarShareAsStaker, staking, stakingAsStaker };
    }

    it("increases multiplier with time and returns funds on unstake", async function () {
        const { staker, sugarShare, staking, stakingAsStaker } =
            await networkHelpers.loadFixture(deploySugarStakingFixture);

        await stakingAsStaker.write.stake([parseEther("100")]);
        await networkHelpers.time.increase(50);

        expect(await staking.read.currentMultiplierBps([staker.account.address])).to.equal(15_000n);
        expect(await staking.read.stakingPower([staker.account.address])).to.equal(parseEther("150"));

        await stakingAsStaker.write.unstake([parseEther("40")]);
        expect(await sugarShare.read.balanceOf([staker.account.address])).to.equal(parseEther("140"));
        const [remainingStake] = await staking.read.positions([staker.account.address]) as readonly [
            bigint,
            bigint,
        ];
        expect(remainingStake).to.equal(parseEther("60"));
    });

    it("uses weighted time when users add more stake later", async function () {
        const { staker, staking, stakingAsStaker } =
            await networkHelpers.loadFixture(deploySugarStakingFixture);

        await stakingAsStaker.write.stake([parseEther("100")]);
        await networkHelpers.time.increase(100);
        await stakingAsStaker.write.stake([parseEther("100")]);

        const weightedMultiplier = await staking.read.currentMultiplierBps([staker.account.address]) as bigint;
        expect(weightedMultiplier > 15_000n).to.equal(true);
        expect(weightedMultiplier < 16_000n).to.equal(true);

        const publicClient = await viem.getPublicClient();
        const latestBlock = await publicClient.getBlock();
        await staking.write.setSnapshotTimestamp([BigInt(latestBlock.timestamp) + 50n]);

        expect(await staking.read.snapshotMultiplierBps([staker.account.address])).to.equal(20_000n);
    });
});
