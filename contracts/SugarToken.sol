// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ISugarPriceOracle
 * @dev 预言机接口：用于获取当前的糖价
 */
interface ISugarPriceOracle {
    // 返回一吨糖的当前市场价格（假设以原生代币计价，例如ETH/BNB/POL，返回精度为18位）
    function getLatestPrice() external view returns (uint256);

    // 返回一吨糖的当前美元价格，返回精度为18位
    function getLatestSugarUsdPricePerTon() external view returns (uint256);
}

/**
 * @title SugarCommodityToken (SUGAR)
 */
contract SugarCommodityToken is ERC20, ERC20Burnable, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant CAPACITY_MANAGER_ROLE = keccak256("CAPACITY_MANAGER_ROLE");
    bytes32 public constant FINANCIAL_ROLE = keccak256("FINANCIAL_ROLE"); // 新增财务角色：用于提取销售收入

    // 物理产能安全锁：当前链上允许流通的最大代币数量
    uint256 public maxMintableCapacity;

    // --- 新增：定价与预言机相关变量 ---
    ISugarPriceOracle public sugarOracle;
    IERC20Metadata public usdc;
    // 兑换比例：一吨糖对应多少个代币（不包含小数位，例如 1000 表示 1000 个代币 = 1吨糖）
    uint256 public tokensPerTon;

    // --- 事件 ---
    event SugarRedeemed(address indexed redeemer, uint256 amount, string deliveryOrderId);
    event CapacityUpdated(uint256 oldCapacity, uint256 newCapacity);
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 totalCost, address paymentAsset); // 购买事件
    event OracleUpdated(address oldOracle, address newOracle); // 预言机更新事件
    event UsdcUpdated(address oldUsdc, address newUsdc);
    event ExchangeRateUpdated(uint256 oldRate, uint256 newRate); // 兑换比例更新事件

    constructor(
        address defaultAdmin,
        address _oracleAddress,
        address _usdcAddress,
        uint256 _tokensPerTon
    ) ERC20("Real Sugar Token", "SUGAR") {
        require(_oracleAddress != address(0), "SugarToken: Invalid oracle address");
        require(_usdcAddress != address(0), "SugarToken: Invalid USDC address");
        require(_tokensPerTon > 0, "SugarToken: Tokens per ton must be > 0");

        // 授予各项权限
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(CAPACITY_MANAGER_ROLE, defaultAdmin);
        _grantRole(FINANCIAL_ROLE, defaultAdmin);

        // 初始化预言机和兑换比例
        sugarOracle = ISugarPriceOracle(_oracleAddress);
        usdc = IERC20Metadata(_usdcAddress);
        tokensPerTon = _tokensPerTon;
    }

    /**
     * @dev 更新物理产能安全锁
     */
    function updateCapacity(uint256 newCapacity) external onlyRole(CAPACITY_MANAGER_ROLE) {
        uint256 oldCapacity = maxMintableCapacity;
        maxMintableCapacity = newCapacity;
        emit CapacityUpdated(oldCapacity, newCapacity);
    }

    /**
     * @dev 管理员更新预言机地址
     */
    function setOracle(address _oracleAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_oracleAddress != address(0), "SugarToken: Invalid oracle address");
        address oldOracle = address(sugarOracle);
        sugarOracle = ISugarPriceOracle(_oracleAddress);
        emit OracleUpdated(oldOracle, _oracleAddress);
    }

    function setUsdc(address _usdcAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_usdcAddress != address(0), "SugarToken: Invalid USDC address");
        address oldUsdc = address(usdc);
        usdc = IERC20Metadata(_usdcAddress);
        emit UsdcUpdated(oldUsdc, _usdcAddress);
    }

    /**
     * @dev 管理员更新兑换比例 (例如市场包装规格发生变化)
     */
    function setTokensPerTon(uint256 _tokensPerTon) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokensPerTon > 0, "SugarToken: Tokens per ton must be > 0");
        uint256 oldRate = tokensPerTon;
        tokensPerTon = _tokensPerTon;
        emit ExchangeRateUpdated(oldRate, _tokensPerTon);
    }

    /**
     * @dev 前端用户购买代币 (核心新增功能)
     * @param amount 用户想要购买的代币数量（包含18位精度）
     */
    function buyTokens(uint256 amount) external payable {
        buyTokensWithETH(amount);
    }

    function buyTokensWithETH(uint256 amount) public payable {
        require(amount > 0, "SugarToken: Buy amount must be > 0");
        _validateCapacity(amount);

        uint256 pricePerTon = sugarOracle.getLatestPrice();
        require(pricePerTon > 0, "SugarToken: Invalid oracle price");

        uint256 totalCost = _calculateCost(amount, pricePerTon);

        require(msg.value >= totalCost, "SugarToken: Insufficient funds sent");

        _mint(msg.sender, amount);
        emit TokensPurchased(msg.sender, amount, totalCost, address(0));

        uint256 excess = msg.value - totalCost;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "SugarToken: Refund failed");
        }
    }

    function buyTokensWithUSDC(uint256 amount) external {
        require(amount > 0, "SugarToken: Buy amount must be > 0");
        _validateCapacity(amount);

        uint256 sugarUsdPricePerTon = sugarOracle.getLatestSugarUsdPricePerTon();
        require(sugarUsdPricePerTon > 0, "SugarToken: Invalid oracle price");

        uint256 totalUsdCost18 = _calculateCost(amount, sugarUsdPricePerTon);
        uint256 totalUsdcCost = _scaleFrom18(totalUsdCost18, usdc.decimals());

        IERC20(address(usdc)).safeTransferFrom(msg.sender, address(this), totalUsdcCost);

        _mint(msg.sender, amount);
        emit TokensPurchased(msg.sender, amount, totalUsdcCost, address(usdc));
    }

    /**
     * @dev 财务提取合约内的销售收入
     */
    function withdrawFunds(address payable to) external onlyRole(FINANCIAL_ROLE) {
        uint256 balance = address(this).balance;
        require(balance > 0, "SugarToken: No funds to withdraw");
        (bool success, ) = to.call{value: balance}("");
        require(success, "SugarToken: Withdraw failed");
    }

    function withdrawERC20(address token, address to) external onlyRole(FINANCIAL_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "SugarToken: No token funds to withdraw");
        IERC20(token).safeTransfer(to, balance);
    }

    /**
     * @dev 后台管理员直接铸造（保留用于法币入金、线下打款等非加密货币支付场景）
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= maxMintableCapacity, "SugarToken: Exceeds physical collateral capacity limit");
        _mint(to, amount);
    }

    /**
     * @dev 用户销毁代币，申请线下提货
     */
    function redeemPhysicalSugar(uint256 amount, string calldata deliveryOrderId) external {
        require(amount > 0, "SugarToken: Redeem amount must be greater than zero");
        _burn(msg.sender, amount);
        emit SugarRedeemed(msg.sender, amount, deliveryOrderId);
    }

    function _validateCapacity(uint256 amount) internal view {
        require(totalSupply() + amount <= maxMintableCapacity, "SugarToken: Exceeds physical capacity");
    }

    function _calculateCost(uint256 amount, uint256 pricePerTon) internal view returns (uint256) {
        return (amount * pricePerTon) / (tokensPerTon * 10 ** decimals());
    }

    function _scaleFrom18(uint256 amount18, uint8 targetDecimals) internal pure returns (uint256) {
        if (targetDecimals == 18) {
            return amount18;
        }

        if (targetDecimals < 18) {
            uint256 divisor = 10 ** (18 - targetDecimals);
            return (amount18 + divisor - 1) / divisor;
        }

        return amount18 * (10 ** (targetDecimals - 18));
    }
}
