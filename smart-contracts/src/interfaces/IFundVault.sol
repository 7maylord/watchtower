// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFundVault
 * @notice Interface for the main tokenized fund vault with compliance and risk checks
 * @dev ERC20 fund shares with integrated compliance, risk, and reserve monitoring
 */
interface IFundVault {
    // Events
    event Deposited(address indexed investor, uint256 amount, uint256 shares);
    event Withdrawn(address indexed investor, uint256 shares, uint256 amount);
    event Rebalanced(string strategy, uint256 timestamp);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // Errors
    error NotCompliant();
    error RiskTooHigh();
    error InsufficientReserves();
    error Unauthorized();

    /**
     * @notice Deposit assets and mint fund shares
     * @dev Requires investor to be compliant
     * @param amount Amount of underlying asset to deposit
     * @return shares Number of shares minted
     */
    function deposit(uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw assets by burning fund shares
     * @param shares Number of shares to burn
     * @return amount Amount of underlying asset returned
     */
    function withdraw(uint256 shares) external returns (uint256 amount);

    /**
     * @notice Get the underlying asset address
     * @return asset Address of the underlying asset (e.g., USDC)
     */
    function asset() external view returns (address);

    /**
     * @notice Get total assets under management
     * @return totalAssets Total value of all assets in the fund
     */
    function totalAssets() external view returns (uint256);
}
