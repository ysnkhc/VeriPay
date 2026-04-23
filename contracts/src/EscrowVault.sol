// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Types.sol";

interface IUsageMeter {
    function getSession(uint256 sessionId) external view returns (Types.Session memory);
    function getSessionAction(uint256 sessionId, uint256 actionIndex) external view returns (Types.ActionRecord memory);
}

contract NanoSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SessionDeposit {
        uint256 deposited;
        uint256 spent;
        uint256 settledUpTo; // next actionIndex to settle
    }

    IERC20 public usdc;
    IUsageMeter public meter;
    address public owner;

    mapping(uint256 => SessionDeposit) public deposits;

    // ── Events ──────────────────────────────────────────────────────────
    event SessionFunded(
        uint256 indexed sessionId,
        address indexed consumer,
        uint256 amount
    );
    event ActionSettled(
        uint256 indexed sessionId,
        uint256 indexed actionIndex,
        address indexed provider,
        uint256 amount,
        uint256 totalPaidSoFar
    );
    event UnusedWithdrawn(
        uint256 indexed sessionId,
        address indexed consumer,
        uint256 amount
    );

    // ── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Constructor ─────────────────────────────────────────────────────
    constructor(address _usdc, address _meter) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        meter = IUsageMeter(_meter);
    }

    // ── Core Functions ──────────────────────────────────────────────────

    function depositSession(uint256 sessionId, uint256 amount) external nonReentrant {
        Types.Session memory s = meter.getSession(sessionId);
        require(s.consumer == msg.sender, "Not consumer");
        require(
            s.status == Types.SessionStatus.ACTIVE ||
            s.status == Types.SessionStatus.NONE,
            "Session not active"
        );
        require(amount > 0, "Amount must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        deposits[sessionId].deposited += amount;

        emit SessionFunded(sessionId, msg.sender, amount);
    }

    function settleAction(uint256 sessionId, uint256 actionIndex) external nonReentrant {
        SessionDeposit storage dep = deposits[sessionId];
        require(actionIndex == dep.settledUpTo, "Must settle sequentially");

        Types.ActionRecord memory action = meter.getSessionAction(sessionId, actionIndex);
        require(action.cost > 0, "Action not recorded");

        Types.Session memory s = meter.getSession(sessionId);
        uint256 remaining = dep.deposited - dep.spent;
        require(remaining >= action.cost, "Insufficient deposit");

        dep.spent += action.cost;
        dep.settledUpTo++;

        // Transfer USDC to provider
        usdc.safeTransfer(s.provider, action.cost);

        emit ActionSettled(sessionId, actionIndex, s.provider, action.cost, dep.spent);
    }

    function settleBatch(uint256 sessionId, uint256 count) external nonReentrant {
        SessionDeposit storage dep = deposits[sessionId];
        Types.Session memory s = meter.getSession(sessionId);

        uint256 totalCost = 0;
        uint256 startIndex = dep.settledUpTo;

        for (uint256 i = 0; i < count; i++) {
            uint256 idx = startIndex + i;
            Types.ActionRecord memory action = meter.getSessionAction(sessionId, idx);
            require(action.cost > 0, "Action not recorded");
            totalCost += action.cost;

            emit ActionSettled(sessionId, idx, s.provider, action.cost, dep.spent + totalCost);
        }

        uint256 remaining = dep.deposited - dep.spent;
        require(remaining >= totalCost, "Insufficient deposit");

        dep.spent += totalCost;
        dep.settledUpTo += count;

        // Single transfer for the batch
        usdc.safeTransfer(s.provider, totalCost);
    }

    function withdrawUnused(uint256 sessionId) external nonReentrant {
        Types.Session memory s = meter.getSession(sessionId);
        require(s.consumer == msg.sender, "Not consumer");
        require(
            s.status == Types.SessionStatus.COMPLETED ||
            s.status == Types.SessionStatus.CANCELLED,
            "Session still active"
        );

        SessionDeposit storage dep = deposits[sessionId];
        uint256 remaining = dep.deposited - dep.spent;
        require(remaining > 0, "Nothing to withdraw");

        dep.deposited = dep.spent; // zero out remaining
        usdc.safeTransfer(msg.sender, remaining);

        emit UnusedWithdrawn(sessionId, msg.sender, remaining);
    }

    // ── View ────────────────────────────────────────────────────────────

    function getDeposit(uint256 sessionId) external view returns (
        uint256 deposited,
        uint256 spent,
        uint256 remaining
    ) {
        SessionDeposit storage dep = deposits[sessionId];
        return (dep.deposited, dep.spent, dep.deposited - dep.spent);
    }

    function getTotalPaid(uint256 sessionId) external view returns (uint256) {
        return deposits[sessionId].spent;
    }

    function getSettledActionCount(uint256 sessionId) external view returns (uint256) {
        return deposits[sessionId].settledUpTo;
    }
}
