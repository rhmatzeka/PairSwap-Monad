'use client'

import '@getpara/react-sdk/styles.css'
import { Environment, ParaProvider } from '@getpara/react-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'wagmi'
import { monadTestnet } from 'wagmi/chains'
import type { ReactNode } from 'react'

const queryClient = new QueryClient()

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          apiKey: process.env.NEXT_PUBLIC_PARA_API_KEY || 'missing-para-public-key',
          env: Environment.BETA,
        }}
        config={{ appName: 'Monad Testnet Direct DEX' }}
        paraModalConfig={{
          oAuthMethods: ['GOOGLE', 'APPLE', 'DISCORD', 'TWITTER'],
          disablePhoneLogin: false,
          recoverySecretStepEnabled: true,
        }}
        externalWalletConfig={{
          evmConnector: {
            config: {
              chains: [monadTestnet],
              transports: {
                [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
              },
            },
          },
          wallets: ['METAMASK', 'COINBASE', 'WALLETCONNECT', 'RAINBOW', 'ZERION', 'RABBY'],
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  )
}
