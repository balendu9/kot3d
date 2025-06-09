// pages/index.tsx
import dynamic from 'next/dynamic'

const World = dynamic(() => import('@/components/World'), { ssr: false })

export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <World />
    </div>
  )
}
