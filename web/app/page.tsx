'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPublicClient, formatUnits, http, parseUnits, zeroAddress, type Address } from 'viem'
import { monadTestnet } from 'wagmi/chains'
import { erc20Abi, factoryAbi, pairAbi } from '../lib/abis'
import { factoryAddress, monadTestnetRpc, tokens, type TokenConfig } from '../lib/config'

const publicClient = createPublicClient({ chain: monadTestnet, transport: http(monadTestnetRpc) })

type TxState = 'idle' | 'pending' | 'confirmed' | 'failed'
type Pool = {
  address: Address
  token0: TokenConfig
  token1: TokenConfig
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  lpBalance: bigint
}

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'
}

function formatAmount(value: bigint, decimals = 18) {
  const formatted = formatUnits(value, decimals)
  const [whole, fraction = ''] = formatted.split('.')
  return `${whole}.${fraction.padEnd(4, '0').slice(0, 4)}`
}

function calcOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n
  const amountInWithFee = amountIn * 997n
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee)
}

function minOutForSlippage(amountOut: bigint, slippageBps: bigint) {
  return (amountOut * (10_000n - slippageBps)) / 10_000n
}

function priceImpactBps(amountIn: bigint, reserveIn: bigint, amountOut: bigint, reserveOut: bigint) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n || amountOut <= 0n) return 0
  const spotScaled = (reserveOut * 1_000_000n) / reserveIn
  const executionScaled = (amountOut * 1_000_000n) / amountIn
  if (executionScaled >= spotScaled) return 0
  return Number(((spotScaled - executionScaled) * 10_000n) / spotScaled) / 100
}

async function getInjectedAccount(): Promise<Address | undefined> {
  const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
  if (!ethereum) return undefined
  const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as Address[]
  await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] }).catch(async () => {
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x279f',
          chainName: 'Monad Testnet',
          nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
          rpcUrls: [monadTestnetRpc],
          blockExplorerUrls: ['https://testnet.monadscan.com'],
        },
      ],
    })
  })
  return accounts[0]
}

async function sendInjectedTransaction(request: { to: Address; data: `0x${string}`; gas: bigint }) {
  const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
  if (!ethereum) throw new Error('No injected wallet found')
  const [from] = (await ethereum.request({ method: 'eth_requestAccounts' })) as Address[]
  return ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: request.to, data: request.data, gas: `0x${request.gas.toString(16)}` }],
  }) as Promise<`0x${string}`>
}

export default function Page() {
  const [account, setAccount] = useState<Address>()
  const [pools, setPools] = useState<Pool[]>([])
  const [tokenIn, setTokenIn] = useState(tokens[0]?.address)
  const [tokenOut, setTokenOut] = useState(tokens[1]?.address || tokens[0]?.address)
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('50')
  const [liquidity0, setLiquidity0] = useState('')
  const [liquidity1, setLiquidity1] = useState('')
  const [removeLp, setRemoveLp] = useState('')
  const [selectedPool, setSelectedPool] = useState<Address>()
  const [txState, setTxState] = useState<TxState>('idle')
  const [message, setMessage] = useState('Load a deployed Factory address to read pools from Monad testnet.')
  const [gasCost, setGasCost] = useState('')

  const tokenByAddress = useMemo(() => new Map(tokens.map((token) => [token.address.toLowerCase(), token])), [])
  const currentPool = pools.find((pool) => pool.address === selectedPool) || pools[0]
  const inToken = tokens.find((token) => token.address === tokenIn)
  const outToken = tokens.find((token) => token.address === tokenOut)

  const quote = useMemo(() => {
    if (!currentPool || !inToken || !outToken || !amountIn) return 0n
    const parsed = parseUnits(amountIn, inToken.decimals)
    if (inToken.address.toLowerCase() === currentPool.token0.address.toLowerCase()) {
      return calcOut(parsed, currentPool.reserve0, currentPool.reserve1)
    }
    return calcOut(parsed, currentPool.reserve1, currentPool.reserve0)
  }, [amountIn, currentPool, inToken, outToken])

  const minReceived = useMemo(() => minOutForSlippage(quote, BigInt(slippage || '0')), [quote, slippage])
  const impact = useMemo(() => {
    if (!currentPool || !inToken || !amountIn) return 0
    const parsed = parseUnits(amountIn, inToken.decimals)
    if (inToken.address.toLowerCase() === currentPool.token0.address.toLowerCase()) {
      return priceImpactBps(parsed, currentPool.reserve0, quote, currentPool.reserve1)
    }
    return priceImpactBps(parsed, currentPool.reserve1, quote, currentPool.reserve0)
  }, [amountIn, currentPool, inToken, quote])

  const loadPools = useCallback(async () => {
    if (!factoryAddress) return
    const count = await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'allPairsLength' })
    const nextPools: Pool[] = []
    for (let i = 0n; i < count; i += 1n) {
      const pair = await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'allPairs', args: [i] })
      const [pairToken0, pairToken1, reserves, totalSupply, lpBalance] = await Promise.all([
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'token0' }),
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'token1' }),
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }),
        publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'totalSupply' }),
        account ? publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'balanceOf', args: [account] }) : Promise.resolve(0n),
      ])
      const known0 = tokenByAddress.get(pairToken0.toLowerCase())
      const known1 = tokenByAddress.get(pairToken1.toLowerCase())
      if (known0 && known1) {
        nextPools.push({ address: pair, token0: known0, token1: known1, reserve0: reserves[0], reserve1: reserves[1], totalSupply, lpBalance })
      }
    }
    setPools(nextPools)
    setSelectedPool((current) => current || nextPools[0]?.address)
    setMessage(nextPools.length ? 'Pools loaded from Factory onchain array.' : 'Factory has no pools for the configured token list.')
  }, [account, tokenByAddress])

  useEffect(() => {
    loadPools().catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load pools'))
  }, [loadPools])

  async function runTx(label: string, to: Address, data: `0x${string}`) {
    if (!account) throw new Error('Connect wallet first')
    const gas = await publicClient.estimateGas({ account, to, data })
    const gasPrice = await publicClient.getGasPrice()
    setGasCost(`${formatUnits(gas * gasPrice, 18)} MON at gas limit ${gas.toString()}`)
    if (!window.confirm(`${label}\n\nEstimated gas cost: ${formatUnits(gas * gasPrice, 18)} MON\nProceed?`)) return
    setTxState('pending')
    try {
      await publicClient.call({ account, to, data })
      const hash = await sendInjectedTransaction({ to, data, gas })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxState('confirmed')
      setMessage(`${label} confirmed.`)
      await loadPools()
    } catch (error) {
      setTxState('failed')
      setMessage(error instanceof Error ? error.message : `${label} failed.`)
    }
  }

  async function approveExact(token: TokenConfig, spender: Address, amount: bigint) {
    const data = erc20Abi.find((item) => item.type === 'function' && item.name === 'approve')
    if (!data) return
    const { encodeFunctionData } = await import('viem')
    await runTx(`Approve exactly ${formatAmount(amount, token.decimals)} ${token.symbol}`, token.address, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }))
  }

  async function swap() {
    if (!currentPool || !inToken || !outToken || !amountIn) return
    const { encodeFunctionData } = await import('viem')
    const amount = parseUnits(amountIn, inToken.decimals)
    await approveExact(inToken, currentPool.address, amount)
    const data = encodeFunctionData({ abi: pairAbi, functionName: 'swap', args: [inToken.address, amount, minReceived, BigInt(Math.floor(Date.now() / 1000) + 600)] })
    await runTx(`Swap ${inToken.symbol} for ${outToken.symbol}`, currentPool.address, data)
  }

  async function addLiquidity() {
    if (!currentPool || !liquidity0 || !liquidity1) return
    const { encodeFunctionData } = await import('viem')
    const amount0 = parseUnits(liquidity0, currentPool.token0.decimals)
    const amount1 = parseUnits(liquidity1, currentPool.token1.decimals)
    await approveExact(currentPool.token0, currentPool.address, amount0)
    await approveExact(currentPool.token1, currentPool.address, amount1)
    const data = encodeFunctionData({ abi: pairAbi, functionName: 'addLiquidity', args: [amount0, amount1, 1n, BigInt(Math.floor(Date.now() / 1000) + 600)] })
    await runTx('Add liquidity', currentPool.address, data)
  }

  async function removeLiquidity() {
    if (!currentPool || !removeLp) return
    const { encodeFunctionData } = await import('viem')
    const amount = parseUnits(removeLp, 18)
    const data = encodeFunctionData({ abi: pairAbi, functionName: 'removeLiquidity', args: [amount, 1n, 1n, BigInt(Math.floor(Date.now() / 1000) + 600)] })
    await runTx('Remove liquidity', currentPool.address, data)
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="pill">Monad testnet only - not audited, not for real funds</p>
          <h1>Direct Pair DEX</h1>
          <p>No router, no multihop, no aggregator. The frontend reads Factory pairs onchain and calls each Pair directly.</p>
        </div>
        <div className="card stack">
          <button onClick={() => getInjectedAccount().then(setAccount)}>Connect Wallet</button>
          <span className="muted">{shortAddress(account)}</span>
          <span className={txState === 'failed' ? 'warn' : txState === 'confirmed' ? 'ok' : 'muted'}>Transaction state: {txState}</span>
        </div>
      </section>

      <section className="grid">
        <div className="card span-12 row">
          <span>{message}</span>
          <span className="muted">Factory: {factoryAddress ? shortAddress(factoryAddress) : 'missing NEXT_PUBLIC_FACTORY_ADDRESS'}</span>
        </div>

        <div className="card span-7 stack">
          <div className="row">
            <h2>Swap</h2>
            <span className="pill">Simulates before send</span>
          </div>
          <select value={selectedPool || ''} onChange={(event) => setSelectedPool(event.target.value as Address)}>
            {pools.map((pool) => (
              <option key={pool.address} value={pool.address}>{pool.token0.symbol}/{pool.token1.symbol} - {shortAddress(pool.address)}</option>
            ))}
          </select>
          <div className="grid">
            <div className="span-5 stack">
              <label>Token in</label>
              <select value={tokenIn || ''} onChange={(event) => setTokenIn(event.target.value as Address)}>
                {tokens.map((token) => <option key={token.address} value={token.address}>{token.symbol}</option>)}
              </select>
            </div>
            <div className="span-5 stack">
              <label>Token out</label>
              <select value={tokenOut || ''} onChange={(event) => setTokenOut(event.target.value as Address)}>
                {tokens.map((token) => <option key={token.address} value={token.address}>{token.symbol}</option>)}
              </select>
            </div>
            <div className="span-7 stack">
              <label>Amount in</label>
              <input value={amountIn} onChange={(event) => setAmountIn(event.target.value)} placeholder="0.0" inputMode="decimal" />
            </div>
            <div className="span-5 stack">
              <label>Slippage bps</label>
              <input value={slippage} onChange={(event) => setSlippage(event.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="grid">
            <div className="kpi span-4"><span className="muted">Quote</span><strong>{outToken ? formatAmount(quote, outToken.decimals) : '0'} {outToken?.symbol}</strong></div>
            <div className="kpi span-4"><span className="muted">Minimum received</span><strong>{outToken ? formatAmount(minReceived, outToken.decimals) : '0'} {outToken?.symbol}</strong></div>
            <div className="kpi span-4"><span className="muted">Price impact</span><strong>{impact.toFixed(2)}%</strong></div>
          </div>
          <button disabled={!account || !currentPool || !quote} onClick={swap}>Confirm Swap</button>
          {gasCost && <p className="muted">Last gas estimate: {gasCost}</p>}
        </div>

        <div className="card span-5 stack">
          <h2>Pools</h2>
          {pools.length === 0 && <p className="muted">No configured pools found. Create pairs after Factory deployment, then refresh.</p>}
          {pools.map((pool) => {
            const share = pool.totalSupply ? Number((pool.lpBalance * 10_000n) / pool.totalSupply) / 100 : 0
            return (
              <div className="kpi" key={pool.address}>
                <div className="row"><strong>{pool.token0.symbol}/{pool.token1.symbol}</strong><span>{shortAddress(pool.address)}</span></div>
                <p className="muted">Reserves: {formatAmount(pool.reserve0, pool.token0.decimals)} / {formatAmount(pool.reserve1, pool.token1.decimals)}</p>
                <div className="progress"><div style={{ width: `${Math.min(share, 100)}%` }} /></div>
                <p className="muted">Your LP share: {share.toFixed(2)}%</p>
              </div>
            )
          })}
        </div>

        <div className="card span-6 stack">
          <h2>Add Liquidity</h2>
          <label>{currentPool?.token0.symbol || 'Token 0'} amount</label>
          <input value={liquidity0} onChange={(event) => setLiquidity0(event.target.value)} placeholder="0.0" inputMode="decimal" />
          <label>{currentPool?.token1.symbol || 'Token 1'} amount</label>
          <input value={liquidity1} onChange={(event) => setLiquidity1(event.target.value)} placeholder="0.0" inputMode="decimal" />
          <button disabled={!account || !currentPool} onClick={addLiquidity}>Confirm Add Liquidity</button>
        </div>

        <div className="card span-6 stack">
          <h2>Remove Liquidity</h2>
          <label>LP token amount</label>
          <input value={removeLp} onChange={(event) => setRemoveLp(event.target.value)} placeholder="0.0" inputMode="decimal" />
          <button disabled={!account || !currentPool} onClick={removeLiquidity}>Confirm Remove Liquidity</button>
          <p className="muted">Every approval, swap, add, and remove action asks for explicit browser confirmation.</p>
        </div>
      </section>
    </main>
  )
}
