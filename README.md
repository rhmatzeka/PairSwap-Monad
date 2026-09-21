# PairSwap: a Simple DEX on Monad Testnet

A minimal decentralized exchange (DEX) on the **Monad testnet**. You can swap one token for another and add or remove liquidity, directly against a token pair's pool. There's no router and no multi-hop swaps, which keeps it simple enough to read in one sitting.

> Demo only. It runs on testnet and hasn't been audited.

## How it works

- **`Factory`** creates one **`Pair`** contract for each pair of tokens (`createPair`) and keeps a list of them.
- Each **`Pair`** is a small automated market maker (AMM):
  - It holds reserves of both tokens and quotes prices from them (`quoteSwap`). Each swap pays a **0.3% fee** to liquidity providers.
  - Liquidity providers deposit both tokens (`addLiquidity`) and get **LP tokens** (ERC-20) they can later redeem (`removeLiquidity`).
  - Traders `swap` with a **deadline** and a **minimum amount out**, so a slow or front-run transaction fails instead of giving a bad price.
  - It's protected with **ReentrancyGuard**.

## Using the app

1. Connect a wallet (through [Para](https://getpara.com)).
2. Pick a pool from the list the Factory provides.
3. Enter an amount and review the quote, **price impact**, and **minimum received**.
4. Approve the token (only when needed, and only the exact amount).
5. Confirm the swap, or add or remove liquidity.

## Tech stack

- **Contracts**: Solidity, Foundry
- **Web app**: Next.js, TypeScript, wagmi, viem, Para wallet SDK

## Getting started

### Contracts

You need [Foundry](https://book.getfoundry.sh/).

```bash
cd contracts
forge test -vvv   # run the tests
forge build
```

Deploy `Factory` first (see `script/DeployFactory.s.sol`), then call `Factory.createPair` once for each token pair. The full deploy steps, using the Alchemy and Para CLIs, are in [DEPLOY_AND_RUN.md](DEPLOY_AND_RUN.md).

### Web app

1. Copy `web/.env.example` to `web/.env.local` and fill it in:

   ```env
   NEXT_PUBLIC_PARA_API_KEY=your_public_para_key
   NEXT_PUBLIC_FACTORY_ADDRESS=deployed_factory_address
   NEXT_PUBLIC_TOKEN_1_SYMBOL=TOKEN
   NEXT_PUBLIC_TOKEN_1_ADDRESS=token_address
   NEXT_PUBLIC_TOKEN_1_DECIMALS=18
   ```

   Add `NEXT_PUBLIC_TOKEN_2_*`, `NEXT_PUBLIC_TOKEN_3_*`, and so on for more tokens. Only use verified Monad testnet ERC-20s.

2. Start it:

   ```bash
   cd web
   npm install
   npm run dev
   ```

## Project structure

| Path | What it is |
| --- | --- |
| `contracts/src/Factory.sol` | Creates and lists pairs |
| `contracts/src/Pair.sol` | The pool: quotes, swaps, and liquidity |
| `contracts/test/` | Foundry tests and a mock token |
| `web/app/page.tsx` | The swap and liquidity page (quotes, slippage, price impact) |
| `DEPLOY_AND_RUN.md` | Step-by-step deploy and demo guide |
