// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/**
 * @title SugarPriceOracle
 */
contract SugarPriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    uint8 public constant TARGET_DECIMALS = 18;

    AggregatorV3Interface public nativeUsdFeed;

    // USD price of 1 metric ton of sugar, scaled to 18 decimals.
    uint256 public sugarUsdPricePerTon;
    uint256 public sugarPriceUpdatedAt;

    // Maximum allowed age for the offchain sugar price and the native/USD feed.
    uint256 public maxSugarPriceAge;
    uint256 public maxNativePriceAge;

    event SugarPriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 updatedAt);
    event NativeUsdFeedUpdated(address oldFeed, address newFeed);
    event MaxSugarPriceAgeUpdated(uint256 oldAge, uint256 newAge);
    event MaxNativePriceAgeUpdated(uint256 oldAge, uint256 newAge);

    constructor(
        address defaultAdmin,
        address updater,
        address nativeUsdFeedAddress,
        uint256 initialSugarUsdPricePerTon,
        uint256 initialMaxSugarPriceAge,
        uint256 initialMaxNativePriceAge
    ) {
        require(defaultAdmin != address(0), "SugarOracle: Invalid admin");
        require(updater != address(0), "SugarOracle: Invalid updater");
        require(nativeUsdFeedAddress != address(0), "SugarOracle: Invalid feed");
        require(initialSugarUsdPricePerTon > 0, "SugarOracle: Invalid sugar price");
        require(initialMaxSugarPriceAge > 0, "SugarOracle: Invalid sugar max age");
        require(initialMaxNativePriceAge > 0, "SugarOracle: Invalid native max age");

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PRICE_UPDATER_ROLE, updater);

        nativeUsdFeed = AggregatorV3Interface(nativeUsdFeedAddress);
        sugarUsdPricePerTon = initialSugarUsdPricePerTon;
        sugarPriceUpdatedAt = block.timestamp;
        maxSugarPriceAge = initialMaxSugarPriceAge;
        maxNativePriceAge = initialMaxNativePriceAge;
    }

    /**
     * @dev Offchain updater writes the latest sugar market price in USD per ton.
     * Example: 650 USD/ton => 650e18.
     */
    function updateSugarUsdPrice(uint256 newSugarUsdPricePerTon) external onlyRole(PRICE_UPDATER_ROLE) {
        require(newSugarUsdPricePerTon > 0, "SugarOracle: Invalid sugar price");

        uint256 oldPrice = sugarUsdPricePerTon;
        sugarUsdPricePerTon = newSugarUsdPricePerTon;
        sugarPriceUpdatedAt = block.timestamp;

        emit SugarPriceUpdated(oldPrice, newSugarUsdPricePerTon, block.timestamp);
    }

    function setNativeUsdFeed(address newNativeUsdFeed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newNativeUsdFeed != address(0), "SugarOracle: Invalid feed");

        address oldFeed = address(nativeUsdFeed);
        nativeUsdFeed = AggregatorV3Interface(newNativeUsdFeed);

        emit NativeUsdFeedUpdated(oldFeed, newNativeUsdFeed);
    }

    function setMaxSugarPriceAge(uint256 newMaxSugarPriceAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMaxSugarPriceAge > 0, "SugarOracle: Invalid sugar max age");

        uint256 oldAge = maxSugarPriceAge;
        maxSugarPriceAge = newMaxSugarPriceAge;

        emit MaxSugarPriceAgeUpdated(oldAge, newMaxSugarPriceAge);
    }

    function setMaxNativePriceAge(uint256 newMaxNativePriceAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMaxNativePriceAge > 0, "SugarOracle: Invalid native max age");

        uint256 oldAge = maxNativePriceAge;
        maxNativePriceAge = newMaxNativePriceAge;

        emit MaxNativePriceAgeUpdated(oldAge, newMaxNativePriceAge);
    }

    /**
     * @dev Returns the native token price for 1 metric ton of sugar, scaled to 18 decimals.
     * Example:
     * - sugarUsdPricePerTon = 600e18
     * - ETH/USD = 3000e18
     * => result = 0.2e18 ETH per ton
     */
    function getLatestPrice() external view returns (uint256) {
        uint256 latestSugarUsdPrice = _getValidatedSugarUsdPrice();

        (, int256 nativeUsdAnswer, , uint256 nativeUpdatedAt, ) = nativeUsdFeed.latestRoundData();
        require(nativeUsdAnswer > 0, "SugarOracle: Invalid native price");
        require(nativeUpdatedAt > 0, "SugarOracle: Native price incomplete");
        require(block.timestamp - nativeUpdatedAt <= maxNativePriceAge, "SugarOracle: Native price stale");

        uint256 nativeUsdPrice18 = _scaleToTargetDecimals(
            uint256(nativeUsdAnswer),
            nativeUsdFeed.decimals()
        );

        return (latestSugarUsdPrice * 10 ** TARGET_DECIMALS) / nativeUsdPrice18;
    }

    function getLatestSugarUsdPricePerTon() external view returns (uint256) {
        return _getValidatedSugarUsdPrice();
    }

    function getLatestNativeUsdPrice() external view returns (uint256) {
        (, int256 nativeUsdAnswer, , uint256 nativeUpdatedAt, ) = nativeUsdFeed.latestRoundData();
        require(nativeUsdAnswer > 0, "SugarOracle: Invalid native price");
        require(nativeUpdatedAt > 0, "SugarOracle: Native price incomplete");
        require(block.timestamp - nativeUpdatedAt <= maxNativePriceAge, "SugarOracle: Native price stale");

        return _scaleToTargetDecimals(uint256(nativeUsdAnswer), nativeUsdFeed.decimals());
    }

    function _scaleToTargetDecimals(uint256 value, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == TARGET_DECIMALS) {
            return value;
        }

        if (decimals_ < TARGET_DECIMALS) {
            return value * (10 ** (TARGET_DECIMALS - decimals_));
        }

        return value / (10 ** (decimals_ - TARGET_DECIMALS));
    }

    function _getValidatedSugarUsdPrice() internal view returns (uint256) {
        require(block.timestamp - sugarPriceUpdatedAt <= maxSugarPriceAge, "SugarOracle: Sugar price stale");
        require(sugarUsdPricePerTon > 0, "SugarOracle: Invalid sugar price");

        return sugarUsdPricePerTon;
    }
}
