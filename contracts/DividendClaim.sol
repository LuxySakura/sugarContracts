// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DividendClaim is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidMerkleRoot();
    error InvalidDeadline();
    error DistributionNotFound();
    error ClaimWindowClosed();
    error ClaimWindowStillOpen();
    error AlreadyClaimed();
    error InvalidProof();
    error NothingToSweep();

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant SWEEPER_ROLE = keccak256("SWEEPER_ROLE");

    struct Distribution {
        bytes32 merkleRoot;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 sweptAmount;
        uint64 claimDeadline;
        bytes32 metadataHash;
    }

    IERC20 public immutable usdc;
    uint256 public currentEpoch;

    mapping(uint256 => Distribution) public distributions;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitMap;

    event DistributionCreated(
        uint256 indexed epoch,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 claimDeadline,
        bytes32 metadataHash
    );
    event Claimed(uint256 indexed epoch, uint256 indexed index, address indexed account, uint256 amount);
    event Swept(uint256 indexed epoch, address indexed to, uint256 amount);

    constructor(address usdc_, address admin) {
        if (usdc_ == address(0) || admin == address(0)) revert ZeroAddress();

        usdc = IERC20(usdc_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DISTRIBUTOR_ROLE, admin);
        _grantRole(SWEEPER_ROLE, admin);
    }

    function createDistribution(
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 claimDeadline,
        bytes32 metadataHash
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 epoch) {
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (totalAmount == 0) revert ZeroAmount();
        if (claimDeadline <= block.timestamp) revert InvalidDeadline();

        epoch = ++currentEpoch;
        distributions[epoch] = Distribution({
            merkleRoot: merkleRoot,
            totalAmount: totalAmount,
            claimedAmount: 0,
            sweptAmount: 0,
            claimDeadline: claimDeadline,
            metadataHash: metadataHash
        });

        usdc.safeTransferFrom(msg.sender, address(this), totalAmount);
        emit DistributionCreated(epoch, merkleRoot, totalAmount, claimDeadline, metadataHash);
    }

    function isClaimed(uint256 epoch, uint256 index) public view returns (bool) {
        uint256 claimedWord = claimedBitMap[epoch][index / 256];
        uint256 mask = 1 << (index % 256);
        return claimedWord & mask == mask;
    }

    function availableToSweep(uint256 epoch) public view returns (uint256) {
        Distribution memory distribution = distributions[epoch];
        if (distribution.merkleRoot == bytes32(0)) revert DistributionNotFound();

        return distribution.totalAmount - distribution.claimedAmount - distribution.sweptAmount;
    }

    function claim(
        uint256 epoch,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        if (account == address(0)) revert ZeroAddress();

        Distribution storage distribution = distributions[epoch];
        if (distribution.merkleRoot == bytes32(0)) revert DistributionNotFound();
        if (block.timestamp > distribution.claimDeadline) revert ClaimWindowClosed();
        if (isClaimed(epoch, index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(abi.encode(index, account, amount));
        bool valid = MerkleProof.verifyCalldata(merkleProof, distribution.merkleRoot, leaf);
        if (!valid) revert InvalidProof();

        _setClaimed(epoch, index);
        distribution.claimedAmount += amount;

        usdc.safeTransfer(account, amount);
        emit Claimed(epoch, index, account, amount);
    }

    function sweepExpiredDistribution(uint256 epoch, address to) external onlyRole(SWEEPER_ROLE) {
        if (to == address(0)) revert ZeroAddress();

        Distribution storage distribution = distributions[epoch];
        if (distribution.merkleRoot == bytes32(0)) revert DistributionNotFound();
        if (block.timestamp <= distribution.claimDeadline) revert ClaimWindowStillOpen();

        uint256 remaining = distribution.totalAmount - distribution.claimedAmount - distribution.sweptAmount;
        if (remaining == 0) revert NothingToSweep();

        distribution.sweptAmount += remaining;
        usdc.safeTransfer(to, remaining);

        emit Swept(epoch, to, remaining);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _setClaimed(uint256 epoch, uint256 index) internal {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[epoch][claimedWordIndex] |= 1 << claimedBitIndex;
    }
}
