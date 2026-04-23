// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../Types.sol";

interface IUsageMeter {
    function getSession(uint256 sessionId) external view returns (Types.Session memory);
    function getSessionAction(uint256 sessionId, uint256 actionIndex) external view returns (Types.ActionRecord memory);
    function getSessionActionCount(uint256 sessionId) external view returns (uint256);
    function getSessionTotals(uint256 sessionId) external view returns (uint256 totalActions, uint256 totalAmount);
}
