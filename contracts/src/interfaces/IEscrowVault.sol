// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INanoSettlement {
    function depositSession(uint256 sessionId, uint256 amount) external;
    function settleAction(uint256 sessionId, uint256 actionIndex) external;
    function settleBatch(uint256 sessionId, uint256 count) external;
    function withdrawUnused(uint256 sessionId) external;
    function getDeposit(uint256 sessionId) external view returns (uint256 deposited, uint256 spent, uint256 remaining);
    function getTotalPaid(uint256 sessionId) external view returns (uint256);
}
