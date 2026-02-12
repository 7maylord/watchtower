// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/FundVault.sol";
import "../src/core/ComplianceRegistry.sol";
import "../src/core/RiskOracle.sol";
import "../src/core/ProofOfReserveOracle.sol";
import "../src/mock/MockUSDC.sol";

contract FundVaultTest is Test {
    FundVault public vault;
    ComplianceRegistry public compliance;
    RiskOracle public riskOracle;
    ProofOfReserveOracle public porOracle;
    MockUSDC public usdc;

    address public admin = address(0x1);
    address public complianceOfficer = address(0x2);
    address public fundManager = address(0x3);
    address public creWorkflow = address(0x4);
    address public investor1 = address(0x5);
    address public investor2 = address(0x6);

    event Deposited(address indexed investor, uint256 amount, uint256 shares);
    event Withdrawn(address indexed investor, uint256 shares, uint256 amount);
    event Rebalanced(string strategy, uint256 timestamp);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    function setUp() public {
        // Deploy oracle contracts
        compliance = new ComplianceRegistry(admin, complianceOfficer);
        riskOracle = new RiskOracle(admin);
        porOracle = new ProofOfReserveOracle(admin);
        usdc = new MockUSDC();

        // Deploy FundVault
        vault = new FundVault(
            "Watchtower RWA Fund",
            "WRWA",
            address(usdc),
            address(compliance),
            address(riskOracle),
            address(porOracle),
            admin,
            fundManager
        );

        // Grant CRE workflow roles
        vm.startPrank(admin);
        compliance.grantRole(compliance.CRE_WORKFLOW_ROLE(), creWorkflow);
        riskOracle.grantRole(riskOracle.CRE_WORKFLOW_ROLE(), creWorkflow);
        porOracle.grantRole(porOracle.CRE_WORKFLOW_ROLE(), creWorkflow);
        vault.grantRole(vault.CRE_WORKFLOW_ROLE(), creWorkflow);
        vm.stopPrank();

        // Setup initial state
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(0, "QmInitial");

        vm.prank(creWorkflow);
        porOracle.updateReserves(0, 0, 0); // No reserves initially

        // Give investors USDC
        usdc.transfer(investor1, 10000e6);
        usdc.transfer(investor2, 10000e6);
    }

    function test_Constructor() public view {
        assertEq(vault.name(), "Watchtower RWA Fund");
        assertEq(vault.symbol(), "WRWA");
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.totalAssets(), 0);
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(vault.hasRole(vault.FUND_MANAGER_ROLE(), fundManager));
    }

    function test_SharePrice_InitialState() public view {
        assertEq(vault.sharePrice(), 1e18); // 1:1 initially
    }

    function test_Deposit_FirstDeposit() public {
        // Setup: Make investor compliant
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        // Update reserves to allow deposits
        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        // Approve and deposit
        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);

        vm.expectEmit(true, false, false, true);
        emit Deposited(investor1, 1000e6, 1000e6);

        uint256 shares = vault.deposit(1000e6);
        vm.stopPrank();

        assertEq(shares, 1000e6); // 1:1 for first deposit
        assertEq(vault.balanceOf(investor1), 1000e6);
        assertEq(vault.totalAssets(), 1000e6);
        assertEq(usdc.balanceOf(address(vault)), 1000e6);
    }

    function test_Deposit_SubsequentDeposit() public {
        // Setup compliance
        vm.startPrank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);
        compliance.updateCompliance(investor2, true, false);
        vm.stopPrank();

        // Update reserves
        vm.prank(creWorkflow);
        porOracle.updateReserves(2000e6, 2000e6, 0);

        // First deposit
        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Second deposit (after some value increase)
        vm.prank(creWorkflow);
        vault.updateTotalAssets(2000e6); // Fund doubled in value

        vm.startPrank(investor2);
        usdc.approve(address(vault), 1000e6);
        uint256 shares = vault.deposit(1000e6);
        vm.stopPrank();

        assertEq(shares, 500e6); // Gets half the shares since fund doubled
        assertEq(vault.balanceOf(investor2), 500e6);
    }

    function test_RevertDeposit_NotCompliant() public {
        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);

        vm.expectRevert(IFundVault.NotCompliant.selector);
        vault.deposit(1000e6);
        vm.stopPrank();
    }

    function test_RevertDeposit_RiskTooHigh() public {
        // Make compliant
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        // Set high risk
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(85, "QmHighRisk");

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);

        vm.expectRevert(IFundVault.RiskTooHigh.selector);
        vault.deposit(1000e6);
        vm.stopPrank();
    }

    function test_RevertDeposit_InsufficientReserves() public {
        // Make compliant
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        // Set insufficient reserves
        vm.prank(creWorkflow);
        porOracle.updateReserves(800e6, 800e6, 1000e6); // 80% ratio

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);

        vm.expectRevert(IFundVault.InsufficientReserves.selector);
        vault.deposit(1000e6);
        vm.stopPrank();
    }

    function test_RevertDeposit_WhenPaused() public {
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(admin);
        vault.pause();

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);

        vm.expectRevert();
        vault.deposit(1000e6);
        vm.stopPrank();
    }

    function test_Withdraw() public {
        // Setup and deposit
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);

        uint256 initialBalance = usdc.balanceOf(investor1);

        vm.expectEmit(true, false, false, true);
        emit Withdrawn(investor1, 500e6, 500e6);

        uint256 amount = vault.withdraw(500e6);
        vm.stopPrank();

        assertEq(amount, 500e6);
        assertEq(vault.balanceOf(investor1), 500e6);
        assertEq(usdc.balanceOf(investor1), initialBalance + 500e6);
        assertEq(vault.totalAssets(), 500e6);
    }

    function test_Withdraw_AfterValueIncrease() public {
        // Setup and deposit
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Fund doubles in value
        vm.prank(creWorkflow);
        vault.updateTotalAssets(2000e6);

        uint256 initialBalance = usdc.balanceOf(investor1);

        vm.prank(investor1);
        uint256 amount = vault.withdraw(500e6); // Withdraw half shares

        assertEq(amount, 1000e6); // Gets $1000 for 500 shares
        assertEq(usdc.balanceOf(investor1), initialBalance + 1000e6);
    }

    function test_RevertWithdraw_NotCompliant() public {
        // Deposit first
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Revoke compliance
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, false, true);

        vm.prank(investor1);
        vm.expectRevert(IFundVault.NotCompliant.selector);
        vault.withdraw(500e6);
    }

    function test_RevertWithdraw_WhenPaused() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(investor1);
        vm.expectRevert();
        vault.withdraw(100e6);
    }

    function test_Transfer_BothCompliant() public {
        // Setup compliance for both
        vm.startPrank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);
        compliance.updateCompliance(investor2, true, false);
        vm.stopPrank();

        // Deposit
        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);

        // Transfer
        vault.transfer(investor2, 500e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(investor1), 500e6);
        assertEq(vault.balanceOf(investor2), 500e6);
    }

    function test_RevertTransfer_SenderNotCompliant() public {
        // Setup and deposit
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Revoke compliance
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, false, true);

        // Make receiver compliant
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor2, true, false);

        vm.prank(investor1);
        vm.expectRevert(IFundVault.NotCompliant.selector);
        vault.transfer(investor2, 500e6);
    }

    function test_RevertTransfer_RecipientNotCompliant() public {
        // Setup and deposit
        vm.startPrank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);
        compliance.updateCompliance(investor2, false, false); // No KYC
        vm.stopPrank();

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);

        vm.expectRevert(IFundVault.NotCompliant.selector);
        vault.transfer(investor2, 500e6);
        vm.stopPrank();
    }

    function test_Rebalance() public {
        vm.expectEmit(false, false, false, true);
        emit Rebalanced("QmStrategy123", block.timestamp);

        vm.prank(fundManager);
        vault.rebalance("QmStrategy123");
    }

    function test_RevertRebalance_RiskTooHigh() public {
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(90, "QmHighRisk");

        vm.prank(fundManager);
        vm.expectRevert(IFundVault.RiskTooHigh.selector);
        vault.rebalance("QmStrategy");
    }

    function test_RevertRebalance_Unauthorized() public {
        vm.prank(investor1);
        vm.expectRevert();
        vault.rebalance("QmStrategy");
    }

    function test_RevertRebalance_WhenPaused() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(fundManager);
        vm.expectRevert();
        vault.rebalance("QmStrategy");
    }

    function test_EmergencyWithdraw() public {
        // Deposit some funds
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Pause and emergency withdraw
        vm.prank(admin);
        vault.pause();

        uint256 initialBalance = usdc.balanceOf(admin);

        vm.expectEmit(true, false, false, true);
        emit EmergencyWithdrawal(admin, 500e6);

        vm.prank(admin);
        vault.emergencyWithdraw(admin, 500e6);

        assertEq(usdc.balanceOf(admin), initialBalance + 500e6);
    }

    function test_RevertEmergencyWithdraw_NotPaused() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.emergencyWithdraw(admin, 100e6);
    }

    function test_RevertEmergencyWithdraw_Unauthorized() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(investor1);
        vm.expectRevert();
        vault.emergencyWithdraw(investor1, 100e6);
    }

    function test_UpdateTotalAssets() public {
        vm.prank(creWorkflow);
        vault.updateTotalAssets(5000e6);

        assertEq(vault.totalAssets(), 5000e6);
    }

    function test_RevertUpdateTotalAssets_Unauthorized() public {
        vm.prank(investor1);
        vm.expectRevert();
        vault.updateTotalAssets(5000e6);
    }

    function test_SharePrice_AfterDeposit() public {
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        assertEq(vault.sharePrice(), 1e18); // Still 1:1
    }

    function test_SharePrice_AfterValueIncrease() public {
        vm.prank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(1000e6, 1000e6, 0);

        vm.startPrank(investor1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        // Double the value
        vm.prank(creWorkflow);
        vault.updateTotalAssets(2000e6);

        assertEq(vault.sharePrice(), 2e18); // $2 per share
    }

    function test_FullLifecycle() public {
        // 1. Setup compliance
        vm.startPrank(complianceOfficer);
        compliance.updateCompliance(investor1, true, false);
        compliance.updateCompliance(investor2, true, false);
        vm.stopPrank();

        // 2. Update reserves and risk
        vm.startPrank(creWorkflow);
        porOracle.updateReserves(5000e6, 5000e6, 0);
        riskOracle.updateRiskScore(30, "QmLowRisk");
        vm.stopPrank();

        // 3. First investor deposits
        vm.startPrank(investor1);
        usdc.approve(address(vault), 2000e6);
        vault.deposit(2000e6);
        vm.stopPrank();

        // 4. Fund performs well
        vm.prank(creWorkflow);
        vault.updateTotalAssets(2400e6); // 20% gain

        // 5. Second investor deposits
        vm.startPrank(investor2);
        usdc.approve(address(vault), 1200e6);
        vault.deposit(1200e6);
        vm.stopPrank();

        // 6. Rebalance
        vm.prank(fundManager);
        vault.rebalance("QmRebalanceStrategy");

        // 7. Update total assets
        vm.prank(creWorkflow);
        vault.updateTotalAssets(3800e6);

        // 8. Withdraw
        vm.prank(investor1);
        vault.withdraw(1000e6);

        // Verify final state
        assertTrue(vault.balanceOf(investor1) > 0);
        assertTrue(vault.balanceOf(investor2) > 0);
        assertTrue(vault.totalAssets() > 0);
    }
}
