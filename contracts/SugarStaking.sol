// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SugarStaking is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidBoostWindow();
    error InsufficientStake();
    error SnapshotNotConfigured();
    error InvalidSnapshotTimestamp();

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SNAPSHOT_MANAGER_ROLE = keccak256("SNAPSHOT_MANAGER_ROLE");

    uint256 public constant BASE_MULTIPLIER_BPS = 10_000;
    uint256 public constant MAX_MULTIPLIER_BPS = 20_000;

    struct Position {
        uint256 balance;
        uint64 weightedTimestamp;
    }

    IERC20 public immutable sugarShare;
    uint256 public immutable maxBoostDuration;
    uint64 public snapshotTimestamp;
    uint256 public totalStaked;

    mapping(address => Position) public positions;

    event Staked(address indexed account, uint256 amount, uint256 newBalance);
    event Unstaked(address indexed account, uint256 amount, uint256 remainingBalance);
    event SnapshotTimestampUpdated(uint64 snapshotTimestamp);

    constructor(address sugarShare_, address admin, uint256 maxBoostDuration_) {
        if (sugarShare_ == address(0) || admin == address(0)) revert ZeroAddress();
        if (maxBoostDuration_ == 0) revert InvalidBoostWindow();

        sugarShare = IERC20(sugarShare_);
        maxBoostDuration = maxBoostDuration_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(SNAPSHOT_MANAGER_ROLE, admin);
    }

    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage position = positions[msg.sender];
        uint64 currentTime = uint64(block.timestamp);
        uint256 previousBalance = position.balance;
        uint256 newBalance = previousBalance + amount;

        if (previousBalance == 0) {
            position.weightedTimestamp = currentTime;
        } else {
            position.weightedTimestamp = uint64(
                ((uint256(position.weightedTimestamp) * previousBalance) + (uint256(currentTime) * amount)) /
                    newBalance
            );
        }

        position.balance = newBalance;
        totalStaked += amount;

        sugarShare.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, newBalance);
    }

    function unstake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage position = positions[msg.sender];
        uint256 currentBalance = position.balance;
        if (amount > currentBalance) revert InsufficientStake();

        uint256 remainingBalance = currentBalance - amount;
        position.balance = remainingBalance;
        totalStaked -= amount;

        if (remainingBalance == 0) {
            position.weightedTimestamp = 0;
        }

        sugarShare.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, remainingBalance);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setSnapshotTimestamp(uint64 snapshotTimestamp_) external onlyRole(SNAPSHOT_MANAGER_ROLE) {
        if (snapshotTimestamp_ < block.timestamp) revert InvalidSnapshotTimestamp();

        snapshotTimestamp = snapshotTimestamp_;
        emit SnapshotTimestampUpdated(snapshotTimestamp_);
    }

    function stakingAge(address account) public view returns (uint256) {
        return stakingAgeAt(account, uint64(block.timestamp));
    }

    function stakingAgeAt(address account, uint64 timestamp) public view returns (uint256) {
        Position memory position = positions[account];
        if (position.balance == 0 || position.weightedTimestamp == 0 || timestamp <= position.weightedTimestamp) {
            return 0;
        }

        return timestamp - position.weightedTimestamp;
    }

    function currentMultiplierBps(address account) public view returns (uint256) {
        return multiplierBpsAt(account, uint64(block.timestamp));
    }

    function multiplierBpsAt(address account, uint64 timestamp) public view returns (uint256) {
        Position memory position = positions[account];
        if (position.balance == 0) {
            return BASE_MULTIPLIER_BPS;
        }

        uint256 age = stakingAgeAt(account, timestamp);
        if (age >= maxBoostDuration) {
            return MAX_MULTIPLIER_BPS;
        }

        return BASE_MULTIPLIER_BPS + ((MAX_MULTIPLIER_BPS - BASE_MULTIPLIER_BPS) * age) / maxBoostDuration;
    }

    function stakingPower(address account) public view returns (uint256) {
        return stakingPowerAt(account, uint64(block.timestamp));
    }

    function stakingPowerAt(address account, uint64 timestamp) public view returns (uint256) {
        Position memory position = positions[account];
        return (position.balance * multiplierBpsAt(account, timestamp)) / BASE_MULTIPLIER_BPS;
    }

    function snapshotMultiplierBps(address account) external view returns (uint256) {
        uint64 snapshotTimestamp_ = snapshotTimestamp;
        if (snapshotTimestamp_ == 0) revert SnapshotNotConfigured();

        return multiplierBpsAt(account, snapshotTimestamp_);
    }

    function snapshotStakingPower(address account) external view returns (uint256) {
        uint64 snapshotTimestamp_ = snapshotTimestamp;
        if (snapshotTimestamp_ == 0) revert SnapshotNotConfigured();

        return stakingPowerAt(account, snapshotTimestamp_);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
