// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract Presale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public saleToken;
    IERC20 public usdt;
    IERC20 public usdc;

    AggregatorV3Interface public priceFeed;

    struct RoundInfo {
        uint256 price;
        uint256 totalSold;
        uint256 cap;
        bool isActive;
    }

    mapping(uint8 => RoundInfo) public rounds;
    uint8 public currentRoundIndex;
    uint256 public totalTokensSold;

    mapping(address => uint256) public purchasedTokens;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost, string currency);
    event RoundStarted(uint8 roundIndex, uint256 price);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address _saleToken,
        address _usdt,
        address _usdc,
        address _priceFeed
    ) Ownable(msg.sender) {
        saleToken = IERC20(_saleToken);
        usdt = IERC20(_usdt);
        usdc = IERC20(_usdc);
        priceFeed = AggregatorV3Interface(_priceFeed);

        uint256 capPerRound = 50_000_000 * 1e18;

        rounds[1] = RoundInfo(0, 0, capPerRound, false);
        rounds[2] = RoundInfo(0, 0, capPerRound, false);
        rounds[3] = RoundInfo(0, 0, capPerRound, false);
        rounds[4] = RoundInfo(0, 0, capPerRound, false);

        currentRoundIndex = 1;
    }

    function startRound(uint8 _round, uint256 _price) external onlyOwner {
        require(_round >= 1 && _round <= 4, "Invalid round");
        require(_price > 0, "Price must be > 0");

        if(currentRoundIndex != _round && rounds[currentRoundIndex].isActive) {
            rounds[currentRoundIndex].isActive = false;
        }

        currentRoundIndex = _round;
        rounds[_round].price = _price;
        rounds[_round].isActive = true;

        emit RoundStarted(_round, _price);
    }

    function pauseRound() external onlyOwner {
        rounds[currentRoundIndex].isActive = false;
    }

    function buyWithUSDT(uint256 _usdtAmount) external nonReentrant {
        _processStablecoinPurchase(_usdtAmount, usdt, "USDT");
    }

    function buyWithUSDC(uint256 _usdcAmount) external nonReentrant {
        _processStablecoinPurchase(_usdcAmount, usdc, "USDC");
    }

    function buyWithETH() external payable nonReentrant {
        require(rounds[currentRoundIndex].isActive, "Round not active");
        require(msg.value > 0, "Send ETH");

        uint256 ethPriceInUSD = getLatestETHPrice();
        uint256 usdValue = (msg.value * ethPriceInUSD) / 1e18;

        uint256 tokensToBuy = (usdValue * 1e18) / rounds[currentRoundIndex].price;

        _verifyAndRecordPurchase(tokensToBuy, msg.value, "ETH");
    }

    function _processStablecoinPurchase(uint256 _amount, IERC20 _token, string memory _currency) internal {
        require(rounds[currentRoundIndex].isActive, "Round not active");
        require(_amount > 0, "Amount must be > 0");

        uint256 usdValue18 = _amount * 1e12;

        uint256 tokensToBuy = (usdValue18 * 1e18) / rounds[currentRoundIndex].price;

        _token.safeTransferFrom(msg.sender, address(this), _amount);

        _verifyAndRecordPurchase(tokensToBuy, _amount, _currency);
    }

    function _verifyAndRecordPurchase(uint256 _tokenAmount, uint256 _cost, string memory _currency) internal {
        RoundInfo storage round = rounds[currentRoundIndex];

        require(round.totalSold + _tokenAmount <= round.cap, "Round cap exceeded");
        require(totalTokensSold + _tokenAmount <= 200_000_000 * 1e18, "Total cap exceeded");

        round.totalSold += _tokenAmount;
        totalTokensSold += _tokenAmount;
        purchasedTokens[msg.sender] += _tokenAmount;

        saleToken.safeTransfer(msg.sender, _tokenAmount);

        emit TokensPurchased(msg.sender, _tokenAmount, _cost, _currency);
    }

    function getLatestETHPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return uint256(price) * 1e10;
    }

    function getTokensAmountPerETH() external view returns (uint256) {
        if (!rounds[currentRoundIndex].isActive) return 0;
        uint256 ethPrice = getLatestETHPrice();
        return (ethPrice * 1e18) / rounds[currentRoundIndex].price;
    }

    function withdrawFunds(address _token) external onlyOwner {
        if (_token == address(0)) {
            payable(owner()).transfer(address(this).balance);
        } else {
            IERC20 token = IERC20(_token);
            token.safeTransfer(owner(), token.balanceOf(address(this)));
        }
        emit FundsWithdrawn(owner(), 0);
    }
}