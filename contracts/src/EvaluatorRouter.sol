// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        string endpointURI;
        uint256 defaultPricePerAction; // USDC 6 decimals
        bool active;
    }

    mapping(address => Agent) public agents;
    address[] public agentList;

    // ── Events ──────────────────────────────────────────────────────────
    event AgentRegistered(address indexed owner, string name, uint256 defaultPrice);
    event AgentUpdated(address indexed owner, string name);
    event AgentDeactivated(address indexed owner);

    // ── Core Functions ──────────────────────────────────────────────────

    function registerAgent(
        string calldata name,
        string calldata endpointURI,
        uint256 defaultPricePerAction
    ) external {
        require(agents[msg.sender].owner == address(0), "Already registered");
        require(bytes(name).length > 0, "Name required");
        require(defaultPricePerAction > 0, "Price must be > 0");

        agents[msg.sender] = Agent({
            owner: msg.sender,
            name: name,
            endpointURI: endpointURI,
            defaultPricePerAction: defaultPricePerAction,
            active: true
        });
        agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, defaultPricePerAction);
    }

    function updateAgent(
        string calldata name,
        string calldata endpointURI,
        uint256 defaultPricePerAction
    ) external {
        require(agents[msg.sender].owner == msg.sender, "Not registered");
        require(defaultPricePerAction > 0, "Price must be > 0");

        Agent storage a = agents[msg.sender];
        a.name = name;
        a.endpointURI = endpointURI;
        a.defaultPricePerAction = defaultPricePerAction;

        emit AgentUpdated(msg.sender, name);
    }

    function deactivateAgent() external {
        require(agents[msg.sender].owner == msg.sender, "Not registered");
        agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    // ── View ────────────────────────────────────────────────────────────

    function getAgent(address agentOwner) external view returns (Agent memory) {
        return agents[agentOwner];
    }

    function getAgentByIndex(uint256 index) external view returns (Agent memory) {
        require(index < agentList.length, "Index out of bounds");
        return agents[agentList[index]];
    }

    function agentCount() external view returns (uint256) {
        return agentList.length;
    }
}
