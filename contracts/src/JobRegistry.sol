// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Types.sol";

contract UsageMeter {
    uint256 public nextSessionId = 1;

    mapping(uint256 => Types.Session) public sessions;
    // sessionId => actionIndex => ActionRecord
    mapping(uint256 => mapping(uint256 => Types.ActionRecord)) public actions;

    address public owner;
    address public settlement; // NanoSettlement address, allowed to read

    // ── Events ──────────────────────────────────────────────────────────
    event SessionCreated(
        uint256 indexed sessionId,
        address indexed consumer,
        address indexed provider,
        uint256 pricePerAction
    );
    event ActionRecorded(
        uint256 indexed sessionId,
        uint256 indexed actionIndex,
        Types.ActionType actionType,
        uint256 units,
        uint256 cost,
        bytes32 actionHash
    );
    event SessionFinalized(
        uint256 indexed sessionId,
        uint256 totalActions,
        uint256 totalAmount
    );
    event SessionCancelled(uint256 indexed sessionId);

    // ── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlySessionConsumer(uint256 sessionId) {
        require(msg.sender == sessions[sessionId].consumer, "Not consumer");
        _;
    }

    // ── Constructor ─────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Admin ───────────────────────────────────────────────────────────
    function setSettlement(address _settlement) external onlyOwner {
        settlement = _settlement;
    }

    // ── Core Functions ──────────────────────────────────────────────────

    function createSession(
        address provider,
        uint256 pricePerAction,
        string calldata metadataURI
    ) external returns (uint256 sessionId) {
        require(provider != address(0), "Invalid provider");
        require(provider != msg.sender, "Cannot self-loop");
        require(pricePerAction > 0, "Price must be > 0");

        sessionId = nextSessionId++;

        Types.Session storage s = sessions[sessionId];
        s.id = sessionId;
        s.consumer = msg.sender;
        s.provider = provider;
        s.pricePerAction = pricePerAction;
        s.createdAt = block.timestamp;
        s.status = Types.SessionStatus.ACTIVE;
        s.metadataURI = metadataURI;

        emit SessionCreated(sessionId, msg.sender, provider, pricePerAction);
    }

    function recordAction(
        uint256 sessionId,
        Types.ActionType actionType,
        uint256 units,
        bytes32 actionHash
    ) external onlySessionConsumer(sessionId) returns (uint256 actionIndex) {
        Types.Session storage s = sessions[sessionId];
        require(s.status == Types.SessionStatus.ACTIVE, "Session not active");
        require(units > 0, "Units must be > 0");

        uint256 cost = s.pricePerAction * units;
        actionIndex = s.totalActions;

        actions[sessionId][actionIndex] = Types.ActionRecord({
            sessionId: sessionId,
            actionType: actionType,
            units: units,
            cost: cost,
            actionHash: actionHash,
            timestamp: block.timestamp
        });

        s.totalActions++;
        s.totalAmount += cost;

        emit ActionRecorded(sessionId, actionIndex, actionType, units, cost, actionHash);
    }

    function finalizeSession(uint256 sessionId) external onlySessionConsumer(sessionId) {
        Types.Session storage s = sessions[sessionId];
        require(s.status == Types.SessionStatus.ACTIVE, "Session not active");

        s.status = Types.SessionStatus.COMPLETED;
        emit SessionFinalized(sessionId, s.totalActions, s.totalAmount);
    }

    function cancelSession(uint256 sessionId) external onlySessionConsumer(sessionId) {
        Types.Session storage s = sessions[sessionId];
        require(s.status == Types.SessionStatus.ACTIVE, "Session not active");

        s.status = Types.SessionStatus.CANCELLED;
        emit SessionCancelled(sessionId);
    }

    // ── View ────────────────────────────────────────────────────────────

    function getSession(uint256 sessionId) external view returns (Types.Session memory) {
        return sessions[sessionId];
    }

    function getSessionAction(
        uint256 sessionId,
        uint256 actionIndex
    ) external view returns (Types.ActionRecord memory) {
        return actions[sessionId][actionIndex];
    }

    function getSessionActionCount(uint256 sessionId) external view returns (uint256) {
        return sessions[sessionId].totalActions;
    }

    function getSessionTotals(uint256 sessionId) external view returns (
        uint256 totalActions,
        uint256 totalAmount
    ) {
        Types.Session storage s = sessions[sessionId];
        return (s.totalActions, s.totalAmount);
    }
}
