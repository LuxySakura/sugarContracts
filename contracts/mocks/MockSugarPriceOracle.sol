// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract MockSugarPriceOracle {
    uint256 private latestNativePrice;
    uint256 private latestSugarUsdPricePerTon;

    constructor(uint256 initialNativePrice, uint256 initialSugarUsdPrice) {
        latestNativePrice = initialNativePrice;
        latestSugarUsdPricePerTon = initialSugarUsdPrice;
    }

    function setLatestPrice(uint256 newPrice) external {
        latestNativePrice = newPrice;
    }

    function getLatestPrice() external view returns (uint256) {
        return latestNativePrice;
    }

    function setLatestSugarUsdPricePerTon(uint256 newPrice) external {
        latestSugarUsdPricePerTon = newPrice;
    }

    function getLatestSugarUsdPricePerTon() external view returns (uint256) {
        return latestSugarUsdPricePerTon;
    }
}
