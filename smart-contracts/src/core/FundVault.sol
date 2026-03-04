// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IFundVault.sol";
import "../interfaces/IComplianceRegistry.sol";
import "../interfaces/IRiskOracle.sol";
import "../interfaces/IProofOfReserveOracle.sol";

// Interfaces for mock protocols
interface IMockAavePool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

interface IMockCompoundReserve {
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function balanceOfUnderlying(
        address account
    ) external view returns (uint256);
}

/**
 * @title FundVault
 * @notice Main tokenized fund vault with integrated compliance and risk monitoring
 * @dev ERC20 fund shares with hooks to compliance, risk, and reserve oracles
 */
contract FundVault is IFundVault, ERC20, AccessControl, Pausable {
    // Roles
    bytes32 public constant FUND_MANAGER_ROLE = keccak256("FUND_MANAGER_ROLE");
    bytes32 public constant CRE_WORKFLOW_ROLE = keccak256("CRE_WORKFLOW_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // CCIP admin (for TokenAdminRegistry registration)
    address private s_ccipAdmin;

    // External contracts
    IERC20 private immutable _underlyingAsset;
    IComplianceRegistry private immutable _complianceRegistry;
    IRiskOracle private immutable _riskOracle;
    IProofOfReserveOracle private immutable _porOracle;

    // Mock protocols
    IMockAavePool public aavePool;
    IMockCompoundReserve public compoundReserve;
    IERC20 public aToken;
    IERC20 public cToken;

    // State
    uint256 private _totalAssetsValue;
    uint8 public rebalanceRiskThreshold = 50; // Default: CRE can rebalance when risk >= 50

    // Custom errors
    error RiskBelowThreshold(uint8 currentRisk, uint8 threshold);

    // Events
    event RebalanceRiskThresholdUpdated(uint8 oldThreshold, uint8 newThreshold);
    event AnalysisRequested(address indexed requester, uint256 timestamp);
    event RebalanceRequested(address indexed requester, uint256 timestamp);
    event CCIPAdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    /**
     * @notice Constructor
     * @param name_ Fund token name (e.g., "Watchtower RWA Fund")
     * @param symbol_ Fund token symbol (e.g., "WRWA")
     * @param underlyingAsset_ Address of underlying asset (e.g., USDC)
     * @param complianceRegistry_ ComplianceRegistry contract address
     * @param riskOracle_ RiskOracle contract address
     * @param porOracle_ ProofOfReserveOracle contract address
     * @param admin Admin address
     * @param fundManager Fund manager address
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address underlyingAsset_,
        address complianceRegistry_,
        address riskOracle_,
        address porOracle_,
        address admin,
        address fundManager
    ) ERC20(name_, symbol_) {
        require(underlyingAsset_ != address(0), "Invalid asset");
        require(
            complianceRegistry_ != address(0),
            "Invalid compliance registry"
        );
        require(riskOracle_ != address(0), "Invalid risk oracle");
        require(porOracle_ != address(0), "Invalid PoR oracle");
        require(admin != address(0), "Invalid admin");
        require(fundManager != address(0), "Invalid fund manager");

        _underlyingAsset = IERC20(underlyingAsset_);
        _complianceRegistry = IComplianceRegistry(complianceRegistry_);
        _riskOracle = IRiskOracle(riskOracle_);
        _porOracle = IProofOfReserveOracle(porOracle_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FUND_MANAGER_ROLE, fundManager);

        // Set deployer as initial CCIP admin for TokenAdminRegistry registration
        s_ccipAdmin = admin;
    }

    function setMockProtocols(
        address _aavePool,
        address _aToken,
        address _compoundReserve,
        address _cToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        aavePool = IMockAavePool(_aavePool);
        aToken = IERC20(_aToken); // MockAavePool is the aToken in our setup
        compoundReserve = IMockCompoundReserve(_compoundReserve);
        cToken = IERC20(_cToken); // MockCompoundReserve is the cToken

        // Approve protocols to spend underlying
        _underlyingAsset.approve(_aavePool, type(uint256).max);
        _underlyingAsset.approve(_compoundReserve, type(uint256).max);
    }

    function asset() external view override returns (address) {
        return address(_underlyingAsset);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 idleBalance = _underlyingAsset.balanceOf(address(this));
        uint256 aaveBalance = address(aToken) != address(0)
            ? aToken.balanceOf(address(this))
            : 0;
        uint256 compoundBalance = address(compoundReserve) != address(0)
            ? compoundReserve.balanceOfUnderlying(address(this))
            : 0;

        return idleBalance + aaveBalance + compoundBalance;
    }

    function sharePrice() public view returns (uint256 price) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18; // 1:1 ratio initially
        return (totalAssets() * 1e18) / supply;
    }

    function deposit(
        uint256 amount
    ) external override whenNotPaused returns (uint256 shares) {
        // Compliance check
        if (!_complianceRegistry.isCompliant(msg.sender)) {
            revert NotCompliant();
        }

        // Risk check - don't accept deposits if risk too high
        (uint8 riskScore, , ) = _riskOracle.getCurrentRiskScore();
        if (riskScore >= 85) {
            revert RiskTooHigh();
        }

        // Reserve check
        if (!_porOracle.areReservesSufficient()) {
            revert InsufficientReserves();
        }

        // Calculate shares to mint
        uint256 supply = totalSupply();
        if (supply == 0) {
            shares = amount; // 1:1 for first deposit
        } else {
            shares = (amount * supply) / totalAssets();
        }

        // Transfer underlying asset from user
        require(
            _underlyingAsset.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        // Mint shares
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, amount, shares);
    }

    function withdraw(
        uint256 shares
    ) external override whenNotPaused returns (uint256 amount) {
        // Compliance check (even for withdrawals)
        if (!_complianceRegistry.isCompliant(msg.sender)) {
            revert NotCompliant();
        }

        // Calculate underlying amount
        amount = (shares * totalAssets()) / totalSupply();

        // Check if we have enough idle balance, otherwise pull from protocols
        uint256 idleBalance = _underlyingAsset.balanceOf(address(this));
        if (idleBalance < amount) {
            uint256 shortfall = amount - idleBalance;
            // Try to pull from Aave first
            if (
                address(aToken) != address(0) &&
                aToken.balanceOf(address(this)) >= shortfall
            ) {
                aavePool.withdraw(
                    address(_underlyingAsset),
                    shortfall,
                    address(this)
                );
            } else if (
                address(compoundReserve) != address(0) &&
                compoundReserve.balanceOfUnderlying(address(this)) >= shortfall
            ) {
                compoundReserve.withdraw(address(_underlyingAsset), shortfall);
            } else {
                revert("Insufficient liquidity across protocols");
            }
        }

        // Burn shares
        _burn(msg.sender, shares);

        // Transfer underlying asset to user
        require(
            _underlyingAsset.transfer(msg.sender, amount),
            "Transfer failed"
        );

        emit Withdrawn(msg.sender, shares, amount);
    }

    /**
     * @notice Rebalance fund portfolio across DeFi protocols
     * @dev Currently a placeholder - production implementation would be orchestrated by CRE workflows
     * @param strategy IPFS hash containing the rebalancing strategy generated by AI
     *
     * ARCHITECTURE DECISION:
     * =====================
     * Rebalancing in Watchtower is primarily orchestrated OFF-CHAIN by CRE workflows rather than
     * implementing complex logic directly in this contract. This design choice provides:
     *
     * 1. MULTI-CHAIN CAPABILITY: CRE workflows can read portfolio positions across Ethereum,
     *    Polygon, Arbitrum, etc. and coordinate rebalancing across chains
     *
     * 2. AI-POWERED STRATEGY: The CRE portfolio health workflow uses Claude AI to:
     *    - Analyze current allocations across all protocols and chains
     *    - Detect market conditions and protocol risks
     *    - Generate optimal rebalancing strategy
     *    - Store strategy as IPFS hash (passed as parameter)
     *
     * 3. GAS EFFICIENCY: Complex multi-step operations executed by CRE DON rather than
     *    expensive on-chain loops and calculations
     *
     * 4. FLEXIBILITY: Strategy can adapt to new protocols without contract upgrades
     *
     * PRODUCTION IMPLEMENTATION WOULD INCLUDE:
     * ========================================
     *
     * A. Withdraw from current positions:
     *    ```solidity
     *    // Example: Withdraw from Aave
     *    IAavePool(aavePool).withdraw(
     *        address(_underlyingAsset),
     *        amountToWithdraw,
     *        address(this)
     *    );
     *
     *    // Example: Redeem from Compound
     *    ICToken(cUSDC).redeem(cTokenAmount);
     *    ```
     *
     * B. Swap assets if needed (via DEX aggregator for best rates):
     *    ```solidity
     *    // Example: 1inch aggregator swap
     *    I1inchRouter(router).swap(
     *        IERC20(tokenIn),
     *        IERC20(tokenOut),
     *        amountIn,
     *        minAmountOut,
     *        swapData  // Optimized route from 1inch API
     *    );
     *    ```
     *
     * C. Deposit into new positions:
     *    ```solidity
     *    // Example: Supply to Aave
     *    _underlyingAsset.approve(aavePool, depositAmount);
     *    IAavePool(aavePool).supply(
     *        address(_underlyingAsset),
     *        depositAmount,
     *        address(this),
     *        0
     *    );
     *    ```
     *
     * D. Update total assets value:
     *    ```solidity
     *    // This would be called by CRE workflow after rebalancing
     *    // updateTotalAssets(newCalculatedValue);
     *    ```
     *
     * ACTUAL EXECUTION FLOW:
     * ======================
     * 1. CRE Portfolio Health Workflow monitors positions (every 5 min)
     * 2. AI detects rebalancing opportunity (e.g., Aave utilization too high)
     * 3. AI generates optimal strategy → stores on IPFS
     * 4. CRE workflow executes multi-step rebalancing:
     *    - Calls this function to validate and record strategy
     *    - Executes withdrawals via EVM write capability
     *    - Executes swaps via DEX integrations
     *    - Executes deposits to new protocols
     *    - Updates totalAssets via updateTotalAssets()
     * 5. All steps are consensus-verified by Chainlink DON
     */
    /**
     * @notice Set the risk threshold above which CRE workflows can trigger rebalancing
     * @param newThreshold Risk score threshold (0-100)
     */
    function setRebalanceRiskThreshold(
        uint8 newThreshold
    ) external onlyRole(FUND_MANAGER_ROLE) {
        uint8 oldThreshold = rebalanceRiskThreshold;
        rebalanceRiskThreshold = newThreshold;
        emit RebalanceRiskThresholdUpdated(oldThreshold, newThreshold);
    }

    function rebalance(
        string calldata strategy,
        uint256 aaveSupplyAmount,
        uint256 aaveWithdrawAmount,
        uint256 compSupplyAmount,
        uint256 compWithdrawAmount
    ) external whenNotPaused {
        // Allow both FUND_MANAGER and CRE_WORKFLOW
        bool isFundManager = hasRole(FUND_MANAGER_ROLE, msg.sender);
        bool isCreWorkflow = hasRole(CRE_WORKFLOW_ROLE, msg.sender);
        require(isFundManager || isCreWorkflow, "Unauthorized");

        // Risk check before rebalancing
        (uint8 riskScore, , ) = _riskOracle.getCurrentRiskScore();
        if (riskScore >= 90) {
            revert RiskTooHigh();
        }

        // CRE can only rebalance when risk exceeds the threshold set by fund manager
        if (isCreWorkflow && !isFundManager) {
            if (riskScore < rebalanceRiskThreshold) {
                revert RiskBelowThreshold(riskScore, rebalanceRiskThreshold);
            }
        }

        // Execute rebalancing actions
        if (aaveWithdrawAmount > 0) {
            aavePool.withdraw(
                address(_underlyingAsset),
                aaveWithdrawAmount,
                address(this)
            );
        }
        if (compWithdrawAmount > 0) {
            compoundReserve.withdraw(
                address(_underlyingAsset),
                compWithdrawAmount
            );
        }

        if (aaveSupplyAmount > 0) {
            aavePool.supply(
                address(_underlyingAsset),
                aaveSupplyAmount,
                address(this),
                0
            );
        }
        if (compSupplyAmount > 0) {
            compoundReserve.supply(address(_underlyingAsset), compSupplyAmount);
        }

        emit Rebalanced(strategy, block.timestamp);
    }

    function emergencyWithdraw(
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenPaused {
        require(to != address(0), "Invalid address");
        require(_underlyingAsset.transfer(to, amount), "Transfer failed");
        emit EmergencyWithdrawal(to, amount);
    }

    /**
     * @notice Request a portfolio health analysis from CRE
     * @dev Permissionless — emits AnalysisRequested for CRE logTrigger
     */
    function requestAnalysis() external {
        emit AnalysisRequested(msg.sender, block.timestamp);
    }

    /**
     * @notice Request a rebalancing analysis from CRE
     * @dev Permissionless — emits RebalanceRequested for CRE logTrigger
     */
    function requestRebalance() external {
        emit RebalanceRequested(msg.sender, block.timestamp);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Skip compliance check for minting/burning
        if (from != address(0) && to != address(0)) {
            // Check both sender and recipient are compliant
            if (!_complianceRegistry.isCompliant(from)) {
                revert NotCompliant();
            }
            if (!_complianceRegistry.isCompliant(to)) {
                revert NotCompliant();
            }
        }

        super._update(from, to, value);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ===== CCIP Cross-Chain Token (CCT) Support =====
    // Aligned with Chainlink's BurnMintERC20 pattern:
    // https://github.com/smartcontractkit/chainlink-evm/blob/contracts-solidity/1.5.0/contracts/src/v0.8/shared/token/ERC20/BurnMintERC20.sol

    /**
     * @notice Returns the CCIP admin address for TokenAdminRegistry registration
     * @dev Required by CCIP's RegistryModuleOwnerCustom to claim admin role
     */
    function getCCIPAdmin() external view returns (address) {
        return s_ccipAdmin;
    }

    /**
     * @notice Update the CCIP admin address
     * @param newAdmin New CCIP admin address
     */
    function setCCIPAdmin(
        address newAdmin
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "Invalid CCIP admin");
        address previousAdmin = s_ccipAdmin;
        s_ccipAdmin = newAdmin;
        emit CCIPAdminTransferred(previousAdmin, newAdmin);
    }

    /**
     * @notice Grant mint and burn roles to a CCIP token pool
     * @param burnAndMinter Address to grant both roles
     */
    function grantMintAndBurnRoles(
        address burnAndMinter
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, burnAndMinter);
        _grantRole(BURNER_ROLE, burnAndMinter);
    }

    /**
     * @notice Mint tokens — used by CCIP BurnMintTokenPool on destination chain
     * @param account Recipient address
     * @param amount Amount to mint
     */
    function mint(
        address account,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        _mint(account, amount);
    }

    /**
     * @notice Burn tokens — used by CCIP BurnMintTokenPool on source chain
     * @param amount Amount to burn from caller
     */
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(msg.sender, amount);
    }

    /**
     * @notice Burn tokens from a specific account — used by CCIP BurnMintTokenPool
     * @param account Account to burn from
     * @param amount Amount to burn
     */
    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /**
     * @notice ERC165 interface support
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
