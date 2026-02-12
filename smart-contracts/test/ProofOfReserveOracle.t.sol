// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/ProofOfReserveOracle.sol";

contract ProofOfReserveOracleTest is Test {
    ProofOfReserveOracle public oracle;

    address public admin = address(0x1);
    address public creWorkflow = address(0x2);

    event ReservesVerified(
        uint256 onChainReserves,
        uint256 custodianReserves,
        uint256 reserveRatio,
        bool isHealthy,
        uint256 timestamp
    );
    event SafeguardActivated(string reason, uint256 timestamp);
    event ReserveThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    function setUp() public {
        oracle = new ProofOfReserveOracle(admin);

        // Grant CRE workflow role
        vm.startPrank(admin);
        oracle.grantRole(oracle.CRE_WORKFLOW_ROLE(), creWorkflow);
        vm.stopPrank();
    }

    function test_Constructor() public view {
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(oracle.getReserveThreshold(), 9500); // 95%
        assertTrue(oracle.areReservesSufficient()); // Initial state is healthy
    }

    function test_RevertConstructor_InvalidAdmin() public {
        vm.expectRevert(IProofOfReserveOracle.InvalidReserveData.selector);
        new ProofOfReserveOracle(address(0));
    }

    function test_GetCurrentReserves() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(1000e6, 1000e6, 1000e6); // 100% reserve ratio

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();

        assertEq(reserves.onChainReserves, 1000e6);
        assertEq(reserves.custodianReserves, 1000e6);
        assertEq(reserves.totalShares, 1000e6);
        assertEq(reserves.reserveRatio, 10000); // 100%
        assertTrue(reserves.isHealthy);
    }

    function test_AreReservesSufficient_Healthy() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(950e6, 950e6, 1000e6); // 95% reserve ratio

        assertTrue(oracle.areReservesSufficient());
    }

    function test_AreReservesSufficient_Unhealthy() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(900e6, 900e6, 1000e6); // 90% reserve ratio

        assertFalse(oracle.areReservesSufficient());
    }

    function test_GetReserveThreshold() public view {
        assertEq(oracle.getReserveThreshold(), 9500);
    }

    function test_UpdateReserves_Healthy() public {
        vm.expectEmit(false, false, false, true);
        emit ReservesVerified(1000e6, 1000e6, 10000, true, block.timestamp);

        vm.prank(creWorkflow);
        oracle.updateReserves(1000e6, 1000e6, 1000e6);

        assertTrue(oracle.areReservesSufficient());
    }

    function test_UpdateReserves_Unhealthy() public {
        vm.expectEmit(false, false, false, true);
        emit SafeguardActivated(
            "Insufficient reserves detected",
            block.timestamp
        );

        vm.prank(creWorkflow);
        oracle.updateReserves(800e6, 800e6, 1000e6); // 80% reserve ratio

        assertFalse(oracle.areReservesSufficient());
    }

    function test_UpdateReserves_NoShares() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(1000e6, 1000e6, 0); // No shares issued

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        assertEq(reserves.reserveRatio, 10000); // 100% when no shares
        assertTrue(reserves.isHealthy);
    }

    function test_UpdateReserves_AverageCalculation() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(1000e6, 800e6, 1000e6); // Different on-chain vs custodian

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        // Average = (1000 + 800) / 2 = 900
        // Ratio = 900 / 1000 * 10000 = 9000 (90%)
        assertEq(reserves.reserveRatio, 9000);
        assertFalse(reserves.isHealthy); // Below 95% threshold
    }

    function test_RevertUpdateReserves_Unauthorized() public {
        vm.expectRevert();
        vm.prank(address(0x999));
        oracle.updateReserves(1000e6, 1000e6, 1000e6);
    }

    function test_RevertUpdateReserves_WhenPaused() public {
        vm.prank(admin);
        oracle.pause();

        vm.expectRevert();
        vm.prank(creWorkflow);
        oracle.updateReserves(1000e6, 1000e6, 1000e6);
    }

    function test_SetReserveThreshold() public {
        vm.expectEmit(false, false, false, true);
        emit ReserveThresholdUpdated(9500, 8000);

        vm.prank(admin);
        oracle.setReserveThreshold(8000); // 80%

        assertEq(oracle.getReserveThreshold(), 8000);
    }

    function test_SetReserveThreshold_ClearsSafeguard() public {
        // Set up reserves at 90%
        vm.prank(creWorkflow);
        oracle.updateReserves(900e6, 900e6, 1000e6);

        // Lower threshold to 85%, reserves become healthy
        vm.prank(admin);
        oracle.setReserveThreshold(8500); // 85%

        assertTrue(oracle.areReservesSufficient());
    }

    function test_RevertSetReserveThreshold_TooHigh() public {
        vm.expectRevert(IProofOfReserveOracle.InvalidReserveData.selector);
        vm.prank(admin);
        oracle.setReserveThreshold(10001); // Over 100%
    }

    function test_RevertSetReserveThreshold_TooLow() public {
        vm.expectRevert(IProofOfReserveOracle.InvalidReserveData.selector);
        vm.prank(admin);
        oracle.setReserveThreshold(4999); // Under 50%
    }

    function test_RevertSetReserveThreshold_Unauthorized() public {
        vm.expectRevert();
        vm.prank(address(0x999));
        oracle.setReserveThreshold(8000);
    }

    // ============ Admin Functions Tests ============

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

    // ============ Edge Cases ============

    function test_ReserveRatioCalculation_ExactThreshold() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(950e6, 950e6, 1000e6); // Exactly 95%

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        assertEq(reserves.reserveRatio, 9500);
        assertTrue(reserves.isHealthy); // Should pass at exact threshold
    }

    function test_ReserveRatioCalculation_AboveThreshold() public {
        vm.prank(creWorkflow);
        oracle.updateReserves(1100e6, 1100e6, 1000e6); // 110% over-collateralized

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        assertEq(reserves.reserveRatio, 11000);
        assertTrue(reserves.isHealthy);
    }

    function test_MultipleUpdates() public {
        vm.startPrank(creWorkflow);

        // Simulate monitoring over time
        oracle.updateReserves(1000e6, 1000e6, 1000e6); // Start at 100%
        oracle.updateReserves(980e6, 980e6, 1000e6); // Drop to 98%
        oracle.updateReserves(950e6, 950e6, 1000e6); // Drop to 95% (threshold)
        oracle.updateReserves(920e6, 920e6, 1000e6); // Drop to 92% (unhealthy)

        vm.stopPrank();

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        assertEq(reserves.reserveRatio, 9200);
        assertFalse(reserves.isHealthy);
    }

    function test_DiscrepancyBetweenSources() public {
        // Large discrepancy between on-chain and custodian
        vm.prank(creWorkflow);
        oracle.updateReserves(1200e6, 600e6, 1000e6);

        IProofOfReserveOracle.ReserveData memory reserves = oracle
            .getCurrentReserves();
        // Average = (1200 + 600) / 2 = 900
        assertEq(reserves.reserveRatio, 9000);
        assertFalse(reserves.isHealthy);
    }
}
