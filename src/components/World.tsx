import { Canvas, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  useGLTF,
  Sky,
  Html,
  Environment,
  ContactShadows
} from '@react-three/drei'
import { Suspense, useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils'

const Modal = ({
  tileId, onClose, onBuy
}: {
  tileId: number
  onClose: ()=> void
  onBuy: (id:number) => void
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose} // Close on outside click
    >
      <div
        style={{
          background: 'red',
          padding: '20px 30px',
          borderRadius: 10,
          minWidth: 280,
          textAlign: 'center',
          boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()} // Prevent closing on inner click
      >
        <h2>Tile #{tileId}</h2>
        <button
          onClick={() => onBuy(tileId)}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            fontSize: 16,
            borderRadius: 6,
            cursor: 'pointer',
            marginTop: 10
          }}
        >
          Buy Now
        </button>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'transparent',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer'
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  )
}
const Asset = ({ modelPath, position, scale = 1 }: any) => {
  const { scene } = useGLTF(modelPath)
  const model = useMemo(() => clone(scene), [scene])

  model.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true

      if (!child.material.isMeshStandardMaterial) {
        child.material = new THREE.MeshStandardMaterial({
          map: child.material.map || null,
          color: child.material.color || new THREE.Color('white'),
          roughness: 0.7,
          metalness: 0,
          flatShading: false
        })
      }
    }
  })

  return <primitive object={model} position={position} scale={scale} />
}

const TILE_GRID_SIZE = 5
const TILE_SIZE = 2

// Area covered by tile grid (square around center)
const TILE_GRID_BOUND = (TILE_GRID_SIZE / 2) * TILE_SIZE + 1 // +1 for buffer

// Randomly generate assets positions without collision in a square area excluding tile grid zone
function generateAssetsPositions(
  count: number,
  radius: number,
  excludedZone: number,
  existingPositions: { pos: THREE.Vector3; radius: number }[] = []
) {
  const positions: { pos: THREE.Vector3; radius: number }[] = []
  let tries = 0
  const maxTries = count * 20

  while (positions.length < count && tries < maxTries) {
    tries++

    // Random x,z around center (square area)
    const x = (Math.random() - 0.5) * radius * 2
    const z = (Math.random() - 0.5) * radius * 2

    // Skip if inside tile grid zone + buffer
    if (Math.abs(x) < excludedZone && Math.abs(z) < excludedZone) continue

    const newPos = new THREE.Vector3(x, 0, z)
    const newRadius = 2 // radius for collision around asset (adjust if needed)

    // Check collision with already placed assets + existingPositions
    const collision = [...positions, ...existingPositions].some(({ pos, radius }) =>
      pos.distanceTo(newPos) < radius + newRadius
    )
    if (collision) continue

    positions.push({ pos: newPos, radius: newRadius })
  }
  return positions
}

const Tile = ({
  position,
  tileId,
  onClick,
  purchased
}: {
  position: [number, number, number]
  tileId: number
  onClick: (id: number) => void
  purchased: boolean
}) => {
  const [hovered, setHovered] = useState(false)
  const color = purchased ? '#7f7f7f' : hovered ? '#32cd32': '#7cfc00'
  return (
    <mesh
      position={position}
      receiveShadow
      castShadow
      onClick={() => onClick(tileId)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1.8, 0.2, 1.8]} />
      <meshStandardMaterial color={color} />
      <Html center distanceFactor={10} position={[0, 0.6, 0]}>
        <div
          style={{
            fontSize: '14px',
            color: '#000',
            background: 'rgba(255 255 255 / 0.85)',
            padding: '1px 6px',
            borderRadius: '5px',
            pointerEvents: 'none',
            fontWeight: 'bold',
            userSelect: 'none'
          }}
        >
          {tileId}
        </div>
      </Html>
    </mesh>
  )
}

const TileGrid = ({
  onTileClick,
  purchasedTiles = []
}: {
  onTileClick: (id: number) => void
  purchasedTiles?: number[]
}) => {
  const tiles = []
  let id = 1

  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const x = i * TILE_SIZE
      const z = j * TILE_SIZE
      tiles.push(
        <Tile
          key={id}
          position={[x, 0.1, z]}
          tileId={id}
          onClick={onTileClick}
          purchased={purchasedTiles.includes(id)}
        />
      )
      id++
    }
  }

  return <group>{tiles}</group>
}

const World = () => {
  const [selectedTile, setSelectedTile] = useState<number | null>(null)
  const [purchasedTiles, setPurchasedTiles] = useState<number[]>([])

  const [assetPositions, setAssetPositions] = useState<
    { pos: THREE.Vector3; radius: number; model: string; scale: number }[]
  >([])

  // Asset types info
  const assetTypes = [
    { model: '/models/tree_oak.glb', scaleRange: [3.5, 5] },
    { model: '/models/tree_cone.glb', scaleRange: [4, 6] },
    { model: '/models/tree_thin.glb', scaleRange: [2, 3] },
    { model: '/models/tree_palmDetailedTall.glb', scaleRange: [4, 6]},
    { model: '/models/tent_detailedOpen.glb', scaleRange: [4, 6]},
    { model: '/models/tent_detailedClosed.glb', scaleRange: [4, 6]},
    { model: '/models/tent_smallClosed.glb', scaleRange: [4, 6]},
    { model: '/models/tent_detailedOpen.glb', scaleRange: [4, 6]},
    { model: '/models/tree_oak.glb', scaleRange: [3.5, 5] },
    { model: '/models/tree_cone.glb', scaleRange: [4, 6] },
    { model: '/models/tree_thin.glb', scaleRange: [2, 3] },
    { model: '/models/tree_palmDetailedTall.glb', scaleRange: [4, 6]},

    { model: '/models/tree_blocks_fall.glb', scaleRange: [4, 6]},
    { model: '/models/tree_cone_fall.glb', scaleRange: [4, 6]},
    { model: '/models/tree_default.glb', scaleRange: [4, 6]},
    { model: '/models/tree_detailed.glb', scaleRange: [4, 6]},
    { model: '/models/tree_fat.glb', scaleRange: [4, 6]},
    { model: '/models/tree_palm.glb', scaleRange: [4, 6]},
    { model: '/models/tree_palmBend.glb', scaleRange: [4, 6]},
    { model: '/models/tree_palmTall.glb', scaleRange: [4, 6]},
    { model: '/models/tree_pineDefaultA.glb', scaleRange: [4, 6]},
    { model: '/models/tree_pineGroundA.glb', scaleRange: [4, 6]},
    { model: '/models/tree_pineRoundB.glb', scaleRange: [4, 6]},
    { model: '/models/tree_pineTallA.glb', scaleRange: [4, 6]},
    { model: '/models/tree_plateau.glb', scaleRange: [4, 6]},
    { model: '/models/tree_tall.glb', scaleRange: [4, 6]},
    { model: '/models/tree_pineTallD.glb', scaleRange: [4, 6]}
  ]

  // On mount, generate random assets positions collision-free
  useEffect(() => {
    const generatedAssets: {
      pos: THREE.Vector3
      radius: number
      model: string
      scale: number
    }[] = []

    const totalAssets = 100
    const worldRadius = 50 // larger environment area
    const excludedZone = TILE_GRID_BOUND

    for (let i = 0; i < totalAssets; i++) {
      // Randomly pick asset type
      const assetType =
        assetTypes[Math.floor(Math.random() * assetTypes.length)]

      // Generate position collision free with previous assets
      let tries = 0
      let pos: THREE.Vector3 | null = null
      const assetRadius = 1

      while (tries < 30) {
        tries++
        const x = (Math.random() - 0.5) * worldRadius * 2
        const z = (Math.random() - 0.5) * worldRadius * 2

        if (Math.abs(x) < excludedZone && Math.abs(z) < excludedZone) continue

        const newPos = new THREE.Vector3(x, 0, z)

        // Check collision with existing assets
        const collision = generatedAssets.some(({ pos: p, radius }) =>
          p.distanceTo(newPos) < radius + assetRadius
        )
        if (!collision) {
          pos = newPos
          break
        }
      }

      if (pos) {
        // Random scale inside range
        const scale =
          assetType.scaleRange[0] +
          Math.random() * (assetType.scaleRange[1] - assetType.scaleRange[0])

        generatedAssets.push({
          pos,
          radius: assetRadius,
          model: assetType.model,
          scale
        })
      }
    }
    setAssetPositions(generatedAssets)
  }, [])

  const handleTileClick = (id: number) => {
    setSelectedTile(id)
  }

  const handleBuy = (id: number) => {
    if (!purchasedTiles.includes(id)) {
      setPurchasedTiles((prev) => [...prev, id])
    }
    setSelectedTile(null)
  }

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [16, 12, 16], fov: 50 }}
        gl={{ antialias: true }}
        style={{ background: '#87ceeb' }}
      >
        <fog attach="fog" args={['#87ceeb', 30, 90]} />

        <ambientLight intensity={0.6} />
        <directionalLight
          position={[20, 30, 10]}
          castShadow
          intensity={1.6}
          shadow-mapSize-width={4096}
          shadow-mapSize-height={4096}
          shadow-bias={-0.0001}
        />

        <Sky sunPosition={[100, 20, 100]} turbidity={7} rayleigh={1} />
        <Environment preset="forest" />

        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        >
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#a2d149" roughness={1} metalness={0} />
        </mesh>

        <Suspense fallback={null}>
          <TileGrid onTileClick={handleTileClick} 
           purchasedTiles={purchasedTiles}
          />

          {/* Render assets dynamically */}
          {assetPositions.map(({ pos, model, scale }, i) => (
            <Asset
              key={i}
              modelPath={model}
              position={[pos.x, pos.y, pos.z]}
              scale={scale}
            />
          ))}
        </Suspense>

        <ContactShadows
          position={[0, 0.1, 0]}
          opacity={0.5}
          scale={30}
          blur={2}
          far={20}
        />

        <OrbitControls 
            maxPolarAngle = {Math.PI / 2}
            minPolarAngle = {Math.PI / 6}            
            minDistance = {5}
            maxDistance = {50}
            enablePan = {true}
        />
      </Canvas>

      {selectedTile !== null && (
        <Modal
          tileId={selectedTile}
          onClose={() => setSelectedTile(null)}
          onBuy={handleBuy}
        />
      )}
    </>
  )
}

export default World

// You can reuse the Modal component from previous code snippet
