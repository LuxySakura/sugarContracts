import { describe, it } from "node:test";
import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import {
    concat,
    encodeAbiParameters,
    Hex,
    keccak256,
    parseUnits,
    type Address,
} from "viem";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

function buildLeaf(index: bigint, account: Address, amount: bigint): Hex {
    return keccak256(
        encodeAbiParameters(
            [
                { name: "index", type: "uint256" },
                { name: "account", type: "address" },
                { name: "amount", type: "uint256" },
            ],
            [index, account, amount],
        ),
    );
}

function hashPair(left: Hex, right: Hex): Hex {
    const [a, b] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
    return keccak256(concat([a, b]));
}

describe("DividendClaim", function () {
    async function deployDividendFixture() {
        const [admin, alice, bob, treasury] = await viem.getWalletClients();
        const usdc = await viem.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
        const dividendClaim = await viem.deployContract("DividendClaim", [
            usdc.address,
            admin.account.address,
        ]);

        const aliceAmount = parseUnits("100", 6);
        const bobAmount = parseUnits("250", 6);
        const aliceLeaf = buildLeaf(0n, alice.account.address, aliceAmount);
        const bobLeaf = buildLeaf(1n, bob.account.address, bobAmount);
        const merkleRoot = hashPair(aliceLeaf, bobLeaf);
        const totalAmount = aliceAmount + bobAmount;

        await usdc.write.mint([admin.account.address, totalAmount]);
        await usdc.write.approve([dividendClaim.address, totalAmount]);

        const publicClient = await viem.getPublicClient();
        const latestBlock = await publicClient.getBlock();
        const claimDeadline = BigInt(latestBlock.timestamp) + 100n;

        await dividendClaim.write.createDistribution([
            merkleRoot,
            totalAmount,
            claimDeadline,
            keccak256("0x1234"),
        ]);

        return {
            admin,
            alice,
            bob,
            treasury,
            usdc,
            dividendClaim,
            aliceAmount,
            bobAmount,
            claimDeadline,
            aliceProof: [bobLeaf],
            bobProof: [aliceLeaf],
        };
    }

    it("lets users claim USDC with a valid merkle proof", async function () {
        const { alice, usdc, dividendClaim, aliceAmount, aliceProof } =
            await networkHelpers.loadFixture(deployDividendFixture);

        await dividendClaim.write.claim([1n, 0n, alice.account.address, aliceAmount, aliceProof]);

        expect(await usdc.read.balanceOf([alice.account.address])).to.equal(aliceAmount);
        expect(await dividendClaim.read.isClaimed([1n, 0n])).to.equal(true);
    });

    it("prevents double claims and allows sweeping after expiry", async function () {
        const { treasury, usdc, dividendClaim, alice, aliceAmount, bobAmount, claimDeadline, aliceProof } =
            await networkHelpers.loadFixture(deployDividendFixture);

        await dividendClaim.write.claim([1n, 0n, alice.account.address, aliceAmount, aliceProof]);
        await expect(
            dividendClaim.write.claim([1n, 0n, alice.account.address, aliceAmount, aliceProof]),
        ).to.be.rejected;

        await networkHelpers.time.increaseTo(claimDeadline + 1n);
        await dividendClaim.write.sweepExpiredDistribution([1n, treasury.account.address]);

        expect(await usdc.read.balanceOf([treasury.account.address])).to.equal(bobAmount);
    });
});
