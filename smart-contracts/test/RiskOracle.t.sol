// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/RiskOracle.sol";

contract RiskOracleTest is Test {
    RiskOracle public oracle;

    address public admin = address(0x1);
    address public creWorkflow = address(0x2);

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

    function setUp() public {
        oracle = new RiskOracle(admin);

        // Grant CRE workflow role
        vm.startPrank(admin);
        oracle.grantRole(oracle.CRE_WORKFLOW_ROLE(), creWorkflow);
        vm.stopPrank();
    }

    function test_Constructor() public view {
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        (uint8 score, uint256 timestamp, string memory ipfsHash) = oracle
            .getCurrentRiskScore();
        assertEq(score, 0);
        assertEq(ipfsHash, "");
        assertEq(timestamp, block.timestamp);
    }

    function test_RevertConstructor_InvalidAdmin() public {
        vm.expectRevert(IRiskOracle.InvalidRiskScore.selector);
        new RiskOracle(address(0));
    }

    function test_GetCurrentRiskScore() public {
        vm.prank(creWorkflow);
        oracle.updateRiskScore(50, "QmTest123");

        (uint8 score, uint256 timestamp, string memory ipfsHash) = oracle
            .getCurrentRiskScore();

        assertEq(score, 50);
        assertEq(ipfsHash, "QmTest123");
        assertEq(timestamp, block.timestamp);
    }

    function test_ShouldTriggerLiquidation_BelowThreshold() public {
        vm.prank(creWorkflow);
        oracle.updateRiskScore(84, "QmTest");

        assertFalse(oracle.shouldTriggerLiquidation());
    }

    function test_ShouldTriggerLiquidation_AtThreshold() public {
        vm.prank(creWorkflow);
        oracle.updateRiskScore(85, "QmTest");

        assertTrue(oracle.shouldTriggerLiquidation());
    }

    function test_ShouldTriggerLiquidation_AboveThreshold() public {
        vm.prank(creWorkflow);
        oracle.updateRiskScore(95, "QmTest");

        assertTrue(oracle.shouldTriggerLiquidation());
    }

    function test_ShouldTriggerLiquidation_StaleData() public {
        vm.prank(creWorkflow);
        oracle.updateRiskScore(90, "QmTest");

        // Fast forward 16 minutes (past MAX_DATA_AGE of 15 minutes)
        vm.warp(block.timestamp + 16 minutes);

        assertFalse(oracle.shouldTriggerLiquidation());
    }

    function test_GetProtocolHealth() public {
        vm.prank(creWorkflow);
        oracle.updateProtocolHealth("Aave", 85, 1000000e6, 7500);

        IRiskOracle.ProtocolHealth memory health = oracle.getProtocolHealth(
            "Aave"
        );

        assertEq(health.protocolName, "Aave");
        assertEq(health.healthScore, 85);
        assertEq(health.tvl, 1000000e6);
        assertEq(health.utilizationRate, 7500);
        assertEq(health.lastUpdate, block.timestamp);
    }

    function test_UpdateRiskScore() public {
        vm.expectEmit(false, false, false, true);
        emit RiskScoreUpdated(50, "QmTest123", block.timestamp);

        vm.prank(creWorkflow);
        oracle.updateRiskScore(50, "QmTest123");

        (uint8 score, , ) = oracle.getCurrentRiskScore();
        assertEq(score, 50);
    }

    function test_UpdateRiskScore_TriggerLiquidation() public {
        // Set initial score below threshold
        vm.prank(creWorkflow);
        oracle.updateRiskScore(80, "QmTest1");

        // Expect liquidation event when crossing threshold
        vm.expectEmit(false, false, false, true);
        emit AutoLiquidationTriggered(85, block.timestamp);

        vm.prank(creWorkflow);
        oracle.updateRiskScore(85, "QmTest2");
    }

    function test_RevertUpdateRiskScore_InvalidScore() public {
        vm.expectRevert(IRiskOracle.InvalidRiskScore.selector);
        vm.prank(creWorkflow);
        oracle.updateRiskScore(101, "QmTest");
    }

    function test_RevertUpdateRiskScore_Unauthorized() public {
        vm.expectRevert();
        vm.prank(address(0x999));
        oracle.updateRiskScore(50, "QmTest");
    }

    function test_RevertUpdateRiskScore_WhenPaused() public {
        vm.prank(admin);
        oracle.pause();

        vm.expectRevert();
        vm.prank(creWorkflow);
        oracle.updateRiskScore(50, "QmTest");
    }

    function test_UpdateProtocolHealth() public {
        vm.expectEmit(false, false, false, true);
        emit ProtocolHealthUpdated("Aave", 90, block.timestamp);

        vm.prank(creWorkflow);
        oracle.updateProtocolHealth("Aave", 90, 5000000e6, 8000);

        IRiskOracle.ProtocolHealth memory health = oracle.getProtocolHealth(
            "Aave"
        );
        assertEq(health.healthScore, 90);
        assertEq(health.tvl, 5000000e6);
        assertEq(health.utilizationRate, 8000);
    }

    function test_RevertUpdateProtocolHealth_InvalidScore() public {
        vm.expectRevert(IRiskOracle.InvalidRiskScore.selector);
        vm.prank(creWorkflow);
        oracle.updateProtocolHealth("Aave", 101, 1000000e6, 5000);
    }

    function test_RevertUpdateProtocolHealth_InvalidUtilization() public {
        vm.expectRevert(IRiskOracle.InvalidRiskScore.selector);
        vm.prank(creWorkflow);
        oracle.updateProtocolHealth("Aave", 90, 1000000e6, 10001); // Over 100%
    }

    function test_RevertUpdateProtocolHealth_Unauthorized() public {
        vm.expectRevert();
        vm.prank(address(0x999));
        oracle.updateProtocolHealth("Aave", 90, 1000000e6, 5000);
    }

    function test_Pause() public {
        vm.prank(admin);
        oracle.pause();

        assertTrue(oracle.paused());
    }

    function test_Unpause() public {
        vm.prank(admin);
        oracle.pause();

        vm.prank(admin);
        oracle.unpause();

        assertFalse(oracle.paused());
    }

    function test_RevertPause_Unauthorized() public {
        vm.expectRevert();
        vm.prank(address(0x999));
        oracle.pause();
    }

    function test_MultipleProtocolUpdates() public {
        vm.startPrank(creWorkflow);

        oracle.updateProtocolHealth("Aave", 90, 1000000e6, 7500);
        oracle.updateProtocolHealth("Compound", 85, 800000e6, 6000);
        oracle.updateProtocolHealth("MakerDAO", 95, 1500000e6, 8500);

        vm.stopPrank();

        IRiskOracle.ProtocolHealth memory aave = oracle.getProtocolHealth(
            "Aave"
        );
        IRiskOracle.ProtocolHealth memory compound = oracle.getProtocolHealth(
            "Compound"
        );
        IRiskOracle.ProtocolHealth memory maker = oracle.getProtocolHealth(
            "MakerDAO"
        );

        assertEq(aave.healthScore, 90);
        assertEq(compound.healthScore, 85);
        assertEq(maker.healthScore, 95);
    }

    function test_RiskScoreProgression() public {
        vm.startPrank(creWorkflow);

        // Simulate gradual risk increase
        oracle.updateRiskScore(20, "QmRisk1");
        oracle.updateRiskScore(40, "QmRisk2");
        oracle.updateRiskScore(60, "QmRisk3");
        oracle.updateRiskScore(80, "QmRisk4");

        vm.stopPrank();

        (uint8 finalScore, , ) = oracle.getCurrentRiskScore();
        assertEq(finalScore, 80);
        assertFalse(oracle.shouldTriggerLiquidation());
    }
}
