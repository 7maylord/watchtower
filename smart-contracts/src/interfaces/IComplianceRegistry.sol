// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IComplianceRegistry
 * @notice Interface for tracking KYC/AML compliance and sanctions status
 * @dev Used by FundVault to enforce compliance checks on investors
 */
interface IComplianceRegistry {
    // Events
    event ComplianceUpdated(
        address indexed investor,
        bool isCompliant,
        uint256 timestamp
    );
    event SanctionsFlagged(
        address indexed investor,
        string reason,
        uint256 timestamp
    );
    event ComplianceOfficerUpdated(
        address indexed oldOfficer,
        address indexed newOfficer
    );

    // Errors
    error UnauthorizedCaller();
    error InvalidAddress();

    /**
     * @notice Check if an address is compliant (KYC passed + not sanctioned)
     * @param investor Address to check
     * @return isCompliant True if compliant, false otherwise
     */
    function isCompliant(address investor) external view returns (bool);

    /**
     * @notice Check if an address is sanctioned
     * @param investor Address to check
     * @return isSanctioned True if sanctioned, false otherwise
     */
    function isSanctioned(address investor) external view returns (bool);

    /**
     * @notice Get compliance details for an address
     * @param investor Address to query
     * @return hasKYC Whether KYC is completed
     * @return sanctioned Whether address is sanctioned
     * @return lastUpdated Timestamp of last status update
     */
    function getComplianceStatus(
        address investor
    ) external view returns (bool hasKYC, bool sanctioned, uint256 lastUpdated);

    /**
     * @notice Update compliance status for an investor
     * @dev Only callable by authorized compliance officer or CRE workflow
     * @param investor Address to update
     * @param hasKYC Whether KYC is completed
     * @param sanctioned Whether address is sanctioned
     */
    function updateCompliance(
        address investor,
        bool hasKYC,
        bool sanctioned
    ) external;

    /**
     * @notice Batch update compliance status for multiple investors
     * @dev Gas-efficient for bulk operations from CRE workflow
     * @param investors Array of addresses to update
     * @param kycStatus Array of KYC statuses
     * @param sanctionStatus Array of sanction statuses
     */
    function batchUpdateCompliance(
        address[] calldata investors,
        bool[] calldata kycStatus,
        bool[] calldata sanctionStatus
    ) external;
}
