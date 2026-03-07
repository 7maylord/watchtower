// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/FundVault.sol";
import "../src/core/ComplianceRegistry.sol";
import "../src/core/RiskOracle.sol";
import "../src/core/ProofOfReserveOracle.sol";
import "../src/mock/MockUSDC.sol";
import "../src/mock/MockAavePool.sol";
import "../src/mock/MockCompoundReserve.sol";

/// @notice Mock CCIP Router for testing bridgeShares / getBridgeFee
contract MockCCIPRouter {
    uint256 public constant MOCK_FEE = 0.01 ether;
    bytes32 public constant MOCK_MESSAGE_ID = keccak256("mock_ccip_message");

    uint64 public lastDestChainSelector;
    address public lastTokenAddress;
    uint256 public lastTokenAmount;
    address public lastReceiver;

    function getFee(
        uint64,
        CCIPClient.EVM2AnyMessage calldata
    ) external pure returns (uint256) {
        return MOCK_FEE;
    }

    function ccipSend(
        uint64 destinationChainSelector,
        CCIPClient.EVM2AnyMessage calldata message
    ) external payable returns (bytes32) {
        require(msg.value >= MOCK_FEE, "Insufficient fee");
        lastDestChainSelector = destinationChainSelector;
        lastTokenAddress = message.tokenAmounts[0].token;
        lastTokenAmount = message.tokenAmounts[0].amount;
        lastReceiver = abi.decode(message.receiver, (address));
        return MOCK_MESSAGE_ID;
    }
}

contract FundVaultTest is Test {
    FundVault public vault;
    ComplianceRegistry public compliance;
    RiskOracle public riskOracle;
    ProofOfReserveOracle public porOracle;
    MockUSDC public usdc;
    MockAavePool public aavePool;
    MockCompoundReserve public compReserve;

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
        vm.startPrank(admin);
        compliance = new ComplianceRegistry(admin, complianceOfficer);
        riskOracle = new RiskOracle(admin);
        porOracle = new ProofOfReserveOracle(admin);
        usdc = new MockUSDC();
        aavePool = new MockAavePool(address(usdc), admin);
        compReserve = new MockCompoundReserve(address(usdc), admin);
        vm.stopPrank();

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

        // Setup mock protocols
        vm.prank(admin);
        vault.setMockProtocols(
            address(aavePool),
            address(aavePool),
            address(compReserve),
            address(compReserve)
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
        vm.startPrank(admin);
        usdc.transfer(investor1, 10000e6);
        usdc.transfer(investor2, 10000e6);
        vm.stopPrank();

        // Deal ETH for bridge fee tests
        vm.deal(fundManager, 10 ether);
        vm.deal(creWorkflow, 10 ether);
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
        emit Deposited(investor1, 1000e6, 1000e18);

        uint256 shares = vault.deposit(1000e6);
        vm.stopPrank();

        assertEq(shares, 1000e18); // 1000 USDC (6 dec) → 1000 shares (18 dec)
        assertEq(vault.balanceOf(investor1), 1000e18);
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

        // Second deposit (after some value increase in Aave)
        vm.startPrank(admin);
        usdc.mint(address(aavePool), 1000e6);
        aavePool.mint(address(vault), 1000e6); // artificially inflate aave to mock yield
        vm.stopPrank();

        vm.startPrank(investor2);
        usdc.approve(address(vault), 1000e6);
        uint256 shares = vault.deposit(1000e6);
        vm.stopPrank();

        assertEq(shares, 500e18); // Gets half the shares since fund doubled
        assertEq(vault.balanceOf(investor2), 500e18);
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
        emit Withdrawn(investor1, 500e18, 500e6);

        uint256 amount = vault.withdraw(500e18);
        vm.stopPrank();

        assertEq(amount, 500e6);
        assertEq(vault.balanceOf(investor1), 500e18);
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

        // Fund doubles in value via mock yield injection
        vm.prank(admin);
        aavePool.mint(address(vault), 1000e6);

        uint256 initialBalance = usdc.balanceOf(investor1);

        vm.prank(investor1);
        uint256 amount = vault.withdraw(500e18); // Withdraw half shares

        assertEq(amount, 1000e6); // Gets $1000 for 500 shares (fund doubled)
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
        vault.withdraw(500e18);
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
        vault.transfer(investor2, 500e18);
        vm.stopPrank();

        assertEq(vault.balanceOf(investor1), 500e18);
        assertEq(vault.balanceOf(investor2), 500e18);
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
        vault.transfer(investor2, 500e18);
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
        vault.transfer(investor2, 500e18);
        vm.stopPrank();
    }

    function test_Rebalance_FundManager() public {
        vm.expectEmit(false, false, false, true);
        emit Rebalanced("QmStrategy123", block.timestamp);

        vm.prank(fundManager);
        vault.rebalance("QmStrategy123", 0, 0, 0, 0);
    }

    function test_Rebalance_CRE_WhenRiskAboveThreshold() public {
        // Set risk above the default threshold (50)
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(60, "QmElevatedRisk");

        vm.prank(creWorkflow);
        vault.rebalance("QmCREStrategy", 0, 0, 0, 0);
    }

    function test_RevertRebalance_CRE_WhenRiskBelowThreshold() public {
        // Risk is at default (25), below threshold (50)
        vm.prank(creWorkflow);
        vm.expectRevert();
        vault.rebalance("QmCREStrategy", 0, 0, 0, 0);
    }

    function test_SetRebalanceRiskThreshold() public {
        vm.prank(fundManager);
        vault.setRebalanceRiskThreshold(30);
        assertEq(vault.rebalanceRiskThreshold(), 30);

        // Now CRE can rebalance at risk 35 (above new threshold of 30)
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(35, "QmModerateRisk");

        vm.prank(creWorkflow);
        vault.rebalance("QmCREStrategy", 0, 0, 0, 0);
    }

    function test_RevertRebalance_RiskTooHigh() public {
        vm.prank(creWorkflow);
        riskOracle.updateRiskScore(90, "QmHighRisk");

        vm.prank(fundManager);
        vm.expectRevert(IFundVault.RiskTooHigh.selector);
        vault.rebalance("QmStrategy", 0, 0, 0, 0);
    }

    function test_RevertRebalance_Unauthorized() public {
        vm.prank(investor1);
        vm.expectRevert();
        vault.rebalance("QmStrategy", 0, 0, 0, 0);
    }

    function test_RevertRebalance_WhenPaused() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(fundManager);
        vm.expectRevert();
        vault.rebalance("QmStrategy", 0, 0, 0, 0);
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

        // Double the value via mock yield
        vm.prank(admin);
        aavePool.mint(address(vault), 1000e6);

        assertEq(vault.sharePrice(), 2e18); // $2 per share
    }

    // ===== CCIP Bridge Tests =====

    function _setupBridge() internal returns (MockCCIPRouter router) {
        router = new MockCCIPRouter();
        vm.prank(admin);
        vault.setCCIPRouter(address(router));
    }

    function _depositForFundManager(uint256 amount) internal {
        // Make fund manager compliant so they can hold shares
        vm.prank(complianceOfficer);
        compliance.updateCompliance(fundManager, true, false);

        vm.prank(creWorkflow);
        porOracle.updateReserves(amount * 2, amount * 2, 0);

        // Give fund manager USDC and deposit
        vm.prank(admin);
        usdc.transfer(fundManager, amount);

        vm.startPrank(fundManager);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function test_SetCCIPRouter() public {
        MockCCIPRouter router = new MockCCIPRouter();
        vm.prank(admin);
        vault.setCCIPRouter(address(router));
        assertEq(address(vault.ccipRouter()), address(router));
    }

    function test_RevertSetCCIPRouter_Unauthorized() public {
        vm.prank(investor1);
        vm.expectRevert();
        vault.setCCIPRouter(address(1));
    }

    function test_RevertSetCCIPRouter_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid router");
        vault.setCCIPRouter(address(0));
    }

    function test_GetBridgeFee() public {
        MockCCIPRouter router = _setupBridge();
        uint256 fee = vault.getBridgeFee(
            16015286601757825753, // Sepolia selector
            investor1,
            1000e18
        );
        assertEq(fee, router.MOCK_FEE());
    }

    function test_RevertGetBridgeFee_RouterNotSet() public {
        vm.expectRevert(FundVault.RouterNotSet.selector);
        vault.getBridgeFee(16015286601757825753, investor1, 1000e18);
    }

    function test_BridgeShares_FundManager() public {
        MockCCIPRouter router = _setupBridge();
        _depositForFundManager(1000e6);

        uint256 sharesBefore = vault.balanceOf(fundManager);
        uint256 bridgeAmount = 500e18;
        uint64 destSelector = 10344971235874465080; // Base Sepolia

        // Make vault compliant for the transfer
        vm.prank(complianceOfficer);
        compliance.updateCompliance(address(vault), true, false);

        vm.prank(fundManager);
        bytes32 messageId = vault.bridgeShares{value: 0.01 ether}(
            destSelector,
            investor1,
            bridgeAmount
        );

        assertEq(messageId, router.MOCK_MESSAGE_ID());
        assertEq(vault.balanceOf(fundManager), sharesBefore - bridgeAmount);
        assertEq(router.lastDestChainSelector(), destSelector);
        assertEq(router.lastTokenAmount(), bridgeAmount);
        assertEq(router.lastReceiver(), investor1);
    }

    function test_BridgeShares_CREWorkflow() public {
        _setupBridge();

        // Give CRE workflow some shares via minting
        vm.prank(complianceOfficer);
        compliance.updateCompliance(creWorkflow, true, false);
        vm.prank(complianceOfficer);
        compliance.updateCompliance(address(vault), true, false);

        // Mint shares to CRE workflow for testing (admin grants minter role to itself, then mints)
        vm.startPrank(admin);
        vault.grantRole(vault.MINTER_ROLE(), admin);
        vault.mint(creWorkflow, 1000e18);
        vm.stopPrank();

        vm.prank(creWorkflow);
        vault.bridgeShares{value: 0.01 ether}(
            10344971235874465080,
            investor1,
            500e18
        );

        assertEq(vault.balanceOf(creWorkflow), 500e18);
    }

    function test_RevertBridgeShares_Unauthorized() public {
        _setupBridge();

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        vm.expectRevert("Unauthorized");
        vault.bridgeShares{value: 0.01 ether}(
            10344971235874465080,
            investor2,
            100e18
        );
    }

    function test_RevertBridgeShares_RouterNotSet() public {
        vm.deal(fundManager, 1 ether);
        vm.prank(fundManager);
        vm.expectRevert(FundVault.RouterNotSet.selector);
        vault.bridgeShares{value: 0.01 ether}(
            10344971235874465080,
            investor1,
            100e18
        );
    }

    function test_RevertBridgeShares_WhenPaused() public {
        _setupBridge();

        vm.prank(admin);
        vault.pause();

        vm.deal(fundManager, 1 ether);
        vm.prank(fundManager);
        vm.expectRevert();
        vault.bridgeShares{value: 0.01 ether}(
            10344971235874465080,
            investor1,
            100e18
        );
    }

    // ===== Full Lifecycle Test =====

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

        // 4. Fund performs well (mock yield)
        vm.startPrank(admin);
        usdc.mint(address(aavePool), 400e6);
        aavePool.mint(address(vault), 400e6); // 20% gain
        vm.stopPrank();

        // 5. Second investor deposits
        vm.startPrank(investor2);
        usdc.approve(address(vault), 1200e6);
        vault.deposit(1200e6);
        vm.stopPrank();

        // 6. Rebalance (fund manager can always rebalance)
        vm.prank(fundManager);
        vault.rebalance("QmRebalanceStrategy", 1000e6, 0, 500e6, 0);

        // 7. Withdraw
        vm.prank(investor1);
        vault.withdraw(1000e18);

        // Verify final state
        assertTrue(vault.balanceOf(investor1) > 0);
        assertTrue(vault.balanceOf(investor2) > 0);
        assertTrue(vault.totalAssets() > 0);
    }
}
