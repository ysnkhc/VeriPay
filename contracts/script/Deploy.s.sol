// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/JobRegistry.sol";
import "../src/EscrowVault.sol";
import "../src/EvaluatorRouter.sol";
import "../src/mocks/MockUSDC.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockUSDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:", address(usdc));

        // 2. Deploy UsageMeter
        UsageMeter meter = new UsageMeter();
        console.log("UsageMeter:", address(meter));

        // 3. Deploy NanoSettlement
        NanoSettlement settlement = new NanoSettlement(address(usdc), address(meter));
        console.log("NanoSettlement:", address(settlement));

        // 4. Deploy AgentRegistry
        AgentRegistry agentRegistry = new AgentRegistry();
        console.log("AgentRegistry:", address(agentRegistry));

        // 5. Wire up: let meter know about settlement
        meter.setSettlement(address(settlement));

        // 6. Mint USDC to deployer EOA for demo sessions
        // NOTE: msg.sender here is the script contract, NOT the EOA.
        // Use vm.addr() to derive the actual deployer address.
        address deployer = vm.addr(deployerPrivateKey);
        usdc.mint(deployer, 10_000_000_000); // 10,000 USDC
        console.log("Minted 10,000 USDC to deployer:", deployer);

        vm.stopBroadcast();
    }
}
