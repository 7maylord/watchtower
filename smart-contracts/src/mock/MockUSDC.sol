// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testing
 * @dev Mintable ERC20 for local testing and staging environments
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6; // USDC has 6 decimals

    constructor() ERC20("Mock USDC", "USDC") Ownable(msg.sender) {
        // Mint 1 million USDC to deployer for testing
        _mint(msg.sender, 1_000_000 * 10 ** DECIMALS);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function faucet() external {
        _mint(msg.sender, 1000 * 10 ** DECIMALS);
    }
}
