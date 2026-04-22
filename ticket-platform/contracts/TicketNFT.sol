// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Placeholder TicketNFT — implemented in Step 2
/// @notice The full ERC-721 ticket contract with price cap and lockDate
///         enforcement will be written in Step 2. This file exists so the
///         Hardhat toolchain has something to compile during Step 1.
contract TicketNFT {
    string public constant VERSION = "0.0.1-placeholder";

    function ping() external pure returns (string memory) {
        return "pong";
    }
}
