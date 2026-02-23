// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockCompoundReserve
 * @notice A simulated Compound V3 market for testing Watchtower risk monitoring
 * @dev Mints Mock cUSDCv3 1:1 for deposited USDC. Includes admin functions to mock unhealthy states.
 */
contract MockCompoundReserve is ERC20, Ownable {
    IERC20 public immutable underlyingAsset;

    // Risk simulation states
    bool public isPaused;
    uint256 public simulatedUtilizationRate = 3500; // In bps, 35% default
    uint256 public simulatedReserveFactor = 1000; // 10%
    uint256 public simulatedHealthScore = 100; // 0-100

    event Supplied(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RiskStateChanged(
        bool paused,
        uint256 utilizationRateBps,
        uint256 healthScore
    );

    constructor(
        address _underlyingAsset,
        address initialOwner
    ) ERC20("Mock Compound v3 USDC", "cUSDCv3") Ownable(initialOwner) {
        underlyingAsset = IERC20(_underlyingAsset);
    }

    /**
     * @notice Simulates Compound V3 supply
     */
    function supply(address asset, uint256 amount) external {
        require(!isPaused, "Market is paused (simulated risk)");
        require(asset == address(underlyingAsset), "Invalid asset");
        require(amount > 0, "Amount must be > 0");

        // Transfer underlying to pool
        bool success = underlyingAsset.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Transfer failed");

        // Mint cTokens 1:1
        _mint(msg.sender, amount);

        emit Supplied(msg.sender, amount);
    }

    /**
     * @notice Simulates Compound V3 withdraw
     */
    function withdraw(address asset, uint256 amount) external {
        require(!isPaused, "Market is paused (simulated risk)");
        require(asset == address(underlyingAsset), "Invalid asset");

        uint256 balance = balanceOf(msg.sender);
        uint256 amountToWithdraw = amount;

        if (amount == type(uint256).max) {
            amountToWithdraw = balance;
        }

        require(balance >= amountToWithdraw, "Insufficient cToken balance");

        // Burn cTokens
        _burn(msg.sender, amountToWithdraw);

        // Transfer underlying to user
        bool success = underlyingAsset.transfer(msg.sender, amountToWithdraw);
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amountToWithdraw);
    }

    /**
     * @notice Simulates Compound V3 base asset tracking
     */
    function baseToken() external view returns (address) {
        return address(underlyingAsset);
    }

    /**
     * @notice Get balance of underlying asset
     */
    function balanceOfUnderlying(
        address account
    ) external view returns (uint256) {
        return balanceOf(account); // 1:1 in mock
    }

    // ==========================================
    // Admin Functions for Risk Simulation
    // ==========================================

    function setSimulatedRiskState(
        bool _isPaused,
        uint256 _utilizationRateBps,
        uint256 _healthScore
    ) external onlyOwner {
        require(_utilizationRateBps <= 10000, "Max utilization is 10000 bps");
        require(_healthScore <= 100, "Max health score is 100");

        isPaused = _isPaused;
        simulatedUtilizationRate = _utilizationRateBps;
        simulatedHealthScore = _healthScore;

        emit RiskStateChanged(_isPaused, _utilizationRateBps, _healthScore);
    }

    function getProtocolHealth()
        external
        view
        returns (
            bool paused,
            uint256 utilizationRateBps,
            uint256 reserveFactorBps,
            uint256 healthScore,
            uint256 totalLiquidity
        )
    {
        return (
            isPaused,
            simulatedUtilizationRate,
            simulatedReserveFactor,
            simulatedHealthScore,
            underlyingAsset.balanceOf(address(this))
        );
    }
}
