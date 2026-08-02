# Monad Testnet Direct DEX Runbook

This project is demo-only and targets Monad testnet.

## 1. Install prerequisites

Run:

```bash
npm install -g @alchemy/cli@latest @getpara/cli
alchemy auth
para login
```

## 2. Build the contracts

```bash
cd contracts
forge test -vvv
forge build
```

## 3. Deploy and verify

Use the authenticated Alchemy wallet session to deploy `Factory` first, then create one `Pair` per token pair through `Factory.createPair`.

After deployment, verify both contracts with the Monad testnet verification API.

## 4. Prepare frontend env

Copy `web/.env.example` to `web/.env.local` and fill:

```bash
NEXT_PUBLIC_PARA_API_KEY=<public para key>
NEXT_PUBLIC_FACTORY_ADDRESS=<deployed factory address>
NEXT_PUBLIC_TOKEN_1_SYMBOL=<verified token symbol>
NEXT_PUBLIC_TOKEN_1_ADDRESS=<verified token address>
NEXT_PUBLIC_TOKEN_1_DECIMALS=<token decimals>
```

Add more `NEXT_PUBLIC_TOKEN_N_*` values only for verified Monad testnet ERC20s.

## 5. Start the frontend

```bash
cd web
npm run dev
```

## 6. Demo flow

1. Connect a wallet.
2. Pick a pool from the Factory-backed list.
3. Enter an amount and review quote, price impact, and minimum received.
4. Confirm exact-token approval only if needed.
5. Simulate and confirm the swap, add-liquidity, or remove-liquidity action.

## 7. Safety checks

- Testnet only.
- No router.
- No multi-hop.
- No analytics.
- No indexer.
- No real funds.
