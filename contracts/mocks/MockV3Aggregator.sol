// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockV3Aggregator
 */
contract MockV3Aggregator {
    uint8 public decimals;
    int256 public latestAnswer;

    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals = _decimals;
        latestAnswer = _initialAnswer;
    }

    // 模拟 Chainlink 的 latestRoundData 函数
    function latestRoundData()
    external
    view
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    )
    {
        return (0, latestAnswer, 0, 0, 0);
    }

    function updateAnswer(int256 _answer) public {
        latestAnswer = _answer;
    }
}