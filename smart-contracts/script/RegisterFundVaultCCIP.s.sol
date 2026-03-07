// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/core/FundVault.sol";
import {BurnMintTokenPool} from "@chainlink/contracts-ccip/src/v0.8/ccip/pools/BurnMintTokenPool.sol";
import {IBurnMintERC20} from "@chainlink/contracts-ccip/src/v0.8/shared/token/ERC20/IBurnMintERC20.sol";
import {TokenPool} from "@chainlink/contracts-ccip/src/v0.8/ccip/pools/TokenPool.sol";
import {RateLimiter} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/RateLimiter.sol";

/**
 * @title RegisterFundVaultCCIP
 * @notice Full CCIP registration for FundVault via forge script.
 *
 * PHASE 1 — Deploy pool & register (run on EACH chain):
 *   FUND_VAULT=0x... forge script script/RegisterFundVaultCCIP.s.sol \
 *     --sig "deployAndRegister()" --rpc-url sepolia --broadcast
 *
 * PHASE 2 — Configure remote chain (run AFTER Phase 1 on BOTH chains):
 *   LOCAL_POOL=0x... REMOTE_POOL=0x... REMOTE_TOKEN=0x... \
 *   REMOTE_CHAIN_SELECTOR=10344971235874465080 \
 *   forge script script/RegisterFundVaultCCIP.s.sol \
 *     --sig "configureRemoteChain()" --rpc-url sepolia --broadcast
 */
contract RegisterFundVaultCCIP is Script {
    // ── Sepolia ──
    address constant SEPOLIA_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant SEPOLIA_RMN = 0xba3f6251de62dED61Ff98590cB2fDf6871FbB991;
    address constant SEPOLIA_TOKEN_ADMIN_REGISTRY = 0x95F29FEE11c5C55d26cCcf1DB6772DE953B37B82;
    address constant SEPOLIA_REGISTRY_MODULE = 0xa3c796d480638d7476792230da1E2ADa86e031b0;

    // ── Base Sepolia ──
    address constant BASE_SEPOLIA_ROUTER = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;
    address constant BASE_SEPOLIA_RMN = 0x99360767a4705f68CcCb9533195B761648d6d807;
    address constant BASE_SEPOLIA_TOKEN_ADMIN_REGISTRY = 0x736D0bBb318c1B27Ff686cd19804094E66250e17;
    address constant BASE_SEPOLIA_REGISTRY_MODULE = 0x176ae8C6C11DD2c031B924CE1A0A43188035f3f6;

    function deployAndRegister() public {
        address fundVaultAddr = vm.envAddress("FUND_VAULT");
        FundVault vault = FundVault(fundVaultAddr);

        (address router, address rmnProxy, address registryModule, address tokenAdminRegistry) = _getChainAddresses();

        console.log("=== Phase 1: Deploy & Register FundVault with CCIP ===");
        console.log("Chain ID:", block.chainid);
        console.log("FundVault:", fundVaultAddr);
        console.log("Router:", router);
        console.log("");

        vm.startBroadcast();

        // Step 1: Register as CCIP admin via getCCIPAdmin()
        console.log("Step 1: Registering admin via getCCIPAdmin()...");
        IRegistryModule(registryModule).registerAdminViaGetCCIPAdmin(fundVaultAddr);
        console.log("  -> Admin proposed");

        // Step 2: Accept admin role on TokenAdminRegistry
        console.log("Step 2: Accepting admin role...");
        ITokenAdminRegistryActions(tokenAdminRegistry).acceptAdminRole(fundVaultAddr);
        console.log("  -> Admin role accepted");

        // Step 3: Deploy BurnMintTokenPool
        console.log("Step 3: Deploying BurnMintTokenPool...");
        address[] memory allowlist = new address[](0);
        BurnMintTokenPool pool = new BurnMintTokenPool(
            IBurnMintERC20(fundVaultAddr),
            18,
            allowlist,
            rmnProxy,
            router
        );
        console.log("  -> Pool deployed at:", address(pool));

        // Step 4: Link pool to token in TokenAdminRegistry
        console.log("Step 4: Setting pool in TokenAdminRegistry...");
        ITokenAdminRegistryActions(tokenAdminRegistry).setPool(fundVaultAddr, address(pool));
        console.log("  -> Pool linked");

        // Step 5: Grant mint/burn roles to pool on FundVault
        console.log("Step 5: Granting MINTER_ROLE + BURNER_ROLE to pool...");
        vault.grantMintAndBurnRoles(address(pool));
        console.log("  -> Roles granted");

        // Step 6: Set CCIP Router on FundVault
        console.log("Step 6: Setting CCIP Router on FundVault...");
        vault.setCCIPRouter(router);
        console.log("  -> Router set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Phase 1 Complete ===");
        console.log("BurnMintTokenPool:", address(pool));
        console.log("NEXT: Run Phase 1 on the OTHER chain, then Phase 2 on BOTH chains.");
    }

    function configureRemoteChain() public {
        address localPool = vm.envAddress("LOCAL_POOL");
        address remotePool = vm.envAddress("REMOTE_POOL");
        address remoteToken = vm.envAddress("REMOTE_TOKEN");
        uint64 remoteChainSelector = uint64(vm.envUint("REMOTE_CHAIN_SELECTOR"));

        console.log("=== Phase 2: Configure Remote Chain ===");
        console.log("Chain ID:", block.chainid);
        console.log("Local Pool:", localPool);
        console.log("Remote Pool:", remotePool);
        console.log("Remote Token:", remoteToken);
        console.log("Remote Chain Selector:", uint256(remoteChainSelector));
        console.log("");

        vm.startBroadcast();

        bytes[] memory remotePoolAddresses = new bytes[](1);
        remotePoolAddresses[0] = abi.encode(remotePool);

        TokenPool.ChainUpdate[] memory chains = new TokenPool.ChainUpdate[](1);
        chains[0] = TokenPool.ChainUpdate({
            remoteChainSelector: remoteChainSelector,
            remotePoolAddresses: remotePoolAddresses,
            remoteTokenAddress: abi.encode(remoteToken),
            outboundRateLimiterConfig: RateLimiter.Config({isEnabled: false, capacity: 0, rate: 0}),
            inboundRateLimiterConfig: RateLimiter.Config({isEnabled: false, capacity: 0, rate: 0})
        });

        console.log("Applying chain update...");
        TokenPool(localPool).applyChainUpdates(new uint64[](0), chains);
        console.log("  -> Remote chain configured");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Phase 2 Complete ===");
        console.log("Repeat on the OTHER chain with swapped LOCAL/REMOTE values.");
    }

    function _getChainAddresses()
        internal
        view
        returns (address router, address rmnProxy, address registryModule, address tokenAdminRegistry)
    {
        if (block.chainid == 11155111) {
            return (SEPOLIA_ROUTER, SEPOLIA_RMN, SEPOLIA_REGISTRY_MODULE, SEPOLIA_TOKEN_ADMIN_REGISTRY);
        } else if (block.chainid == 84532) {
            return (BASE_SEPOLIA_ROUTER, BASE_SEPOLIA_RMN, BASE_SEPOLIA_REGISTRY_MODULE, BASE_SEPOLIA_TOKEN_ADMIN_REGISTRY);
        } else {
            revert("Unsupported chain");
        }
    }
}

interface IRegistryModule {
    function registerAdminViaGetCCIPAdmin(address token) external;
}

interface ITokenAdminRegistryActions {
    function acceptAdminRole(address localToken) external;
    function setPool(address localToken, address pool) external;
}
