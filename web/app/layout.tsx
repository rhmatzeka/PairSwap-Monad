import './styles.css'
import Providers from './providers'

export const metadata = {
  title: 'Monad Testnet Direct DEX',
  description: 'Minimal direct-pair constant-product DEX for Monad testnet demos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
