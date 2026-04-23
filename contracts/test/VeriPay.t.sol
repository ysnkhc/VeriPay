// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/JobRegistry.sol";
import "../src/EscrowVault.sol";
import "../src/EvaluatorRouter.sol";
import "../src/mocks/MockUSDC.sol";
import "../src/Types.sol";

contract VeriPayLoopTest is Test {
    UsageMeter public meter;
    NanoSettlement public settlement;
    AgentRegistry public agentRegistry;
    MockUSDC public usdc;

    address public deployer = address(1);
    address public consumer = address(2);
    address public provider = address(3);

    uint256 public constant PRICE_PER_ACTION = 1000; // $0.001 in 6-decimal USDC
    uint256 public constant SESSION_BUDGET = 200_000; // $0.20 = 200 actions at $0.001

    function setUp() public {
        vm.startPrank(deployer);

        usdc = new MockUSDC();
        meter = new UsageMeter();
        settlement = new NanoSettlement(address(usdc), address(meter));
        agentRegistry = new AgentRegistry();

        meter.setSettlement(address(settlement));

        vm.stopPrank();

        // Mint USDC to consumer
        usdc.mint(consumer, 10_000_000); // $10 USDC
    }

    // ── UsageMeter tests ────────────────────────────────────────────────

    function test_createSession() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        assertEq(sid, 1);
        Types.Session memory s = meter.getSession(sid);
        assertEq(s.consumer, consumer);
        assertEq(s.provider, provider);
        assertEq(s.pricePerAction, PRICE_PER_ACTION);
        assertEq(uint8(s.status), uint8(Types.SessionStatus.ACTIVE));
    }

    function test_recordActions() public {
        vm.startPrank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        uint256 idx0 = meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
        uint256 idx1 = meter.recordAction(sid, Types.ActionType.JSON_TRANSFORM, 1, keccak256("a1"));
        uint256 idx2 = meter.recordAction(sid, Types.ActionType.FINAL_ANSWER, 1, keccak256("a2"));
        vm.stopPrank();

        assertEq(idx0, 0);
        assertEq(idx1, 1);
        assertEq(idx2, 2);
        assertEq(meter.getSessionActionCount(sid), 3);

        (uint256 totalActions, uint256 totalAmount) = meter.getSessionTotals(sid);
        assertEq(totalActions, 3);
        assertEq(totalAmount, PRICE_PER_ACTION * 3);

        Types.ActionRecord memory a = meter.getSessionAction(sid, 0);
        assertEq(uint8(a.actionType), uint8(Types.ActionType.API_LOOKUP));
        assertEq(a.cost, PRICE_PER_ACTION);
    }

    function test_finalizeSession() public {
        vm.startPrank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
        meter.finalizeSession(sid);
        vm.stopPrank();

        Types.Session memory s = meter.getSession(sid);
        assertEq(uint8(s.status), uint8(Types.SessionStatus.COMPLETED));
    }

    function test_cancelSession() public {
        vm.startPrank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");
        meter.cancelSession(sid);
        vm.stopPrank();

        Types.Session memory s = meter.getSession(sid);
        assertEq(uint8(s.status), uint8(Types.SessionStatus.CANCELLED));
    }

    function test_RevertWhen_recordActionNotConsumer() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.prank(provider); // wrong caller
        vm.expectRevert("Not consumer");
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
    }

    function test_RevertWhen_recordOnFinalizedSession() public {
        vm.startPrank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");
        meter.finalizeSession(sid);
        vm.expectRevert("Session not active");
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
        vm.stopPrank();
    }

    function test_RevertWhen_selfLoop() public {
        vm.prank(consumer);
        vm.expectRevert("Cannot self-loop");
        meter.createSession(consumer, PRICE_PER_ACTION, "meta://test");
    }

    // ── NanoSettlement tests ────────────────────────────────────────────

    function test_depositAndSettleSingleAction() public {
        // Create session and record an action
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.prank(consumer);
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));

        // Deposit budget
        vm.startPrank(consumer);
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        (uint256 deposited, , uint256 remaining) = settlement.getDeposit(sid);
        assertEq(deposited, SESSION_BUDGET);
        assertEq(remaining, SESSION_BUDGET);

        // Settle action 0
        settlement.settleAction(sid, 0);

        assertEq(usdc.balanceOf(provider), PRICE_PER_ACTION);
        assertEq(settlement.getTotalPaid(sid), PRICE_PER_ACTION);

        (, , uint256 remainAfter) = settlement.getDeposit(sid);
        assertEq(remainAfter, SESSION_BUDGET - PRICE_PER_ACTION);
    }

    function test_settle50Actions() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        // Record 50 actions
        vm.startPrank(consumer);
        for (uint256 i = 0; i < 50; i++) {
            meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256(abi.encodePacked("a", i)));
        }

        // Deposit
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        // Settle each action individually (simulates 50 tx events)
        for (uint256 i = 0; i < 50; i++) {
            settlement.settleAction(sid, i);
        }

        // Provider received 50 * $0.001 = $0.05
        assertEq(usdc.balanceOf(provider), PRICE_PER_ACTION * 50);
        assertEq(settlement.getTotalPaid(sid), PRICE_PER_ACTION * 50);
        assertEq(settlement.getSettledActionCount(sid), 50);
    }

    function test_settleBatch() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.startPrank(consumer);
        for (uint256 i = 0; i < 10; i++) {
            meter.recordAction(sid, Types.ActionType.SUMMARIZE, 1, keccak256(abi.encodePacked("b", i)));
        }
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        // Settle all 10 in one batch
        settlement.settleBatch(sid, 10);

        assertEq(usdc.balanceOf(provider), PRICE_PER_ACTION * 10);
        assertEq(settlement.getSettledActionCount(sid), 10);
    }

    function test_withdrawUnused() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.startPrank(consumer);
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));

        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        // Settle one action
        settlement.settleAction(sid, 0);

        // Finalize session
        vm.prank(consumer);
        meter.finalizeSession(sid);

        // Withdraw unused
        uint256 balBefore = usdc.balanceOf(consumer);
        vm.prank(consumer);
        settlement.withdrawUnused(sid);
        uint256 balAfter = usdc.balanceOf(consumer);

        assertEq(balAfter - balBefore, SESSION_BUDGET - PRICE_PER_ACTION);
    }

    function test_RevertWhen_settleOutOfOrder() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.startPrank(consumer);
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a1"));
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        // Try to settle index 1 before index 0 — should fail
        vm.expectRevert("Must settle sequentially");
        settlement.settleAction(sid, 1);
    }

    function test_RevertWhen_settleInsufficientDeposit() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.startPrank(consumer);
        meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256("a0"));
        // Don't deposit at all
        vm.stopPrank();

        vm.expectRevert("Insufficient deposit");
        settlement.settleAction(sid, 0);
    }

    function test_RevertWhen_withdrawWhileActive() public {
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://test");

        vm.startPrank(consumer);
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);

        // Try to withdraw while session is still ACTIVE — should fail
        vm.expectRevert("Session still active");
        settlement.withdrawUnused(sid);
        vm.stopPrank();
    }

    // ── AgentRegistry tests ─────────────────────────────────────────────

    function test_registerAgent() public {
        vm.prank(provider);
        agentRegistry.registerAgent("Research API Agent", "https://api.example.com", PRICE_PER_ACTION);

        AgentRegistry.Agent memory a = agentRegistry.getAgent(provider);
        assertEq(a.owner, provider);
        assertEq(a.defaultPricePerAction, PRICE_PER_ACTION);
        assertTrue(a.active);
        assertEq(agentRegistry.agentCount(), 1);
    }

    function test_updateAgent() public {
        vm.startPrank(provider);
        agentRegistry.registerAgent("Old Name", "https://old.com", PRICE_PER_ACTION);
        agentRegistry.updateAgent("New Name", "https://new.com", 2000);
        vm.stopPrank();

        AgentRegistry.Agent memory a = agentRegistry.getAgent(provider);
        assertEq(a.defaultPricePerAction, 2000);
    }

    function test_deactivateAgent() public {
        vm.startPrank(provider);
        agentRegistry.registerAgent("Agent", "https://api.com", PRICE_PER_ACTION);
        agentRegistry.deactivateAgent();
        vm.stopPrank();

        AgentRegistry.Agent memory a = agentRegistry.getAgent(provider);
        assertFalse(a.active);
    }

    function test_RevertWhen_registerAgentTwice() public {
        vm.startPrank(provider);
        agentRegistry.registerAgent("Agent", "https://api.com", PRICE_PER_ACTION);
        vm.expectRevert("Already registered");
        agentRegistry.registerAgent("Agent2", "https://api2.com", PRICE_PER_ACTION);
        vm.stopPrank();
    }

    // ── Full E2E: 100 actions ───────────────────────────────────────────

    function test_fullLoop100Actions() public {
        // 1. Register agent
        vm.prank(provider);
        agentRegistry.registerAgent("Research Agent", "https://api.example.com", PRICE_PER_ACTION);

        // 2. Create session
        vm.prank(consumer);
        uint256 sid = meter.createSession(provider, PRICE_PER_ACTION, "meta://demo");

        // 3. Record 100 actions
        vm.startPrank(consumer);
        for (uint256 i = 0; i < 100; i++) {
            meter.recordAction(sid, Types.ActionType.API_LOOKUP, 1, keccak256(abi.encodePacked("action", i)));
        }

        // 4. Deposit budget ($0.20 covers 200 actions, we use 100)
        usdc.approve(address(settlement), SESSION_BUDGET);
        settlement.depositSession(sid, SESSION_BUDGET);
        vm.stopPrank();

        // 5. Settle all 100 actions individually
        for (uint256 i = 0; i < 100; i++) {
            settlement.settleAction(sid, i);
        }

        // 6. Finalize
        vm.prank(consumer);
        meter.finalizeSession(sid);

        // 7. Verify totals
        assertEq(meter.getSessionActionCount(sid), 100);
        (uint256 totalActions, uint256 totalAmount) = meter.getSessionTotals(sid);
        assertEq(totalActions, 100);
        assertEq(totalAmount, PRICE_PER_ACTION * 100); // $0.10

        assertEq(usdc.balanceOf(provider), PRICE_PER_ACTION * 100);
        assertEq(settlement.getTotalPaid(sid), PRICE_PER_ACTION * 100);

        // 8. Consumer withdraws unused ($0.20 - $0.10 = $0.10)
        uint256 balBefore = usdc.balanceOf(consumer);
        vm.prank(consumer);
        settlement.withdrawUnused(sid);
        assertEq(usdc.balanceOf(consumer) - balBefore, SESSION_BUDGET - (PRICE_PER_ACTION * 100));

        // Session completed
        Types.Session memory s = meter.getSession(sid);
        assertEq(uint8(s.status), uint8(Types.SessionStatus.COMPLETED));
    }
}
