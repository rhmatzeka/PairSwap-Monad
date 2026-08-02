// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Pair} from "./Pair.sol";

contract Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    error IdenticalTokens();
    error InvalidToken();
    error PairExists();

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalTokens();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0) || token0.code.length == 0 || token1.code.length == 0) revert InvalidToken();
        if (getPair[token0][token1] != address(0)) revert PairExists();
        pair = address(new Pair(token0, token1));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
