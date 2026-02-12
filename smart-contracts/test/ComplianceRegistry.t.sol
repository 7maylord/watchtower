// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/ComplianceRegistry.sol";

contract ComplianceRegistryTest is Test {
    ComplianceRegistry public registry;

    address public admin = address(0x1);
    address public complianceOfficer = address(0x2);
    address public creWorkflow = address(0x3);
    address public investor1 = address(0x4);
    address public investor2 = address(0x5);

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

    function setUp() public {
        registry = new ComplianceRegistry(admin, complianceOfficer);

        // Grant CRE workflow role
        vm.startPrank(admin);
        registry.grantRole(registry.CRE_WORKFLOW_ROLE(), creWorkflow);
        vm.stopPrank();
    }

    function test_Constructor() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(
            registry.hasRole(
                registry.COMPLIANCE_OFFICER_ROLE(),
                complianceOfficer
            )
        );
    }

    function test_RevertConstructor_InvalidAdmin() public {
        vm.expectRevert(IComplianceRegistry.InvalidAddress.selector);
        new ComplianceRegistry(address(0), complianceOfficer);
    }

    function test_RevertConstructor_InvalidOfficer() public {
        vm.expectRevert(IComplianceRegistry.InvalidAddress.selector);
        new ComplianceRegistry(admin, address(0));
    }

    function test_IsCompliant_InitialState() public view {
        assertFalse(registry.isCompliant(investor1));
    }

    function test_IsCompliant_AfterKYC() public {
        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, false);

        assertTrue(registry.isCompliant(investor1));
    }

    function test_IsCompliant_Sanctioned() public {
        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, true); // KYC done but sanctioned

        assertFalse(registry.isCompliant(investor1));
    }

    function test_IsSanctioned() public {
        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, true);

        assertTrue(registry.isSanctioned(investor1));
    }

    function test_GetComplianceStatus() public {
        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, false);

        (bool hasKYC, bool sanctioned, uint256 lastUpdated) = registry
            .getComplianceStatus(investor1);

        assertTrue(hasKYC);
        assertFalse(sanctioned);
        assertEq(lastUpdated, block.timestamp);
    }

    function test_UpdateCompliance() public {
        vm.expectEmit(true, false, false, true);
        emit ComplianceUpdated(investor1, true, block.timestamp);

        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, false);

        assertTrue(registry.isCompliant(investor1));
    }

    function test_UpdateCompliance_Sanctioned() public {
        vm.expectEmit(true, false, false, true);
        emit SanctionsFlagged(
            investor1,
            "Sanctions check failed",
            block.timestamp
        );

        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, true);

        assertTrue(registry.isSanctioned(investor1));
    }

    function test_RevertUpdateCompliance_Unauthorized() public {
        vm.expectRevert();
        vm.prank(investor1);
        registry.updateCompliance(investor2, true, false);
    }

    function test_RevertUpdateCompliance_InvalidAddress() public {
        vm.expectRevert(IComplianceRegistry.InvalidAddress.selector);
        vm.prank(complianceOfficer);
        registry.updateCompliance(address(0), true, false);
    }

    function test_RevertUpdateCompliance_WhenPaused() public {
        vm.prank(admin);
        registry.pause();

        vm.expectRevert();
        vm.prank(complianceOfficer);
        registry.updateCompliance(investor1, true, false);
    }

    function test_BatchUpdateCompliance() public {
        address[] memory investors = new address[](3);
        investors[0] = investor1;
        investors[1] = investor2;
        investors[2] = address(0x6);

        bool[] memory kycStatus = new bool[](3);
        kycStatus[0] = true;
        kycStatus[1] = true;
        kycStatus[2] = false;

        bool[] memory sanctionStatus = new bool[](3);
        sanctionStatus[0] = false;
        sanctionStatus[1] = true;
        sanctionStatus[2] = false;

        vm.prank(creWorkflow);
        registry.batchUpdateCompliance(investors, kycStatus, sanctionStatus);

        assertTrue(registry.isCompliant(investor1));
        assertFalse(registry.isCompliant(investor2)); // Sanctioned
        assertFalse(registry.isCompliant(address(0x6))); // No KYC
    }

    function test_RevertBatchUpdate_ArrayMismatch() public {
        address[] memory investors = new address[](2);
        bool[] memory kycStatus = new bool[](3);
        bool[] memory sanctionStatus = new bool[](2);

        vm.expectRevert("Array length mismatch");
        vm.prank(creWorkflow);
        registry.batchUpdateCompliance(investors, kycStatus, sanctionStatus);
    }

    function test_RevertBatchUpdate_Unauthorized() public {
        address[] memory investors = new address[](1);
        bool[] memory kycStatus = new bool[](1);
        bool[] memory sanctionStatus = new bool[](1);

        vm.expectRevert();
        vm.prank(investor1);
        registry.batchUpdateCompliance(investors, kycStatus, sanctionStatus);
    }

    function test_Pause() public {
        vm.prank(admin);
        registry.pause();

        assertTrue(registry.paused());
    }

    function test_Unpause() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        assertFalse(registry.paused());
    }

    function test_RevertPause_Unauthorized() public {
        vm.expectRevert();
        vm.prank(investor1);
        registry.pause();
    }
}
