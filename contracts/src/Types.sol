// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Types {
    enum SessionStatus {
        NONE,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum ActionType {
        API_LOOKUP,
        JSON_TRANSFORM,
        SUMMARIZE,
        CLASSIFY,
        FINAL_ANSWER
    }

    struct Session {
        uint256 id;
        address consumer;
        address provider;
        uint256 pricePerAction;   // USDC amount per 1 unit (6 decimals)
        uint256 totalActions;
        uint256 totalAmount;      // accumulated spend in token units
        uint256 createdAt;
        SessionStatus status;
        string metadataURI;
    }

    struct ActionRecord {
        uint256 sessionId;
        ActionType actionType;
        uint256 units;
        uint256 cost;             // pricePerAction * units
        bytes32 actionHash;
        uint256 timestamp;
    }
}
