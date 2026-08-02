// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract Pair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_DENOMINATOR = 1_000;
    uint256 public constant FEE_NUMERATOR = 3;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    address public immutable factory;
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    uint112 private reserve0;
    uint112 private reserve1;

    error DeadlineExpired();
    error InsufficientInput();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error InvalidToken();
    error Overflow();

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidity);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Swap(address indexed sender, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address token0_, address token1_) ERC20("Monad Testnet LP", "MTLP") {
        factory = msg.sender;
        token0 = IERC20(token0_);
        token1 = IERC20(token1_);
    }

    function getReserves() external view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    function quoteSwap(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert InsufficientInput();
        (uint256 reserveIn, uint256 reserveOut) = _orderedReserves(tokenIn);
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR);
        amountOut = amountInWithFee * reserveOut / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function addLiquidity(uint256 amount0Desired, uint256 amount1Desired, uint256 minLiquidity, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1, uint256 liquidity)
    {
        _checkDeadline(deadline);
        if (amount0Desired == 0 || amount1Desired == 0) revert InsufficientInput();

        uint256 supply = totalSupply();
        if (supply == 0) {
            amount0 = amount0Desired;
            amount1 = amount1Desired;
        } else {
            uint256 amount1Optimal = amount0Desired * reserve1 / reserve0;
            if (amount1Optimal <= amount1Desired) {
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                amount0 = amount1Desired * reserve0 / reserve1;
                amount1 = amount1Desired;
            }
        }

        uint256 balance0Before = token0.balanceOf(address(this));
        uint256 balance1Before = token1.balanceOf(address(this));
        token0.safeTransferFrom(msg.sender, address(this), amount0);
        token1.safeTransferFrom(msg.sender, address(this), amount1);
        amount0 = token0.balanceOf(address(this)) - balance0Before;
        amount1 = token1.balanceOf(address(this)) - balance1Before;

        if (supply == 0) {
            uint256 root = Math.sqrt(amount0 * amount1);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            liquidity = root - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(amount0 * supply / reserve0, amount1 * supply / reserve1);
        }
        if (liquidity == 0 || liquidity < minLiquidity) revert SlippageExceeded();
        _mint(msg.sender, liquidity);
        _sync();
        emit LiquidityAdded(msg.sender, amount0, amount1, liquidity);
    }

    function removeLiquidity(uint256 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        _checkDeadline(deadline);
        if (liquidity == 0) revert InsufficientInput();
        uint256 supply = totalSupply();
        amount0 = liquidity * reserve0 / supply;
        amount1 = liquidity * reserve1 / supply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();
        if (amount0 < amount0Min || amount1 < amount1Min) revert SlippageExceeded();
        _burn(msg.sender, liquidity);
        token0.safeTransfer(msg.sender, amount0);
        token1.safeTransfer(msg.sender, amount1);
        _sync();
        emit LiquidityRemoved(msg.sender, amount0, amount1, liquidity);
    }

    function swap(address tokenIn, uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        _checkDeadline(deadline);
        amountOut = quoteSwap(tokenIn, amountIn);
        if (amountOut < amountOutMin) revert SlippageExceeded();
        IERC20 input;
        IERC20 output;
        if (tokenIn == address(token0)) {
            input = token0;
            output = token1;
        } else if (tokenIn == address(token1)) {
            input = token1;
            output = token0;
        } else {
            revert InvalidToken();
        }
        input.safeTransferFrom(msg.sender, address(this), amountIn);
        output.safeTransfer(msg.sender, amountOut);
        _sync();
        emit Swap(msg.sender, tokenIn, amountIn, amountOut);
    }

    function _orderedReserves(address tokenIn) private view returns (uint256 reserveIn, uint256 reserveOut) {
        if (tokenIn == address(token0)) return (reserve0, reserve1);
        if (tokenIn == address(token1)) return (reserve1, reserve0);
        revert InvalidToken();
    }

    function _sync() private {
        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
    }

    function _checkDeadline(uint256 deadline) private view {
        if (block.timestamp > deadline) revert DeadlineExpired();
    }
}
