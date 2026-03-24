import { describe, it } from "node:test";
import hre from "hardhat";
import {parseEther, parseUnits} from "viem";
import {expect} from "chai";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

const { viem, networkHelpers } = await hre.network.connect();

describe("PreSale", function () {
    // 1. 定义 Fixture
    async function deployPresaleFixture() {
        // 获取测试账户
        const [owner, buyer, otherAccount] = await viem.getWalletClients();

        // 获取公共客户端
        const publicClient = await viem.getPublicClient();

        const DECIMALS = 8;
        const INITIAL_PRICE = 300000000000n;
        // 部署ETH/USD 模拟预言机合约
        const mockOracle = await viem.deployContract(
            "MockV3Aggregator",
            [DECIMALS, INITIAL_PRICE]
        );

        // 部署Mock USDT 合约
        const usdt = await viem.deployContract(
            "MockERC20",
            ["Tether", "USDT", 6]
        );

        // 部署Mock USDC 合约
        const usdc = await viem.deployContract(
            "MockERC20",
            ["USD Coin", "USDC", 6]
        );

        // 部署 代币合约
        const sugarCoin = await viem.deployContract(
            "SugarCoin",
            [owner.account.address]
        )

        // 获取转账权限
        const TRANSFER_ROLE = await sugarCoin.read.TRANSFER_ROLE();

        // 部署 预售合约
        const presale = await viem.deployContract(
            "Presale",
            [
                sugarCoin.address,
                usdt.address,
                usdc.address,
                mockOracle.address,
            ]
        );

        // 赋予 预售合约 转账权限
        await sugarCoin.write.grantRole([TRANSFER_ROLE, presale.address]);

        // 给预售合约转入代币
        const tokensToSell = parseEther("100000"); // 转入 10万个代币
        await sugarCoin.write.transfer([presale.address, tokensToSell]);

        const tokenPrice = parseEther("0.05");
        await presale.write.startRound([1, tokenPrice]);

        return {
            presale,
            sugarCoin,
            usdt,
            usdc,
            mockOracle,
            owner,
            buyer,
            publicClient,
            tokenPrice
        };
    }

    // Buy with ETH
    describe("Buying with ETH", function () {
        it("Should buy tokens correctly with ETH based on Oracle price", async function () {
            const {
                presale,
                sugarCoin,
                buyer
            } = await networkHelpers.loadFixture(deployPresaleFixture);

            // 1. 支付ETH的数量
            const ethAmountToPay = parseEther("1");

            // 2. 获取 Buyer 视角的合约实例
            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );

            // 3. 调用 buyWithETH
            await presaleAsBuyer.write.buyWithETH([], { value: ethAmountToPay });

            // 4. 验证结果
            const expectedTokenAmount = parseEther("60000");
            const buyerBalance = await sugarCoin.read.balanceOf([buyer.account.address]);

            // 断言
            expect(buyerBalance).to.equal(expectedTokenAmount);
        });

        // 验证 0 ETH时交易发送失败
        it("Should revert if 0 ETH is sent", async function () {
            const {
                presale,
                buyer
            } = await networkHelpers.loadFixture(deployPresaleFixture);

            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );

            // 尝试发送 0 ETH
            await expect(
                presaleAsBuyer.write.buyWithETH([], { value: 0n })
            ).to.be.rejectedWith("Send ETH");
        });

        // 验证合约确实收到了 ETH
        it("Contract should receive the ETH", async function () {
            const {
                presale,
                buyer
            } = await networkHelpers.loadFixture(deployPresaleFixture);
            const publicClient = await viem.getPublicClient();

            const ethAmount = parseEther("0.02");
            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );

            // 记录合约之前的余额
            const balanceBefore = await publicClient.getBalance({ address: presale.address });

            // 购买
            await presaleAsBuyer.write.buyWithETH([], { value: ethAmount });

            // 记录合约之后的余额
            const balanceAfter = await publicClient.getBalance({ address: presale.address });

            // 验证：余额增加了正好 2 ETH
            expect(balanceAfter - balanceBefore).to.equal(ethAmount);
        });
    });

    // Buy with USDT
    describe("Buying with USDT (6 decimals)", function () {
        it("Should buy tokens correctly with USDT", async function () {
            const { presale, sugarCoin, usdt, buyer } = await networkHelpers.loadFixture(deployPresaleFixture);

            const usdtAmount = parseUnits("100", 6);
            await usdt.write.mint([buyer.account.address, usdtAmount]);

            // 获取 USDT 合约实例 (作为 buyer)
            const usdtAsBuyer = await viem.getContractAt(
                "MockERC20",
                usdt.address,
                { client: { wallet: buyer } }
            );
            await usdtAsBuyer.write.approve([presale.address, usdtAmount]);

            // 获取 Presale 合约实例 (作为 buyer)
            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );
            await presaleAsBuyer.write.buyWithUSDT([usdtAmount]);

            const buyerTokenBalance = await sugarCoin.read.balanceOf([buyer.account.address]);
            expect(buyerTokenBalance).to.equal(parseEther("2000"));
        });
    });

    // Buy with USDC
    describe("Buying with USDC (6 decimals)", function () {
        it("Should buy tokens correctly with USDC", async function () {
            const { presale, sugarCoin, usdc, buyer } = await networkHelpers.loadFixture(deployPresaleFixture);

            const usdcAmount = parseUnits("50", 6);
            await usdc.write.mint([buyer.account.address, usdcAmount]);

            const usdcAsBuyer = await viem.getContractAt(
                "MockERC20",
                usdc.address,
                { client: { wallet: buyer } }
            );
            await usdcAsBuyer.write.approve([presale.address, usdcAmount]);

            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );
            await presaleAsBuyer.write.buyWithUSDC([usdcAmount]);

            const buyerTokenBalance = await sugarCoin.read.balanceOf([buyer.account.address]);
            expect(buyerTokenBalance).to.equal(parseEther("1000"));
        });
    });

    // Stage Token Sold
    describe("Token Sold & Token Left in Current Stage", function () {
        it("Should show left tokens under current stage correctly", async function () {
            const { presale, sugarCoin, usdc, buyer } = await networkHelpers.loadFixture(deployPresaleFixture);

            const usdcAmount = parseUnits("50", 6);
            await usdc.write.mint([buyer.account.address, usdcAmount]);

            const usdcAsBuyer = await viem.getContractAt(
                "MockERC20",
                usdc.address,
                { client: { wallet: buyer } }
            );
            await usdcAsBuyer.write.approve([presale.address, usdcAmount]);

            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );
            await presaleAsBuyer.write.buyWithUSDC([usdcAmount]);

            const currentRoundIndex = await presale.read.currentRoundIndex();
            const [, tokenSold] = await presale.read.rounds([currentRoundIndex]) as readonly [
                bigint,
                bigint,
                bigint,
                boolean,
            ];

            expect(tokenSold).to.equal(parseEther("1000"));
        });
    });

    // Admin Func Tests
    describe.skip("Admin Functions", function () {
        // 检查是否成功提取资金
        it("Should allow owner to withdraw USDT funds", async function () {
            const { presale, usdt, buyer, owner } = await networkHelpers.loadFixture(deployPresaleFixture);

            // 铸造100 USDT用于后续购买
            const amount = parseUnits("100", 6);
            await usdt.write.mint([buyer.account.address, amount]);

            const usdtAsBuyer = await viem.getContractAt(
                "MockERC20",
                usdt.address,
                { client: { wallet: buyer } }
            );
            await usdtAsBuyer.write.approve([presale.address, amount]);

            const presaleAsBuyer = await viem.getContractAt(
                "Presale",
                presale.address,
                { client: { wallet: buyer } }
            );
            await presaleAsBuyer.write.buyWithUSDT([amount]);

            // Owner 提取资金
            const balanceBefore = await usdt.read.balanceOf([owner.account.address]) as bigint;

            await presale.write.withdrawFunds([usdt.address]);

            const balanceAfter = await usdt.read.balanceOf([owner.account.address]) as bigint;
            expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        // 检查是否可以暂停当前轮次
        it("Should allow owner to pause current stage", async function () {
            const { presale, owner} = await networkHelpers.loadFixture(deployPresaleFixture);

            // 判断当前轮次是否为 1
            const currentRoundIndex = await presale.read.currentRoundIndex();
            expect(currentRoundIndex).to.equal(1);

            // 实现暂停功能
            await presale.write.pauseRound()
            const currentRound = await presale.read.rounds([currentRoundIndex]) as readonly [
                bigint,
                bigint,
                bigint,
                boolean,
            ];
            // 判断当前轮次是否成功暂停 isActive === False
            expect(currentRound[3]).to.be.false;

        });

        // 检查是否可以启用新轮次
        it("Should allow owner to start new stage", async function () {
            const { presale, owner} = await networkHelpers.loadFixture(deployPresaleFixture);

            // 实现暂停功能
            await presale.write.pauseRound()
            // 启动新轮次
            const newPrice = parseEther("0.1");
            await presale.write.startRound([2, newPrice])

            // 判断轮次是否更改成功
            const currentRoundIndex = await presale.read.currentRoundIndex();
            expect(currentRoundIndex).to.equal(2);
            const currentRound = await presale.read.rounds([currentRoundIndex]) as readonly [
                bigint,
                bigint,
                bigint,
                boolean,
            ];
            // 判断价格是否更改成功
            expect(currentRound[0]).to.equal(parseEther("0.1"));
            // 判断是否启动成功
            expect(currentRound[3]).to.be.true;
        });
    });

    // 前端查询ETH Price
    describe.skip("ETH/USD Price Feed", async function () {
        it("Should emit the proper ETH/USD Price", async function () {
            const { presale } = await networkHelpers.loadFixture(deployPresaleFixture)
            const price = await presale.read.getTokensAmountPerETH();

            expect(price).to.equal(parseEther("60000"));
        });
    })
});
