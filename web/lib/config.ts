import type { Address } from 'viem'

export type TokenConfig = {
  symbol: string
  address: Address
  decimals: number
}

const fallbackTokens = [
  {
    symbol: 'USDC',
    address: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
    decimals: 6,
  },
] satisfies TokenConfig[]

function parseAddress(value: string | undefined): Address | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : undefined
}

export const factoryAddress = parseAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS)

export const tokens: TokenConfig[] = [
  ...fallbackTokens,
  ...[1, 2, 3]
    .map((index) => {
      const symbol = process.env[`NEXT_PUBLIC_TOKEN_${index}_SYMBOL`]
      const address = parseAddress(process.env[`NEXT_PUBLIC_TOKEN_${index}_ADDRESS`])
      const decimals = Number(process.env[`NEXT_PUBLIC_TOKEN_${index}_DECIMALS`] || 18)
      if (!symbol || !address) return undefined
      return { symbol, address, decimals }
    })
    .filter((token): token is TokenConfig => Boolean(token)),
]

export const monadTestnetRpc = 'https://testnet-rpc.monad.xyz'
