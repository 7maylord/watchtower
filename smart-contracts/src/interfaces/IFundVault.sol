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
    event SharesBridged(
        uint64 indexed destinationChainSelector,
        address indexed receiver,
        uint256 amount,
        bytes32 messageId
    );

    // Errors
    error NotCompliant();
    error RiskTooHigh();
    error InsufficientReserves();
    error Unauthorized();

    function deposit(uint256 amount) external returns (uint256 shares);
    function withdraw(uint256 shares) external returns (uint256 amount);
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);

    function bridgeShares(
        uint64 destChainSelector,
        address receiver,
        uint256 amount
    ) external payable returns (bytes32 messageId);

    function getBridgeFee(
        uint64 destChainSelector,
        address receiver,
        uint256 amount
    ) external view returns (uint256 fee);
}
