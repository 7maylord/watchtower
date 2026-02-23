// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockAavePool
 * @notice A simulated Aave V3 Pool for testing Watchtower risk monitoring
 * @dev Mints Mock aUSDC 1:1 for deposited USDC. Includes admin functions to mock unhealthy states.
 */
contract MockAavePool is ERC20, Ownable {
    IERC20 public immutable underlyingAsset;

    // Risk simulation states
    bool public isPaused;
    uint256 public simulatedUtilizationRate = 4500; // In bps, 45% default
    uint256 public simulatedHealthScore = 100; // 0-100, 100 is perfectly healthy

    event Supplied(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RiskStateChanged(
        bool paused,
        uint256 utilizationRate,
        uint256 healthScore
    );

    constructor(
        address _underlyingAsset,
        address initialOwner
    ) ERC20("Mock Aave interest bearing USDC", "aUSDC") Ownable(initialOwner) {
        underlyingAsset = IERC20(_underlyingAsset);
    }

    /**
     * @notice Simulates Aave V3 supply
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        require(!isPaused, "Pool is paused (simulated risk)");
        require(asset == address(underlyingAsset), "Invalid asset");
        require(amount > 0, "Amount must be > 0");

        // Transfer underlying to pool
        bool success = underlyingAsset.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Transfer failed");

        // Mint aTokens 1:1
        _mint(onBehalfOf, amount);

        emit Supplied(onBehalfOf, amount);
    }

    /**
     * @notice Simulates Aave V3 withdraw
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        require(!isPaused, "Pool is paused (simulated risk)");
        require(asset == address(underlyingAsset), "Invalid asset");

        uint256 balance = balanceOf(msg.sender);
        uint256 amountToWithdraw = amount;

        // Aave allows type(uint256).max to withdraw everything
        if (amount == type(uint256).max) {
            amountToWithdraw = balance;
        }

        require(balance >= amountToWithdraw, "Insufficient aToken balance");

        // Burn aTokens
        _burn(msg.sender, amountToWithdraw);

        // Transfer underlying to user
        bool success = underlyingAsset.transfer(to, amountToWithdraw);
        require(success, "Transfer failed");

        emit Withdrawn(to, amountToWithdraw);
        return amountToWithdraw;
    }

    // ==========================================
    // Admin Functions for Risk Simulation
    // ==========================================

    /**
     * @notice Set simulated risk parameters to test CRE workflow detection
     */
    function setSimulatedRiskState(
        bool _isPaused,
        uint256 _utilizationRate,
        uint256 _healthScore
    ) external onlyOwner {
        require(_utilizationRate <= 10000, "Max utilization is 10000 bps");
        require(_healthScore <= 100, "Max health score is 100");

        isPaused = _isPaused;
        simulatedUtilizationRate = _utilizationRate;
        simulatedHealthScore = _healthScore;

        emit RiskStateChanged(_isPaused, _utilizationRate, _healthScore);
    }

    /**
     * @notice Get protocol health data for CRE workflow
     */
    function getProtocolHealth()
        external
        view
        returns (
            bool paused,
            uint256 utilizationRateBps,
            uint256 healthScore,
            uint256 totalLiquidity
        )
    {
        return (
            isPaused,
            simulatedUtilizationRate,
            simulatedHealthScore,
            underlyingAsset.balanceOf(address(this))
        );
    }

    /**
     * @notice Helper for test environments to simulate yield
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        // Normally Aave syncs this with the underlying asset, but for tests
        // minting the aToken is sufficient.
    }
}
