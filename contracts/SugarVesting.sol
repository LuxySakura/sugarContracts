// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SugarVesting is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidSchedule();
    error LengthMismatch();
    error AllocationBelowClaimed();
    error NothingToClaim();
    error InsufficientExcess();

    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    struct Allocation {
        uint256 totalAllocated;
        uint256 totalClaimed;
    }

    IERC20 public immutable sugarShare;
    uint64 public immutable startTimestamp;
    uint64 public immutable cliffDuration;
    uint64 public immutable vestingDuration;
    uint64 public immutable cliffEndTimestamp;
    uint64 public immutable vestingEndTimestamp;

    uint256 public totalAllocated;
    uint256 public totalClaimed;

    mapping(address => Allocation) public allocations;

    event AllocationUpdated(address indexed beneficiary, uint256 previousAmount, uint256 newAmount);
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    event ExcessWithdrawn(address indexed to, uint256 amount);

    constructor(
        address sugarShare_,
        address admin,
        uint64 startTimestamp_,
        uint64 cliffDuration_,
        uint64 vestingDuration_
    ) {
        if (sugarShare_ == address(0) || admin == address(0)) revert ZeroAddress();
        if (vestingDuration_ == 0) revert InvalidSchedule();

        sugarShare = IERC20(sugarShare_);
        startTimestamp = startTimestamp_;
        cliffDuration = cliffDuration_;
        vestingDuration = vestingDuration_;
        cliffEndTimestamp = startTimestamp_ + cliffDuration_;
        vestingEndTimestamp = startTimestamp_ + cliffDuration_ + vestingDuration_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ALLOCATOR_ROLE, admin);
    }

    function setAllocation(address beneficiary, uint256 totalAmount) external onlyRole(ALLOCATOR_ROLE) {
        _setAllocation(beneficiary, totalAmount);
    }

    function setAllocations(
        address[] calldata beneficiaries,
        uint256[] calldata totalAmounts
    ) external onlyRole(ALLOCATOR_ROLE) {
        uint256 length = beneficiaries.length;
        if (length != totalAmounts.length) revert LengthMismatch();

        for (uint256 i = 0; i < length; ++i) {
            _setAllocation(beneficiaries[i], totalAmounts[i]);
        }
    }

    function claim() external returns (uint256 claimedAmount) {
        claimedAmount = _claim(msg.sender);
    }

    function claimFor(address beneficiary) external returns (uint256 claimedAmount) {
        claimedAmount = _claim(beneficiary);
    }

    function vestedAmount(address beneficiary) public view returns (uint256) {
        return vestedAmountAt(beneficiary, uint64(block.timestamp));
    }

    function vestedAmountAt(address beneficiary, uint64 timestamp) public view returns (uint256) {
        Allocation memory allocation = allocations[beneficiary];

        if (timestamp < cliffEndTimestamp) {
            return 0;
        }

        if (timestamp >= vestingEndTimestamp) {
            return allocation.totalAllocated;
        }

        uint256 elapsed = timestamp - cliffEndTimestamp;
        return (allocation.totalAllocated * elapsed) / vestingDuration;
    }

    function releasableAmount(address beneficiary) public view returns (uint256) {
        Allocation memory allocation = allocations[beneficiary];
        return vestedAmount(beneficiary) - allocation.totalClaimed;
    }

    function outstandingObligation() public view returns (uint256) {
        return totalAllocated - totalClaimed;
    }

    function withdrawExcess(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();

        uint256 excess = sugarShare.balanceOf(address(this)) - outstandingObligation();
        if (amount > excess) revert InsufficientExcess();

        sugarShare.safeTransfer(to, amount);
        emit ExcessWithdrawn(to, amount);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _claim(address beneficiary) internal nonReentrant returns (uint256 claimedAmount) {
        claimedAmount = releasableAmount(beneficiary);
        if (claimedAmount == 0) revert NothingToClaim();

        Allocation storage allocation = allocations[beneficiary];
        allocation.totalClaimed += claimedAmount;
        totalClaimed += claimedAmount;

        sugarShare.safeTransfer(beneficiary, claimedAmount);
        emit TokensClaimed(beneficiary, claimedAmount);
    }

    function _setAllocation(address beneficiary, uint256 totalAmount) internal {
        if (beneficiary == address(0)) revert ZeroAddress();

        Allocation storage allocation = allocations[beneficiary];
        uint256 previousAmount = allocation.totalAllocated;
        if (totalAmount < allocation.totalClaimed) revert AllocationBelowClaimed();

        totalAllocated = totalAllocated + totalAmount - previousAmount;
        allocation.totalAllocated = totalAmount;

        emit AllocationUpdated(beneficiary, previousAmount, totalAmount);
    }
}
