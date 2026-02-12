// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IRiskOracle
 * @notice Interface for real-time risk score updates from CRE AI workflows
 * @dev Stores overall fund risk score and protocol-specific health metrics
 */
interface IRiskOracle {
    // Structs
    struct RiskScore {
        uint8 overallScore; // 0-100 (0 = safe, 100 = critical)
        uint256 timestamp;
        string ipfsHash; // IPFS hash of AI reasoning
    }

    struct ProtocolHealth {
        string protocolName; // e.g., "Aave", "Compound"
        uint8 healthScore; // 0-100
        uint256 tvl;
        uint256 utilizationRate; // in basis points (0-10000)
        uint256 lastUpdate;
    }

    // Events
    event RiskScoreUpdated(
        uint8 overallScore,
        string ipfsHash,
        uint256 timestamp
    );
    event ProtocolHealthUpdated(
        string protocolName,
        uint8 healthScore,
        uint256 timestamp
    );
    event AutoLiquidationTriggered(uint8 riskScore, uint256 timestamp);

    // Errors
    error UnauthorizedCaller();
    error InvalidRiskScore();
    error StaleData();

    /**
     * @notice Get current overall risk score
     * @return score Current risk score (0-100)
     * @return timestamp When score was last updated
     * @return ipfsHash IPFS hash of AI analysis
     */
    function getCurrentRiskScore()
        external
        view
        returns (uint8 score, uint256 timestamp, string memory ipfsHash);

    /**
     * @notice Update overall risk score
     * @dev Only callable by authorized CRE workflow
     * @param newScore Risk score (0-100)
     * @param ipfsHash IPFS hash containing AI reasoning
     */
    function updateRiskScore(uint8 newScore, string calldata ipfsHash) external;

    /**
     * @notice Get health status of a specific protocol
     * @param protocolName Name of the protocol
     * @return health ProtocolHealth struct with current data
     */
    function getProtocolHealth(
        string calldata protocolName
    ) external view returns (ProtocolHealth memory health);

    /**
     * @notice Update protocol health metrics
     * @dev Called by CRE portfolio monitoring workflow
     * @param protocolName Name of the protocol
     * @param healthScore Health score (0-100)
     * @param tvl Total Value Locked in protocol
     * @param utilizationRate Utilization rate in basis points
     */
    function updateProtocolHealth(
        string calldata protocolName,
        uint8 healthScore,
        uint256 tvl,
        uint256 utilizationRate
    ) external;

    /**
     * @notice Check if risk score exceeds liquidation threshold
     * @return shouldLiquidate True if auto-liquidation should trigger
     */
    function shouldTriggerLiquidation() external view returns (bool);
}
