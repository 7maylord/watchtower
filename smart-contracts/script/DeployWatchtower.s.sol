// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/ComplianceRegistry.sol";
import "../src/core/RiskOracle.sol";
import "../src/core/ProofOfReserveOracle.sol";
import "../src/core/FundVault.sol";
import "../src/mock/MockUSDC.sol";
import "../src/mock/MockAavePool.sol";
import "../src/mock/MockCompoundReserve.sol";

/**
 * @title DeployWatchtower
 * @notice Comprehensive deployment script for all Watchtower contracts
 * @dev Deploys contracts in correct dependency order:
 *      1. Oracle contracts (ComplianceRegistry, RiskOracle, ProofOfReserveOracle)
 *      2. Mock USDC (for testing)
 *      3. FundVault (depends on oracles and USDC)
 */
contract DeployWatchtower is Script {
    // Deployed contract addresses
    ComplianceRegistry public complianceRegistry;
    RiskOracle public riskOracle;
    ProofOfReserveOracle public porOracle;
    MockUSDC public usdc;
    MockAavePool public aavePool;
    MockCompoundReserve public compReserve;
    FundVault public fundVault;

    // Configuration addresses (set via environment variables)
    address public admin;
    address public complianceOfficer;
    address public fundManager;
    address public creWorkflow; // CRE workflow address (initially deployer, can be updated later)

    function setUp() public {
        // Load addresses from environment or use deployer as default
        admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        complianceOfficer = vm.envOr("COMPLIANCE_OFFICER_ADDRESS", msg.sender);
        fundManager = vm.envOr("FUND_MANAGER_ADDRESS", msg.sender);
        creWorkflow = vm.envOr("CRE_WORKFLOW_ADDRESS", msg.sender);

        console.log("=== Deployment Configuration ===");
        console.log("Admin:", admin);
        console.log("Compliance Officer:", complianceOfficer);
        console.log("Fund Manager:", fundManager);
        console.log("CRE Workflow:", creWorkflow);
        console.log("Deployer:", msg.sender);
        console.log("");
    }

    function run() public {
        vm.startBroadcast();

        console.log("=== Starting Watchtower Deployment ===");
        console.log("");

        // ============ Step 1: Deploy Oracle Contracts ============
        console.log("Step 1: Deploying Oracle Contracts...");

        // Deploy ComplianceRegistry
        console.log("  -> Deploying ComplianceRegistry...");
        complianceRegistry = new ComplianceRegistry(admin, complianceOfficer);
        console.log(
            "  -> ComplianceRegistry deployed at:",
            address(complianceRegistry)
        );

        // Deploy RiskOracle
        console.log("  -> Deploying RiskOracle...");
        riskOracle = new RiskOracle(admin);
        console.log("  -> RiskOracle deployed at:", address(riskOracle));

        // Deploy ProofOfReserveOracle
        console.log("  -> Deploying ProofOfReserveOracle...");
        porOracle = new ProofOfReserveOracle(admin);
        console.log(
            "  -> ProofOfReserveOracle deployed at:",
            address(porOracle)
        );

        console.log("");

        // ============ Step 2: Deploy Mock ERC20s and Protocols ============
        console.log("Step 2: Deploying Mock Assets and Protocols...");

        usdc = new MockUSDC();
        console.log("  -> MockUSDC deployed at:", address(usdc));

        aavePool = new MockAavePool(address(usdc), admin);
        console.log("  -> MockAavePool deployed at:", address(aavePool));

        compReserve = new MockCompoundReserve(address(usdc), admin);
        console.log(
            "  -> MockCompoundReserve deployed at:",
            address(compReserve)
        );

        console.log("");

        // ============ Step 3: Deploy FundVault ============
        console.log("Step 3: Deploying FundVault...");
        fundVault = new FundVault(
            "Watchtower RWA Fund",
            "WRWA",
            address(usdc),
            address(complianceRegistry),
            address(riskOracle),
            address(porOracle),
            admin,
            fundManager
        );
        console.log("  -> FundVault deployed at:", address(fundVault));

        fundVault.setMockProtocols(
            address(aavePool),
            address(aavePool), // using pool address as aToken mock
            address(compReserve),
            address(compReserve) // using reserve address as cToken mock
        );
        console.log("  -> Mock Protocols wired to FundVault");
        console.log("");

        // ============ Step 4: Grant CRE Workflow Roles ============
        console.log("Step 4: Granting CRE Workflow Roles...");

        // Grant CRE_WORKFLOW_ROLE to CRE workflow address on all contracts
        if (msg.sender == admin) {
            console.log("  -> Granting CRE_WORKFLOW_ROLE to:", creWorkflow);

            complianceRegistry.grantRole(
                complianceRegistry.CRE_WORKFLOW_ROLE(),
                creWorkflow
            );
            console.log("  -> ComplianceRegistry: Role granted");

            riskOracle.grantRole(riskOracle.CRE_WORKFLOW_ROLE(), creWorkflow);
            console.log("  -> RiskOracle: Role granted");

            porOracle.grantRole(porOracle.CRE_WORKFLOW_ROLE(), creWorkflow);
            console.log("  -> ProofOfReserveOracle: Role granted");

            fundVault.grantRole(fundVault.CRE_WORKFLOW_ROLE(), creWorkflow);
            console.log("  -> FundVault: Role granted");
        } else {
            console.log("  -> Skipping role grants (deployer is not admin)");
            console.log("  -> Admin must manually grant CRE_WORKFLOW_ROLE");
        }
        console.log("");

        // ============ Step 5: Initialize Risk Oracle ============
        console.log("Step 5: Initializing Risk Oracle...");
        if (msg.sender == creWorkflow || msg.sender == admin) {
            // Set initial low risk score
            riskOracle.updateRiskScore(20, "QmInitialDeployment");
            console.log("  -> Initial risk score set to 20");
        } else {
            console.log(
                "  -> Skipping initialization (deployer is not CRE workflow or admin)"
            );
        }
        console.log("");

        // ============ Step 6: Initialize Proof of Reserve Oracle ============
        console.log("Step 6: Initializing Proof of Reserve Oracle...");
        if (msg.sender == creWorkflow || msg.sender == admin) {
            // Set initial reserves (0 since no deposits yet)
            porOracle.updateReserves(0, 0, 0);
            console.log("  -> Initial reserves set to 0");
        } else {
            console.log(
                "  -> Skipping initialization (deployer is not CRE workflow or admin)"
            );
        }
        console.log("");

        vm.stopBroadcast();

        // ============ Deployment Summary ============
        console.log("=== Deployment Summary ===");
        console.log("");
        console.log("Oracle Contracts:");
        console.log("  ComplianceRegistry:", address(complianceRegistry));
        console.log("  RiskOracle:", address(riskOracle));
        console.log("  ProofOfReserveOracle:", address(porOracle));
        console.log("");
        console.log("Asset Contracts:");
        console.log("  MockUSDC:", address(usdc));
        console.log("");
        console.log("Mock Protocols:");
        console.log("  MockAavePool:", address(aavePool));
        console.log("  MockCompoundReserve:", address(compReserve));
        console.log("");
        console.log("Core Contracts:");
        console.log("  FundVault:", address(fundVault));
        console.log("");
        console.log("Configuration:");
        console.log("  Admin:", admin);
        console.log("  Compliance Officer:", complianceOfficer);
        console.log("  Fund Manager:", fundManager);
        console.log("  CRE Workflow:", creWorkflow);
        console.log("");
        console.log("=== Deployment Complete ===");
    }
}
