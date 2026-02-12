// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IRiskOracle.sol";

/**
 * @title RiskOracle
 * @notice Stores AI-powered risk scores from CRE workflows
 * @dev Updated by portfolio health monitoring workflow every 5 minutes
 */
contract RiskOracle is IRiskOracle, AccessControl, Pausable {
    // Roles
    bytes32 public constant CRE_WORKFLOW_ROLE = keccak256("CRE_WORKFLOW_ROLE");

    // Constants
    uint8 public constant LIQUIDATION_THRESHOLD = 85; // Risk score threshold for auto-liquidation
    uint256 public constant MAX_DATA_AGE = 15 minutes; // Maximum acceptable data age

    // Storage
    RiskScore private _currentRiskScore;
    mapping(string => ProtocolHealth) private _protocolHealth;

    /**
     * @notice Constructor
     * @param admin Admin address (receives DEFAULT_ADMIN_ROLE)
     */
    constructor(address admin) {
        if (admin == address(0)) revert InvalidRiskScore();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        // Initialize with safe score
        _currentRiskScore = RiskScore({
            overallScore: 0,
            timestamp: block.timestamp,
            ipfsHash: ""
        });
    }

    // ============ View Functions ============

    /**
     * @inheritdoc IRiskOracle
     */
    function getCurrentRiskScore()
        external
        view
        override
        returns (uint8 score, uint256 timestamp, string memory ipfsHash)
    {
        RiskScore memory current = _currentRiskScore;
        return (current.overallScore, current.timestamp, current.ipfsHash);
    }

    /**
     * @inheritdoc IRiskOracle
     */
    function getProtocolHealth(
        string calldata protocolName
    ) external view override returns (ProtocolHealth memory health) {
        return _protocolHealth[protocolName];
    }

    /**
     * @inheritdoc IRiskOracle
     */
    function shouldTriggerLiquidation() external view override returns (bool) {
        // Check if risk score exceeds threshold AND data is recent
        return
            _currentRiskScore.overallScore >= LIQUIDATION_THRESHOLD &&
            (block.timestamp - _currentRiskScore.timestamp <= MAX_DATA_AGE);
    }

    // ============ State-Changing Functions ============

    /**
     * @inheritdoc IRiskOracle
     */
    function updateRiskScore(
        uint8 newScore,
        string calldata ipfsHash
    ) external override whenNotPaused onlyRole(CRE_WORKFLOW_ROLE) {
        if (newScore > 100) revert InvalidRiskScore();

        uint8 previousScore = _currentRiskScore.overallScore;

        _currentRiskScore = RiskScore({
            overallScore: newScore,
            timestamp: block.timestamp,
            ipfsHash: ipfsHash
        });

        emit RiskScoreUpdated(newScore, ipfsHash, block.timestamp);

        // Trigger auto-liquidation event if threshold crossed
        if (
            previousScore < LIQUIDATION_THRESHOLD &&
            newScore >= LIQUIDATION_THRESHOLD
        ) {
            emit AutoLiquidationTriggered(newScore, block.timestamp);
        }
    }

    /**
     * @inheritdoc IRiskOracle
     */
    function updateProtocolHealth(
        string calldata protocolName,
        uint8 healthScore,
        uint256 tvl,
        uint256 utilizationRate
    ) external override whenNotPaused onlyRole(CRE_WORKFLOW_ROLE) {
        if (healthScore > 100) revert InvalidRiskScore();
        if (utilizationRate > 10000) revert InvalidRiskScore(); // Max 100%

        _protocolHealth[protocolName] = ProtocolHealth({
            protocolName: protocolName,
            healthScore: healthScore,
            tvl: tvl,
            utilizationRate: utilizationRate,
            lastUpdate: block.timestamp
        });

        emit ProtocolHealthUpdated(protocolName, healthScore, block.timestamp);
    }

    // ============ Admin Functions ============

    /**
     * @notice Pause the contract
     * @dev Only callable by admin
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by admin
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
