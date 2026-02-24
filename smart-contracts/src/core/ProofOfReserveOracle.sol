// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IProofOfReserveOracle.sol";

/**
 * @title ProofOfReserveOracle
 * @notice Verifies fund reserves using Chainlink PoR feeds and custodian APIs
 * @dev Updated by CRE PoR workflow every 10 minutes
 */
contract ProofOfReserveOracle is
    IProofOfReserveOracle,
    AccessControl,
    Pausable
{
    // Roles
    bytes32 public constant CRE_WORKFLOW_ROLE = keccak256("CRE_WORKFLOW_ROLE");

    // Constants
    uint256 public constant DEFAULT_RESERVE_THRESHOLD = 9500; // 95% in basis points

    // Storage
    ReserveData private _currentReserves;
    uint256 private _reserveThreshold;

    constructor(address admin) {
        if (admin == address(0)) revert InvalidReserveData();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _reserveThreshold = DEFAULT_RESERVE_THRESHOLD;

        // Initialize with empty data
        _currentReserves = ReserveData({
            onChainReserves: 0,
            custodianReserves: 0,
            totalShares: 0,
            reserveRatio: 0,
            lastVerified: block.timestamp,
            isHealthy: true
        });
    }

    function getCurrentReserves()
        external
        view
        override
        returns (ReserveData memory reserves)
    {
        return _currentReserves;
    }

    function areReservesSufficient() external view override returns (bool) {
        return _currentReserves.isHealthy;
    }

    function getReserveThreshold()
        external
        view
        override
        returns (uint256 threshold)
    {
        return _reserveThreshold;
    }

    function updateReserves(
        uint256 onChainReserves,
        uint256 custodianReserves,
        uint256 totalShares
    ) external override whenNotPaused onlyRole(CRE_WORKFLOW_ROLE) {
        // Calculate average reserves from both sources
        uint256 averageReserves = (onChainReserves + custodianReserves) / 2;

        // Calculate reserve ratio (reserves / shares * 10000)
        uint256 reserveRatio;
        bool isHealthy;

        if (totalShares == 0) {
            reserveRatio = 10000; // 100% if no shares issued
            isHealthy = true;
        } else {
            reserveRatio = (averageReserves * 10000) / totalShares;
            isHealthy = reserveRatio >= _reserveThreshold;
        }

        // Update storage
        _currentReserves = ReserveData({
            onChainReserves: onChainReserves,
            custodianReserves: custodianReserves,
            totalShares: totalShares,
            reserveRatio: reserveRatio,
            lastVerified: block.timestamp,
            isHealthy: isHealthy
        });

        emit ReservesVerified(
            onChainReserves,
            custodianReserves,
            reserveRatio,
            isHealthy,
            block.timestamp
        );

        // Activate safeguard if reserves insufficient
        if (!isHealthy) {
            emit SafeguardActivated(
                "Insufficient reserves detected",
                block.timestamp
            );
        }
    }

    function setReserveThreshold(
        uint256 newThreshold
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newThreshold > 10000 || newThreshold < 5000) {
            revert InvalidReserveData(); // Must be between 50% and 100%
        }

        uint256 oldThreshold = _reserveThreshold;
        _reserveThreshold = newThreshold;

        emit ReserveThresholdUpdated(oldThreshold, newThreshold);

        // Re-evaluate current reserve health with new threshold
        bool isHealthy = _currentReserves.reserveRatio >= newThreshold;
        if (!isHealthy && _currentReserves.isHealthy) {
            _currentReserves.isHealthy = false;
            emit SafeguardActivated(
                "Threshold change triggered safeguard",
                block.timestamp
            );
        } else if (isHealthy && !_currentReserves.isHealthy) {
            _currentReserves.isHealthy = true;
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    event ReserveVerificationRequested(
        address indexed requester,
        uint256 timestamp
    );

    function requestReserveVerification() external {
        emit ReserveVerificationRequested(msg.sender, block.timestamp);
    }
}
