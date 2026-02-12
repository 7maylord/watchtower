// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IProofOfReserveOracle
 * @notice Interface for reserve verification using Chainlink PoR and custodian APIs
 * @dev Ensures fund maintains proper collateralization ratio
 */
interface IProofOfReserveOracle {
    // Structs
    struct ReserveData {
        uint256 onChainReserves; // From Chainlink PoR feeds
        uint256 custodianReserves; // From custodian API verification
        uint256 totalShares; // Total fund shares outstanding
        uint256 reserveRatio; // Reserve ratio in basis points (10000 = 100%)
        uint256 lastVerified;
        bool isHealthy; // True if reserves >= shares value
    }

    // Events
    event ReservesVerified(
        uint256 onChainReserves,
        uint256 custodianReserves,
        uint256 reserveRatio,
        bool isHealthy,
        uint256 timestamp
    );
    event SafeguardActivated(string reason, uint256 timestamp);
    event ReserveThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // Errors
    error UnauthorizedCaller();
    error InsufficientReserves();
    error InvalidReserveData();

    /**
     * @notice Get current reserve status
     * @return reserves Current ReserveData struct
     */
    function getCurrentReserves()
        external
        view
        returns (ReserveData memory reserves);

    /**
     * @notice Update reserve data from CRE workflow
     * @dev Combines Chainlink PoR feed data with custodian verification
     * @param onChainReserves Value from Chainlink PoR feeds
     * @param custodianReserves Value verified from custodian APIs
     * @param totalShares Total outstanding fund shares
     */
    function updateReserves(
        uint256 onChainReserves,
        uint256 custodianReserves,
        uint256 totalShares
    ) external;

    /**
     * @notice Check if reserves are sufficient
     * @return isHealthy True if reserve ratio meets minimum threshold
     */
    function areReservesSufficient() external view returns (bool);

    /**
     * @notice Get minimum reserve ratio threshold
     * @return threshold Reserve ratio threshold in basis points
     */
    function getReserveThreshold() external view returns (uint256 threshold);

    /**
     * @notice Update minimum reserve ratio threshold
     * @dev Only callable by governance/owner
     * @param newThreshold New threshold in basis points (e.g., 9500 = 95%)
     */
    function setReserveThreshold(uint256 newThreshold) external;
}
