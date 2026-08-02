// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {MockToken} from "./MockToken.sol";

contract DexTest is Test {
    Factory factory;
    Pair pair;
    MockToken token0;
    MockToken token1;

    function setUp() public {
        factory = new Factory();
        MockToken a = new MockToken("Token A", "TKA");
        MockToken b = new MockToken("Token B", "TKB");
        pair = Pair(factory.createPair(address(a), address(b)));
        token0 = MockToken(address(pair.token0()));
        token1 = MockToken(address(pair.token1()));
        token0.approve(address(pair), type(uint256).max);
        token1.approve(address(pair), type(uint256).max);
    }

    function testZeroLiquidityPoolRejectsSwap() public {
        vm.expectRevert(Pair.InsufficientLiquidity.selector);
        pair.swap(address(token0), 1 ether, 0, block.timestamp);
    }

    function testSlippageFailure() public {
        _seed();
        uint256 quote = pair.quoteSwap(address(token0), 1 ether);
        vm.expectRevert(Pair.SlippageExceeded.selector);
        pair.swap(address(token0), 1 ether, quote + 1, block.timestamp);
    }

    function testBadTokenAddresses() public {
        vm.expectRevert(Factory.InvalidToken.selector);
        factory.createPair(address(0xBEEF), address(token0));
    }

    function testDuplicatePairSubmission() public {
        vm.expectRevert(Factory.PairExists.selector);
        factory.createPair(address(token1), address(token0));
    }

    function testDuplicateSwapSubmissionCannotReuseExactApproval() public {
        _seed();
        token0.approve(address(pair), 1 ether);
        pair.swap(address(token0), 1 ether, 0, block.timestamp);
        vm.expectRevert();
        pair.swap(address(token0), 1 ether, 0, block.timestamp);
    }

    function testAddSwapAndRemoveLiquidity() public {
        (,, uint256 liquidity) = pair.addLiquidity(100 ether, 100 ether, 1, block.timestamp);
        uint256 quote = pair.quoteSwap(address(token0), 1 ether);
        uint256 out = pair.swap(address(token0), 1 ether, quote, block.timestamp);
        assertEq(out, quote);
        pair.removeLiquidity(liquidity, 1, 1, block.timestamp);
    }

    function _seed() private {
        pair.addLiquidity(100 ether, 100 ether, 1, block.timestamp);
    }
}
