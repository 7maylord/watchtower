// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReceiverContracts
 * @notice Base interface for contracts receiving CRE workflow reports
 * @dev Implement this to receive signed reports from Chainlink CRE workflows
 */
interface IReceiverContracts {
    /**
     * @notice Receive and process a signed report from CRE workflow
     * @dev Called by CRE DON after consensus is reached
     * @param metadata Report metadata (version, chain ID, etc.)
     * @param rawReport Encoded report payload
     * @param reportContext Additional context (signatures, etc.)
     */
    function onReport(
        bytes calldata metadata,
        bytes calldata rawReport,
        bytes calldata reportContext
    ) external;
}
