// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.5.0
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract SugarCoin is ERC20, ERC20Burnable, ERC20Pausable, AccessControl {
    bytes32 public constant TRANSFER_ROLE = keccak256("TRANSFER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bool public tradingEnabled = false;

    event TradingEnabled();

    constructor(address defaultAdmin)
    ERC20("SugarCoin", "SUGAR")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(TRANSFER_ROLE, defaultAdmin);

        _mint(defaultAdmin, 200000000 * 10 ** decimals());
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function enableTrading() external onlyRole(DEFAULT_ADMIN_ROLE) {
        tradingEnabled = true;
        emit TradingEnabled();
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {

        if (!tradingEnabled) {

            bool isMinting = (from == address(0));
            bool isBurning = (to == address(0));

            bool isWhitelisted = hasRole(TRANSFER_ROLE, from) || hasRole(TRANSFER_ROLE, to);

            if (!isMinting && !isBurning && !isWhitelisted) {
                revert("Trading is currently disabled");
            }
        }

        super._update(from, to, value);
    }
}
