import { expect } from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import {parseEther} from "viem";
import {describe, it} from "node:test";

const { viem, networkHelpers } = await hre.network.connect();

// 激活异步断言插件
chai.use(chaiAsPromised);

describe("SugarCoin", async function () {
    async function deploySugarCoinFixture() {
        const [
            owner,
            whiteListUser,
            regularUser,
            regularUser2
        ] = await viem.getWalletClients();

        const ownerAddress = owner.account.address;

        // 部署合约
        const sugarCoin = await viem.deployContract(
            "SugarCoin", [ownerAddress]
        );

        const initialSupply = parseEther("200000000");

        // 获取合约中定义的 Role 哈希值 (public constant)
        const DEFAULT_ADMIN_ROLE = await sugarCoin.read.DEFAULT_ADMIN_ROLE();
        const TRANSFER_ROLE = await sugarCoin.read.TRANSFER_ROLE();
        const PAUSER_ROLE = await sugarCoin.read.PAUSER_ROLE();

        const publicClient = await viem.getPublicClient();

        return {
            sugarCoin,
            owner,
            whiteListUser,
            regularUser,
            regularUser2,
            initialSupply,
            DEFAULT_ADMIN_ROLE,
            TRANSFER_ROLE,
            PAUSER_ROLE,
            publicClient,
        };
    }

    describe.skip("Deployment", function () {
        it("Should mint the right amount of tokens to the deployer", async function () {
            // 1. 加载 Fixture
            const {sugarCoin, owner, initialSupply} = await networkHelpers.loadFixture(deploySugarCoinFixture);

            // 2. 获取部署者 (owner) 的地址
            const ownerAddress = owner.account.address;

            // 3. 读取合约状态：查询 owner 的余额
            const ownerBalance = await sugarCoin.read.balanceOf([ownerAddress]);

            // 4. 断言：验证余额是否等于初始供应量
            expect(ownerBalance).to.equal(initialSupply);
        });

        it("Should set the total supply correctly", async function () {
            const {sugarCoin, initialSupply} = await networkHelpers.loadFixture(deploySugarCoinFixture);

            // 读取总供应量
            const totalSupply = await sugarCoin.read.totalSupply();

            // 验证总供应量是否正确
            expect(totalSupply).to.equal(initialSupply);
        });
    });

    describe.skip("Access Control", function () {
        it("Should grant all roles to the defaultAdmin (owner)", async function () {
            const { sugarCoin, owner, DEFAULT_ADMIN_ROLE, TRANSFER_ROLE, PAUSER_ROLE } = await networkHelpers.loadFixture(deploySugarCoinFixture);

            // 验证 owner 是否拥有所有权限
            expect(await sugarCoin.read.hasRole([DEFAULT_ADMIN_ROLE, owner.account.address])).to.be.true;
            expect(await sugarCoin.read.hasRole([TRANSFER_ROLE, owner.account.address])).to.be.true;
            expect(await sugarCoin.read.hasRole([PAUSER_ROLE, owner.account.address])).to.be.true;
        });

        it("Should NOT grant roles to other users initially", async function () {
            const { sugarCoin, regularUser, TRANSFER_ROLE } = await networkHelpers.loadFixture(deploySugarCoinFixture);

            expect(await sugarCoin.read.hasRole([TRANSFER_ROLE, regularUser.account.address])).to.be.false;
        });
    });

    describe.skip("Whitelist Transfer Logic", function () {
        it("Should allow user with TRANSFER_ROLE to transfer when trading is disabled", async function () {
            const { sugarCoin, owner, whiteListUser, TRANSFER_ROLE } = await networkHelpers.loadFixture(deploySugarCoinFixture);

            const amountToSend = parseEther("100");

            // 1. 验证目前交易是关闭的
            expect(await sugarCoin.read.tradingEnabled()).to.be.false;

            // 2. Owner (拥有 TRANSFER_ROLE) 向 whitelistedUser 转账应该成功
            await expect(
                sugarCoin.write.transfer([whiteListUser.account.address, amountToSend])
            ).to.be.fulfilled;

            // 3. 赋予 TRANSFER_ROLE
            // 只有拥有 DEFAULT_ADMIN_ROLE (即 owner) 可以执行此操作
            await sugarCoin.write.grantRole([TRANSFER_ROLE, whiteListUser.account.address]);

            // 验证赋予成功
            expect(await sugarCoin.read.hasRole([TRANSFER_ROLE, whiteListUser.account.address])).to.be.true;

            // 4. whitelistedUser 尝试转账回 owner 应该成功
            const sugarCoinAsWhitelisted = await viem.getContractAt(
                "SugarCoin",
                sugarCoin.address,
                { client: { wallet: whiteListUser } } // 切换调用者为 whitelistedUser
            );

            await expect(
                sugarCoinAsWhitelisted.write.transfer([owner.account.address, parseEther("10")])
            ).to.be.fulfilled;
        });

        it("Should REVERT when a user WITHOUT role tries to transfer while trading is disabled", async function () {
            const {
                sugarCoin,
                regularUser,
                regularUser2
            } = await networkHelpers.loadFixture(deploySugarCoinFixture);

            // 1. Owner 先给 regularUser 转一些币 (Owner有白名单，可以发送)
            await sugarCoin.write.transfer([regularUser.account.address, parseEther("50")]);

            // 2. 切换调用者为 regularUser
            const sugarCoinAsRegular = await viem.getContractAt(
                "SugarCoin",
                sugarCoin.address,
                { client: { wallet: regularUser } }
            );

            // 3. regularUser 尝试转账出去
            // 预期：失败，并抛出合约里错误信息 "Trading is currently disabled"
            await expect(
                sugarCoinAsRegular.write.transfer([regularUser2.account.address, parseEther("10")])
            ).to.be.rejectedWith("Trading is currently disabled");
        });
    });

    describe.skip("Admin Functions", function () {
        it("Should allow trading after admin enables it", async function () {
            const { sugarCoin, owner, regularUser } = await networkHelpers.loadFixture(deploySugarCoinFixture);

            // 1. Owner 给 regularUser 转币
            await sugarCoin.write.transfer([regularUser.account.address, parseEther("50")]);

            // 2. Owner 开启全网交易
            await sugarCoin.write.enableTrading();
            expect(await sugarCoin.read.tradingEnabled()).to.be.true;

            // 3. 切换为 regularUser
            const sugarCoinAsRegular = await viem.getContractAt(
                "SugarCoin",
                sugarCoin.address,
                { client: { wallet: regularUser } }
            );

            // 4. regularUser 可以自由转账
            await expect(
                sugarCoinAsRegular.write.transfer([owner.account.address, parseEther("10")])
            ).to.be.fulfilled;
        });
    });
});