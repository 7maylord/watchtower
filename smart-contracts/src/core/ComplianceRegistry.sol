// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IComplianceRegistry.sol";

/**
 * @title ComplianceRegistry
 * @notice Tracks KYC/AML compliance and sanctions status for fund investors
 * @dev Used by FundVault to enforce compliance checks on transfers
 */
contract ComplianceRegistry is IComplianceRegistry, AccessControl, Pausable {
    // Roles
    bytes32 public constant COMPLIANCE_OFFICER_ROLE =
        keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant CRE_WORKFLOW_ROLE = keccak256("CRE_WORKFLOW_ROLE");

    // Compliance status struct
    struct ComplianceStatus {
        bool hasKYC;
        bool isSanctioned;
        uint256 lastUpdated;
    }

    // Storage
    mapping(address => ComplianceStatus) private _complianceStatus;

    constructor(address admin, address complianceOfficer) {
        if (admin == address(0) || complianceOfficer == address(0)) {
            revert InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, complianceOfficer);
    }

    function isCompliant(
        address investor
    ) external view override returns (bool) {
        ComplianceStatus memory status = _complianceStatus[investor];
        return status.hasKYC && !status.isSanctioned;
    }

    function isSanctioned(
        address investor
    ) external view override returns (bool) {
        return _complianceStatus[investor].isSanctioned;
    }

    function getComplianceStatus(
        address investor
    )
        external
        view
        override
        returns (bool hasKYC, bool sanctioned, uint256 lastUpdated)
    {
        ComplianceStatus memory status = _complianceStatus[investor];
        return (status.hasKYC, status.isSanctioned, status.lastUpdated);
    }

    function updateCompliance(
        address investor,
        bool hasKYC,
        bool sanctioned
    ) external override whenNotPaused onlyRole(COMPLIANCE_OFFICER_ROLE) {
        if (investor == address(0)) revert InvalidAddress();

        _complianceStatus[investor] = ComplianceStatus({
            hasKYC: hasKYC,
            isSanctioned: sanctioned,
            lastUpdated: block.timestamp
        });

        emit ComplianceUpdated(
            investor,
            hasKYC && !sanctioned,
            block.timestamp
        );

        if (sanctioned) {
            emit SanctionsFlagged(
                investor,
                "Sanctions check failed",
                block.timestamp
            );
        }
    }

    function batchUpdateCompliance(
        address[] calldata investors,
        bool[] calldata kycStatus,
        bool[] calldata sanctionStatus
    ) external override whenNotPaused onlyRole(CRE_WORKFLOW_ROLE) {
        uint256 length = investors.length;
        require(
            length == kycStatus.length && length == sanctionStatus.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < length; i++) {
            address investor = investors[i];
            if (investor == address(0)) revert InvalidAddress();

            _complianceStatus[investor] = ComplianceStatus({
                hasKYC: kycStatus[i],
                isSanctioned: sanctionStatus[i],
                lastUpdated: block.timestamp
            });

            emit ComplianceUpdated(
                investor,
                kycStatus[i] && !sanctionStatus[i],
                block.timestamp
            );

            if (sanctionStatus[i]) {
                emit SanctionsFlagged(
                    investor,
                    "Batch sanctions update",
                    block.timestamp
                );
            }
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
