import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode, RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Line, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  DoubleSide,
  MathUtils,
  Mesh,
  Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { MissionEventType, MissionState } from './missionSimulation'
import { getCurrentMissionEvent } from './missionSimulation'
import { getAffectedSubsystem, type MissionSubsystem } from './missionSubsystems'
import { MissionOrbitalVisualization, SpacecraftSchematic } from './MissionVisuals'
import type { Lunar3DExperienceProps, Lunar3DPart } from './lunar3dTypes'

type ViewMode = 'orbit' | 'spacecraft'

// BASE_URL keeps this working when the game is served from a sub-folder, such as GitHub Pages.
const MOON_MODEL_URL = `${import.meta.env.BASE_URL}models/moon_small.glb`
const MOON_RADIUS = 1.5
const EARTH_POSITION = new Vector3(4, 0.08, -3.8)
const STAR_POSITIONS: readonly [number, number, number, number, string][] = [
  [-15, 8, -16, 0.045, '#d8e2eb'], [-13.4, 9.2, -15.1, 0.026, '#aebfce'],
  [-12.1, 7.7, -17.5, 0.035, '#f0e5c7'], [-10.2, 8.7, -14.9, 0.022, '#ced9e4'],
  [-8.7, 7.1, -18.2, 0.05, '#e8eef3'], [-6.9, 9.8, -16.3, 0.025, '#c7d7e1'],
  [-15.3, 3.1, -13.7, 0.024, '#c5d0dc'], [-13.1, 4.6, -18.4, 0.034, '#e6ddc8'],
  [-11.2, 2.8, -15.8, 0.022, '#b8ccdc'], [-8.6, 4.1, -14.1, 0.03, '#d8e2eb'],
  [-5.2, 8.3, -18.4, 0.021, '#bdcddd'], [-3.6, 10.1, -15.7, 0.038, '#e3e9ee'],
  [-1.4, 8.2, -17.2, 0.024, '#d8c9a8'], [1.8, 9.4, -15.4, 0.027, '#cad8e5'],
  [4.1, 8.1, -18.7, 0.044, '#f0e6d0'], [6.8, 9.2, -16.3, 0.026, '#c7d7e1'],
  [9.5, 7.4, -17.8, 0.031, '#dbe4ec'], [12.4, 8.8, -15.2, 0.023, '#b7c8d6'],
  [14.2, 5.2, -18.1, 0.046, '#e9e4d7'], [11.8, 3.4, -14.5, 0.025, '#d3e1e9'],
  [8.2, 4.7, -19.3, 0.021, '#b7cad9'], [5.4, 2.6, -16.1, 0.034, '#dfebf3'],
  [2.4, 4.2, -18.2, 0.023, '#d7c6a4'], [-1.7, 3.6, -15.3, 0.04, '#e4ebf2'],
  [-4.6, 2.1, -18.8, 0.025, '#c2d5e0'], [-7.8, 0.2, -16.1, 0.032, '#d7e2eb'],
  [-11.4, -1.6, -18.7, 0.023, '#bfd0df'], [-14.1, -3.4, -15.4, 0.036, '#e7e2d4'],
  [-10.6, -5.2, -14.7, 0.025, '#c6d6e1'], [-6.7, -3.8, -18.4, 0.047, '#e3ebf2'],
  [-2.9, -5.4, -16.2, 0.022, '#c3d1dc'], [1.3, -3.1, -19.1, 0.035, '#ddd1b8'],
  [5.4, -4.7, -15.7, 0.023, '#c1d5e3'], [9.7, -2.6, -18.5, 0.043, '#ecf0f3'],
  [13.5, -4.1, -16.4, 0.026, '#c7d5e1'], [15.1, -7.3, -19.2, 0.034, '#e3e7e8'],
  [10.8, -8.7, -15.1, 0.021, '#b4c6d5'], [6.2, -7.6, -18.4, 0.031, '#dce4ec'],
  [2.1, -9.1, -16.8, 0.024, '#d4c7a9'], [-2.5, -8.3, -19.3, 0.039, '#e2e8ee'],
  [-7.1, -9.2, -16.6, 0.023, '#b8ccdc'], [-12.3, -8.2, -18.1, 0.034, '#e8e4d8'],
  [-12.4, -7.8, -14.2, 0.035, '#d7e3ed'], [-9.6, -5.8, -17.1, 0.026, '#c3d3df'],
  [-14.8, -7.1, -19.5, 0.043, '#eee6d4'], [-6.4, -8.6, -18.4, 0.024, '#c0d0dc'],
  [-11.3, -11.2, -18.3, 0.032, '#d4e0e9'], [-8.1, -9.1, -13.6, 0.022, '#b8ccdc'],
  [-15.5, -4.9, -16.4, 0.04, '#ebe8de'], [-5.2, -3.2, -20.7, 0.025, '#c7d7e1'],
  [-10.2, -2.1, -14.4, 0.031, '#d7c8aa'], [-17.2, -9.7, -20.5, 0.022, '#c5d5e0'],
  [-3.6, -7.2, -15.1, 0.038, '#e1eaf0'], [-13.9, -12.4, -17.6, 0.026, '#c1d0dd'],
  [-6.1, -11.7, -22.4, 0.035, '#e7e2d5'], [-9.3, -6.5, -23.1, 0.023, '#b9cddd'],
  [-12.6, -4.2, -12.7, 0.03, '#d8e2eb'], [-4.3, -10.1, -19.8, 0.044, '#ede7d7'],
  [-1.4, -4.3, -20.2, 0.025, '#c4d5e0'], [-2.7, -1.2, -22.1, 0.035, '#dfe9f0'],
  [2.4, -5.1, -19.2, 0.023, '#bfd0df'], [4.8, -4.7, -22.5, 0.041, '#e8e3d6'],
  [0.4, -8.5, -20.4, 0.028, '#d5e0e9'], [5.1, -7.3, -18.2, 0.022, '#c1d1dc'],
  [3.7, -1.8, -18.9, 0.034, '#e0e8ed'], [-0.2, -10.1, -16.2, 0.024, '#c8d6e0'],
  [7.2, -5.9, -21.2, 0.038, '#f0e7d4'], [6.8, -9.2, -16.7, 0.026, '#c6d6e2'],
]

function createFoilTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the spacecraft foil material texture.')

  const gradient = context.createLinearGradient(0, 0, 512, 512)
  gradient.addColorStop(0, '#d5b879')
  gradient.addColorStop(0.48, '#ab884b')
  gradient.addColorStop(1, '#d3b06b')
  context.fillStyle = gradient
  context.fillRect(0, 0, 512, 512)

  for (let index = 0; index < 150; index += 1) {
    const x = (index * 137 + 19) % 512
    const y = (index * 293 + 47) % 512
    const length = 10 + ((index * 17) % 52)
    context.beginPath()
    context.moveTo(x, y)
    context.quadraticCurveTo(x + length * 0.42, y - 3 + (index % 7), x + length, y + 1 - (index % 5))
    context.strokeStyle = index % 3 === 0 ? 'rgba(255,239,190,0.13)' : 'rgba(75,54,27,0.08)'
    context.lineWidth = index % 9 === 0 ? 1.4 : 0.65
    context.stroke()
  }
  for (let index = 0; index < 380; index += 1) {
    const x = (index * 193 + 23) % 512
    const y = (index * 311 + 71) % 512
    context.fillStyle = index % 2 === 0 ? 'rgba(255,246,213,0.12)' : 'rgba(62,46,24,0.09)'
    context.fillRect(x, y, 1 + (index % 2), 1)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

type SubsystemInteractions = {
  onClick: (event: { stopPropagation: () => void }) => void
  onPointerOver: () => void
  onPointerOut: () => void
}

class WebGLErrorBoundary extends Component<{
  children: ReactNode
  onError: (error: Error) => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function supportsWebGL() {
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(query.matches)
    query.addEventListener('change', updatePreference)
    return () => query.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}

function selectPartForSubsystem(parts: Lunar3DPart[], subsystem: MissionSubsystem) {
  return parts.find((part) => part.subsystem === subsystem)
}

function getShipTarget(
  state: MissionState | null | undefined,
  eventType: MissionEventType | null,
  elapsedSeconds: number,
  reducedMotion: boolean,
) {
  if (!state) {
    const angle = reducedMotion ? 0.7 : elapsedSeconds * 0.13
    return new Vector3(Math.cos(angle) * 3.48, 0.1, Math.sin(angle) * 3.48)
  }

  if (eventType === 'eclipse') return new Vector3(-2.45, 0.04, 2.45)
  if (eventType === 'communications') return new Vector3(-2.1, 0.08, 2.75)
  if (eventType === 'science') return new Vector3(0.35, 0.08, 3.45)
  if (eventType === 'insertion') return new Vector3(-2.9, 0.1, -0.55)

  if (!state.telemetry.orbitAchieved) {
    const progress = MathUtils.clamp(elapsedSeconds / 38, 0, 1)
    return new Vector3(-4.05 + progress * 1.2, 0.08 + progress * 0.16, -0.9 + progress * 0.4)
  }

  const angle = reducedMotion ? 0.6 : -0.55 + elapsedSeconds * 0.045
  return new Vector3(Math.cos(angle) * 3.48, 0.1, Math.sin(angle) * 3.48)
}

function LunarAsset({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF(MOON_MODEL_URL)
  const moon = useMemo(() => {
    const clone = scene.clone(true)
    const bounds = new Box3().setFromObject(clone)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const diameter = Math.max(size.x, size.y, size.z)
    clone.position.sub(center)
    clone.scale.setScalar(3 / diameter)
    clone.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (material && 'envMapIntensity' in material) material.envMapIntensity = 0
        })
      }
    })
    return clone
  }, [scene])

  useEffect(() => onLoaded(), [onLoaded])

  return (
    <>
      {/* The source atlas places its south-polar face on model -Z; this view rotation brings it toward the camera. */}
      <group rotation={[Math.PI, 0, 0]}>
        <group rotation={[0, 0, Math.PI * 1.5]}>
          <primitive object={moon} dispose={null} />
          <group position={[0, 0, -MOON_RADIUS - 0.018]}>
            <mesh rotation={[0, Math.PI, 0]}>
              <torusGeometry args={[0.105, 0.018, 8, 28]} />
              <meshBasicMaterial color="#c3f56a" />
            </mesh>
            <mesh position={[0, 0, -0.04]}>
              <sphereGeometry args={[0.035, 12, 12]} />
              <meshBasicMaterial color="#f0ffd0" />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}

function NaturalStarfield() {
  return (
    <group>
      {STAR_POSITIONS.map(([x, y, z, size, color], index) => (
        <mesh key={index} position={[x, y, z]}>
          <sphereGeometry args={[size, 7, 5]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function SolarPanelSegment({
  side,
  segment,
  active,
  eclipsed,
}: {
  side: -1 | 1
  segment: number
  active: boolean
  eclipsed: boolean
}) {
  const columns = 5
  const rows = 7
  const cellWidth = 0.166
  const cellDepth = 0.168
  const columnPitch = 0.195
  const rowPitch = 0.194
  const centerX = side * (1.17 + segment * 1.04)
  const cellColor = eclipsed ? '#17242b' : active ? '#3d7480' : '#20465e'

  return (
    <group position={[centerX, 0.13, 0]}>
      <RoundedBox args={[1.02, 0.052, 1.48]} radius={0.025} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#202b31" metalness={0.72} roughness={0.36} />
      </RoundedBox>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = (column - (columns - 1) / 2) * columnPitch
        const z = (row - (rows - 1) / 2) * rowPitch
        return (
          <RoundedBox
            key={`cell-${index}`}
            position={[x, 0.034, z]}
            args={[cellWidth, 0.018, cellDepth]}
            radius={0.009}
            smoothness={2}
          >
            <meshStandardMaterial
              color={index % 4 === 0 && !eclipsed ? '#285770' : cellColor}
              emissive={active && !eclipsed ? '#19382e' : '#000000'}
              emissiveIntensity={active && !eclipsed ? 0.27 : 0}
              metalness={0.55}
              roughness={0.28}
            />
          </RoundedBox>
        )
      })}
      {[-1, 1].map((xSide) => (
        <RoundedBox
          key={`x-frame-${xSide}`}
          position={[xSide * 0.493, 0.04, 0]}
          args={[0.026, 0.035, 1.52]}
          radius={0.01}
          smoothness={2}
        >
          <meshStandardMaterial color={active ? '#cad891' : '#a7a79a'} metalness={0.82} roughness={0.3} />
        </RoundedBox>
      ))}
      {[-1, 1].map((zSide) => (
        <RoundedBox
          key={`z-frame-${zSide}`}
          position={[0, 0.04, zSide * 0.728]}
          args={[1.01, 0.035, 0.026]}
          radius={0.01}
          smoothness={2}
        >
          <meshStandardMaterial color={active ? '#cad891' : '#a7a79a'} metalness={0.82} roughness={0.3} />
        </RoundedBox>
      ))}
      {Array.from({ length: rows - 1 }, (_, row) => (
        <mesh key={`busbar-${row}`} position={[0, 0.039, (row - (rows - 2) / 2) * rowPitch]}>
          <boxGeometry args={[0.88, 0.009, 0.012]} />
          <meshStandardMaterial color="#adb9bb" metalness={0.66} roughness={0.31} />
        </mesh>
      ))}
      <mesh position={[0, -0.044, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.12, 12]} />
        <meshStandardMaterial color="#c0bba9" metalness={0.76} roughness={0.33} />
      </mesh>
    </group>
  )
}

function SolarArraySystem({
  active,
  eclipsed,
  interactions,
}: {
  active: boolean
  eclipsed: boolean
  interactions: SubsystemInteractions
}) {
  return (
    <group {...interactions}>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh
            position={[side * 1.03, 0.06, 0]}
            rotation={[0, 0, side * Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.035, 0.035, 1.22, 12]} />
            <meshStandardMaterial color="#9da39f" metalness={0.84} roughness={0.3} />
          </mesh>
          {[0, 1].map((segment) => (
            <SolarPanelSegment
              key={segment}
              side={side}
              segment={segment}
              active={active}
              eclipsed={eclipsed}
            />
          ))}
          {[0.65, 1.69, 2.73].map((hingeX) => (
            <group key={hingeX} position={[side * hingeX, 0.12, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.055, 1.58, 12]} />
                <meshStandardMaterial color="#b5ac91" metalness={0.82} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0.025, 0]}>
                <torusGeometry args={[0.074, 0.014, 8, 20]} />
                <meshStandardMaterial color="#d1c5a5" metalness={0.78} roughness={0.31} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

function FoilQuilt({
  position,
  foilTexture,
  active,
}: {
  position: [number, number, number]
  foilTexture: CanvasTexture
  active: boolean
}) {
  return (
    <group position={position}>
      <RoundedBox args={[0.44, 0.49, 0.035]} radius={0.018} smoothness={3} castShadow>
        <meshPhysicalMaterial
          map={foilTexture}
          color="#e0c58d"
          metalness={0.3}
          roughness={0.53}
          clearcoat={0.22}
          clearcoatRoughness={0.45}
          emissive={active ? '#4b612c' : '#000000'}
          emissiveIntensity={active ? 0.12 : 0}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.019]}>
        <boxGeometry args={[0.42, 0.012, 0.008]} />
        <meshStandardMaterial color="#876a3e" metalness={0.33} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[0.012, 0.47, 0.008]} />
        <meshStandardMaterial color="#876a3e" metalness={0.33} roughness={0.58} />
      </mesh>
      {[-1, 1].map((x) => [-1, 1].map((y) => (
        <mesh key={`${x}-${y}`} position={[x * 0.185, y * 0.21, 0.027]}>
          <cylinderGeometry args={[0.014, 0.014, 0.012, 8]} />
          <meshStandardMaterial color="#d9c18d" metalness={0.84} roughness={0.27} />
        </mesh>
      )))}
    </group>
  )
}

function SpacecraftBus({
  foilTexture,
}: {
  foilTexture: CanvasTexture
}) {
  return (
    <group>
      <mesh rotation={[0, Math.PI / 8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 1.36, 8, 1]} />
        <meshPhysicalMaterial map={foilTexture} color="#c6a05a" metalness={0.28} roughness={0.55} clearcoat={0.2} />
      </mesh>
      {[-1, 1].map((ySide) => (
        <group key={`deck-${ySide}`} position={[0, ySide * 0.69, 0]}>
          <mesh>
            <cylinderGeometry args={[0.6, 0.6, 0.11, 8]} />
            <meshStandardMaterial color="#8b8b7b" metalness={0.77} roughness={0.34} />
          </mesh>
          <mesh position={[0, ySide * 0.061, 0]}>
            <cylinderGeometry args={[0.46, 0.46, 0.018, 8]} />
            <meshStandardMaterial color="#343c3e" metalness={0.68} roughness={0.41} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((face) => (
        <group key={`face-${face}`} rotation={[0, face * Math.PI / 2, 0]}>
          {[-1, 1].map((x) => [-1, 1].map((y) => (
            <FoilQuilt
              key={`${x}-${y}`}
              position={[x * 0.23, y * 0.265, 0.594]}
              foilTexture={foilTexture}
              active={false}
            />
          )))}
          <RoundedBox position={[0, 0.01, 0.614]} args={[0.055, 1.18, 0.04]} radius={0.012} smoothness={2}>
            <meshStandardMaterial color="#85857a" metalness={0.78} roughness={0.31} />
          </RoundedBox>
          {[-1, 1].map((y) => (
            <mesh key={y} position={[0, y * 0.635, 0.59]}>
              <cylinderGeometry args={[0.018, 0.018, 0.025, 8]} />
              <meshStandardMaterial color="#d1c5a5" metalness={0.82} roughness={0.29} />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <RoundedBox
          key={`frame-${x}-${z}`}
          position={[x * 0.51, 0, z * 0.48]}
          args={[0.045, 1.27, 0.045]}
          radius={0.014}
          smoothness={2}
          castShadow
        >
          <meshStandardMaterial color="#a3a59b" metalness={0.83} roughness={0.3} />
        </RoundedBox>
      )))}
      <RoundedBox position={[0, 0.72, 0.12]} args={[0.72, 0.085, 0.58]} radius={0.035} smoothness={3}>
        <meshStandardMaterial color="#777a72" metalness={0.72} roughness={0.39} />
      </RoundedBox>
      <RoundedBox position={[-0.18, 0.773, 0.18]} args={[0.24, 0.018, 0.26]} radius={0.008} smoothness={2}>
        <meshStandardMaterial color="#243b48" metalness={0.62} roughness={0.32} />
      </RoundedBox>
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} position={[x, -0.73, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.14, 12]} />
          <meshStandardMaterial color="#858b87" metalness={0.82} roughness={0.29} />
        </mesh>
      ))}
    </group>
  )
}

function ScienceInstrumentModule({
  part,
  position,
  active,
  observing,
  interactions,
}: {
  part: Lunar3DPart
  position: [number, number, number]
  active: boolean
  observing: boolean
  interactions: SubsystemInteractions
}) {
  const id = part.id.toUpperCase()
  const isRadar = id.includes('RF')
  const isThermal = id.includes('DIVINER') || id.includes('THERMAL')
  const isCamera = id.includes('LROC')
  const isLend = id.includes('LEND')
  const opticCount = isThermal ? 3 : isCamera ? 2 : 1
  const lensRadius = isLend ? 0.065 : isCamera ? 0.052 : 0.075
  const housingColor = isRadar ? '#777d7a' : isThermal ? '#b49a68' : '#9da19a'

  return (
    <group position={position} {...interactions}>
      <mesh position={[0, -0.25, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.22, 10]} />
        <meshStandardMaterial color="#a58d61" metalness={0.78} roughness={0.34} />
      </mesh>
      {isRadar ? (
        <group>
          <RoundedBox position={[0, 0, 0]} args={[0.43, 0.33, 0.075]} radius={0.025} smoothness={3} castShadow>
            <meshStandardMaterial color={housingColor} metalness={0.66} roughness={0.37} />
          </RoundedBox>
          {Array.from({ length: 12 }, (_, index) => {
            const x = (index % 4 - 1.5) * 0.084
            const y = (Math.floor(index / 4) - 1) * 0.084
            return (
              <RoundedBox key={index} position={[x, y, 0.044]} args={[0.069, 0.069, 0.012]} radius={0.005} smoothness={1}>
                <meshStandardMaterial
                  color={active ? '#557d83' : '#324f58'}
                  emissive={observing ? '#537544' : '#000000'}
                  emissiveIntensity={observing ? 0.18 : 0}
                  metalness={0.48}
                  roughness={0.31}
                />
              </RoundedBox>
            )
          })}
          <RoundedBox position={[0, 0, 0.058]} args={[0.39, 0.018, 0.012]} radius={0.004} smoothness={1}>
            <meshStandardMaterial color="#c4b998" metalness={0.75} roughness={0.3} />
          </RoundedBox>
        </group>
      ) : (
        <group>
          <RoundedBox position={[0, 0, 0]} args={[0.4, 0.35, 0.24]} radius={0.055} smoothness={5} castShadow>
            <meshPhysicalMaterial
              color={housingColor}
              metalness={0.56}
              roughness={0.39}
              clearcoat={0.15}
              emissive={active || observing ? '#536c39' : '#000000'}
              emissiveIntensity={active || observing ? 0.18 : 0}
            />
          </RoundedBox>
          {isThermal && Array.from({ length: 7 }, (_, index) => (
            <RoundedBox
              key={`fin-${index}`}
              position={[-0.16 + index * 0.053, 0.19, -0.015]}
              args={[0.018, 0.11, 0.22]}
              radius={0.006}
              smoothness={1}
            >
              <meshStandardMaterial color="#7d817c" metalness={0.77} roughness={0.35} />
            </RoundedBox>
          ))}
          {isLend && Array.from({ length: 5 }, (_, index) => (
            <mesh key={`shield-${index}`} position={[0, 0, -0.105 + index * 0.05]}>
              <torusGeometry args={[0.18 + index * 0.006, 0.009, 6, 20]} />
              <meshStandardMaterial color="#c8b68d" metalness={0.77} roughness={0.33} />
            </mesh>
          ))}
          {Array.from({ length: opticCount }, (_, index) => {
            const offset = (index - (opticCount - 1) / 2) * 0.13
            const radius = lensRadius * (isThermal ? 0.72 : 1)
            return (
              <group key={`optic-${index}`} position={[offset, isThermal ? -0.035 : 0, 0.132]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[radius + 0.024, radius + 0.035, 0.22, 20, 1, true]} />
                  <meshStandardMaterial color="#b2a47f" metalness={0.79} roughness={0.3} side={DoubleSide} />
                </mesh>
                <mesh position={[0, 0, 0.114]}>
                  <torusGeometry args={[radius + 0.018, 0.012, 8, 24]} />
                  <meshStandardMaterial color="#d0c4a4" metalness={0.82} roughness={0.25} />
                </mesh>
                <mesh position={[0, 0, 0.112]}>
                  <circleGeometry args={[radius, 24]} />
                  <meshPhysicalMaterial
                    color={isLend ? '#283a3c' : '#263c50'}
                    metalness={0.32}
                    roughness={0.18}
                    clearcoat={0.8}
                    clearcoatRoughness={0.13}
                  />
                </mesh>
              </group>
            )
          })}
          {isCamera && (
            <RoundedBox position={[0, -0.14, 0.126]} args={[0.25, 0.045, 0.035]} radius={0.012} smoothness={2}>
              <meshStandardMaterial color="#666d6b" metalness={0.76} roughness={0.31} />
            </RoundedBox>
          )}
        </group>
      )}
      <mesh position={[0, -0.174, 0.16]}>
        <boxGeometry args={[0.29, 0.018, 0.025]} />
        <meshStandardMaterial color="#d1bd8e" metalness={0.76} roughness={0.34} />
      </mesh>
    </group>
  )
}

function CommunicationsAssembly({
  part,
  active,
  interrupted,
  interactions,
}: {
  part: Lunar3DPart | undefined
  active: boolean
  interrupted: boolean
  interactions: SubsystemInteractions
}) {
  const id = part?.id.toLowerCase() ?? ''
  return (
    <group position={[0.37, 0.9, -0.1]} {...interactions}>
      <RoundedBox position={[0, -0.1, 0]} args={[0.23, 0.14, 0.23]} radius={0.03} smoothness={3} castShadow>
        <meshStandardMaterial color="#777e7a" metalness={0.74} roughness={0.35} />
      </RoundedBox>
      {id.includes('x-band') ? (
        <group position={[0.02, 0.24, 0.02]} rotation={[0.34, -0.28, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <sphereGeometry args={[0.31, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial
              color={active ? '#ded4bc' : '#bdb8a8'}
              metalness={0.72}
              roughness={0.27}
              side={DoubleSide}
              emissive={interrupted ? '#55462b' : active ? '#3d4c2b' : '#000000'}
              emissiveIntensity={interrupted || active ? 0.15 : 0}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[0.305, 0.018, 8, 36]} />
            <meshStandardMaterial color="#d2c7aa" metalness={0.82} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.044, 0.22, 14]} />
            <meshStandardMaterial color="#b6a276" metalness={0.79} roughness={0.3} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.13, 0, -0.02]} rotation={[0, 0, side * 0.72]}>
              <cylinderGeometry args={[0.012, 0.012, 0.27, 8]} />
              <meshStandardMaterial color="#c3b48e" metalness={0.82} roughness={0.28} />
            </mesh>
          ))}
        </group>
      ) : id.includes('uhf') ? (
        <group position={[0, 0.08, 0]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.018, 0.025, 0.58, 10]} />
            <meshStandardMaterial color="#c4c0af" metalness={0.83} roughness={0.25} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.19, 0.22, 0]} rotation={[0, 0, side * 0.88]}>
              <cylinderGeometry args={[0.012, 0.016, 0.42, 8]} />
              <meshStandardMaterial color="#d2c8a9" metalness={0.82} roughness={0.26} />
            </mesh>
          ))}
          <mesh position={[0, 0.03, 0]}>
            <torusGeometry args={[0.12, 0.012, 7, 20]} />
            <meshStandardMaterial color="#8c928e" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0.08, 0.02]} rotation={[0.18, -0.3, 0]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.11, 0.14, 0.25, 18]} />
            <meshStandardMaterial color="#a5a397" metalness={0.76} roughness={0.31} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <torusGeometry args={[0.095, 0.015, 8, 24]} />
            <meshStandardMaterial color="#d2c5a6" metalness={0.81} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <circleGeometry args={[0.078, 24]} />
            <meshPhysicalMaterial color="#243747" metalness={0.34} roughness={0.16} clearcoat={0.9} />
          </mesh>
          <mesh position={[0, -0.07, 0]}>
            <cylinderGeometry args={[0.025, 0.032, 0.18, 10]} />
            <meshStandardMaterial color="#b7a982" metalness={0.8} roughness={0.28} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function ThrusterBell({
  position,
  scale = 1,
  active = false,
}: {
  position: [number, number, number]
  scale?: number
  active?: boolean
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.045, 0.14, 0.26, 18, 1, true]} />
        <meshStandardMaterial color="#8e7b5b" metalness={0.72} roughness={0.35} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.253, 0]}>
        <torusGeometry args={[0.13, 0.012, 7, 20]} />
        <meshStandardMaterial color={active ? '#d3f36b' : '#c3b28e'} metalness={0.82} roughness={0.26} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.13, 12]} />
        <meshStandardMaterial color="#b5a77f" metalness={0.78} roughness={0.3} />
      </mesh>
    </group>
  )
}

function PropulsionAssembly({
  part,
  active,
  firing,
  interactions,
}: {
  part: Lunar3DPart | undefined
  active: boolean
  firing: boolean
  interactions: SubsystemInteractions
}) {
  const id = part?.id.toLowerCase() ?? ''
  return (
    <group {...interactions}>
      {id.includes('bipropellant') ? (
        <>
          <ThrusterBell position={[0, -0.84, -0.04]} scale={1.28} active={active} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.35, -0.48, -0.13]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.13, 0.13, 0.42, 16]} />
                <meshPhysicalMaterial color={active ? '#c9b276' : '#b6a37b'} metalness={0.66} roughness={0.32} clearcoat={0.2} />
              </mesh>
              {[-1, 1].map((cap) => (
                <mesh key={cap} position={[0, 0, cap * 0.22]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.105, 0.105, 0.035, 14]} />
                  <meshStandardMaterial color="#d2c09a" metalness={0.82} roughness={0.26} />
                </mesh>
              ))}
            </group>
          ))}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.45, -0.3, 0.14]} rotation={[0, 0, side * 0.38]}>
              <cylinderGeometry args={[0.014, 0.014, 0.64, 8]} />
              <meshStandardMaterial color="#c09e68" metalness={0.79} roughness={0.31} />
            </mesh>
          ))}
        </>
      ) : id.includes('electric') ? (
        <group position={[0, -0.78, -0.06]}>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.26, 0, 0]}>
              <RoundedBox args={[0.24, 0.28, 0.3]} radius={0.035} smoothness={3}>
                <meshStandardMaterial color="#6e7775" metalness={0.71} roughness={0.34} />
              </RoundedBox>
              <mesh position={[0, -0.12, 0]}>
                <cylinderGeometry args={[0.09, 0.12, 0.18, 18, 1, true]} />
                <meshStandardMaterial color="#b6a47e" metalness={0.66} roughness={0.3} side={DoubleSide} />
              </mesh>
              {[-0.07, -0.025, 0.025, 0.07].map((offset) => (
                <mesh key={offset} position={[offset, -0.212, 0]}>
                  <boxGeometry args={[0.008, 0.016, 0.18]} />
                  <meshStandardMaterial color="#d2c7aa" metalness={0.78} roughness={0.26} />
                </mesh>
              ))}
              <mesh position={[0, -0.22, 0]}>
                <torusGeometry args={[0.095, 0.012, 7, 20]} />
                <meshStandardMaterial color={active ? '#b9cb91' : '#8b927e'} metalness={0.72} roughness={0.3} />
              </mesh>
            </group>
          ))}
          <RoundedBox position={[0, 0.17, 0]} args={[0.76, 0.12, 0.42]} radius={0.025} smoothness={2}>
            <meshStandardMaterial color={active ? '#c1a66e' : '#927b55'} metalness={0.66} roughness={0.37} />
          </RoundedBox>
        </group>
      ) : (
        <group>
          <RoundedBox position={[0, -0.54, -0.08]} args={[0.56, 0.34, 0.46]} radius={0.08} smoothness={5} castShadow>
            <meshPhysicalMaterial color={active ? '#c7ae70' : '#b5a276'} metalness={0.55} roughness={0.39} clearcoat={0.18} />
          </RoundedBox>
          {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
            <ThrusterBell key={`${x}-${z}`} position={[x * 0.43, -0.42, z * 0.37]} scale={0.56} active={active} />
          )))}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.35, -0.36, 0.1]} rotation={[0, 0, side * 0.4]}>
              <cylinderGeometry args={[0.013, 0.013, 0.38, 8]} />
              <meshStandardMaterial color="#d1b982" metalness={0.75} roughness={0.34} />
            </mesh>
          ))}
        </group>
      )}
      {firing && (
        <mesh position={[0, -1.02, -0.04]}>
          <coneGeometry args={[0.055, 0.28, 10]} />
          <meshBasicMaterial color="#f0a95b" transparent opacity={0.62} />
        </mesh>
      )}
    </group>
  )
}

function PowerAssembly({
  part,
  active,
  eclipsed,
  interactions,
}: {
  part: Lunar3DPart | undefined
  active: boolean
  eclipsed: boolean
  interactions: SubsystemInteractions
}) {
  const id = part?.id.toLowerCase() ?? ''
  if (id === 'solar') {
    return <SolarArraySystem active={active} eclipsed={eclipsed} interactions={interactions} />
  }
  if (id === 'rtg') {
    return (
      <group position={[0.79, 0.05, -0.16]} {...interactions}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.62, 20]} />
          <meshPhysicalMaterial color="#aeb0a4" metalness={0.7} roughness={0.31} clearcoat={0.22} />
        </mesh>
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2
          return (
            <RoundedBox
              key={index}
              position={[Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0]}
              rotation={[0, 0, angle]}
              args={[0.24, 0.035, 0.45]}
              radius={0.012}
              smoothness={2}
            >
              <meshStandardMaterial
                color="#baaa7e"
                metalness={0.77}
                roughness={0.31}
                emissive={active ? '#4e602e' : '#000000'}
                emissiveIntensity={active ? 0.14 : 0}
              />
            </RoundedBox>
          )
        })}
        <mesh position={[0, 0, 0.34]}>
          <torusGeometry args={[0.19, 0.025, 8, 24]} />
          <meshStandardMaterial color="#d3c7a6" metalness={0.82} roughness={0.25} />
        </mesh>
      </group>
    )
  }
  return (
    <group position={[0.73, -0.02, -0.12]} {...interactions}>
      <RoundedBox args={[0.48, 0.56, 0.43]} radius={0.065} smoothness={4} castShadow>
        <meshPhysicalMaterial
          color={active ? '#a88d58' : '#857957'}
          metalness={0.53}
          roughness={0.4}
          clearcoat={0.18}
          emissive={active && !eclipsed ? '#465a2e' : '#000000'}
          emissiveIntensity={active && !eclipsed ? 0.15 : 0}
        />
      </RoundedBox>
      {[-1, 0, 1].map((x) => (
        <RoundedBox key={x} position={[x * 0.135, 0, 0.222]} args={[0.035, 0.44, 0.025]} radius={0.012} smoothness={2}>
          <meshStandardMaterial color="#cfb875" metalness={0.72} roughness={0.36} />
        </RoundedBox>
      ))}
      <RoundedBox position={[0, 0, 0.24]} args={[0.32, 0.055, 0.026]} radius={0.012} smoothness={2}>
        <meshStandardMaterial color="#5d6966" metalness={0.69} roughness={0.36} />
      </RoundedBox>
    </group>
  )
}

function SpacecraftModel({
  parts,
  selectedPart,
  onSelect,
  eventType,
  viewMode,
  shipRef,
  onHoverSubsystem,
}: {
  parts: Lunar3DPart[]
  selectedPart: Lunar3DPart | null
  onSelect: (id: string) => void
  eventType: MissionEventType | null
  viewMode: ViewMode
  shipRef: RefObject<Object3D | null>
  onHoverSubsystem: (subsystem: MissionSubsystem | null) => void
}) {
  const [hoveredSubsystem, setHoveredSubsystem] = useState<MissionSubsystem | null>(null)
  const activeSubsystem = selectedPart?.subsystem ?? null
  const powerPart = selectPartForSubsystem(parts, 'power')
  const propulsionPart = selectPartForSubsystem(parts, 'propulsion')
  const communicationsPart = selectPartForSubsystem(parts, 'communications')
  const scienceParts = parts.filter((part) => part.subsystem === 'science')
  const eclipsed = eventType === 'eclipse'
  const observing = eventType === 'science'
  const firing = eventType === 'insertion'
  const foilTexture = useMemo(() => createFoilTexture(), [])
  useEffect(() => () => foilTexture.dispose(), [foilTexture])

  const selectSubsystem = (
    subsystem: MissionSubsystem,
    event: { stopPropagation: () => void },
    partId?: string,
  ) => {
    event.stopPropagation()
    const part = partId ? parts.find((candidate) => candidate.id === partId) : selectPartForSubsystem(parts, subsystem)
    if (part) onSelect(part.id)
  }
  const subsystemHandlers = (subsystem: MissionSubsystem, partId?: string): SubsystemInteractions => ({
    onClick: (event: { stopPropagation: () => void }) => selectSubsystem(subsystem, event, partId),
    onPointerOver: () => {
      setHoveredSubsystem(subsystem)
      onHoverSubsystem(subsystem)
    },
    onPointerOut: () => {
      setHoveredSubsystem((current) => current === subsystem ? null : current)
      onHoverSubsystem(null)
    },
  })
  const isHighlighted = (subsystem: MissionSubsystem) => activeSubsystem === subsystem || hoveredSubsystem === subsystem

  return (
    <>
      <group
        ref={shipRef}
        scale={viewMode === 'orbit' ? 0.42 : 1.22}
        position={viewMode === 'spacecraft' ? [0, 0, 0] : [-3.6, 0.08, 0]}
      >
        <SpacecraftBus foilTexture={foilTexture} />
        <PowerAssembly
          part={powerPart}
          active={isHighlighted('power')}
          eclipsed={eclipsed}
          interactions={subsystemHandlers('power')}
        />
        {scienceParts.map((part, index) => (
          <ScienceInstrumentModule
            key={part.id}
            part={part}
            position={[index === 0 ? -0.27 : 0.27, -0.05, 0.7]}
            active={selectedPart?.id === part.id || (isHighlighted('science') && scienceParts.length === 1)}
            observing={observing}
            interactions={subsystemHandlers('science', part.id)}
          />
        ))}
        <CommunicationsAssembly
          part={communicationsPart}
          active={isHighlighted('communications')}
          interrupted={eventType === 'communications'}
          interactions={subsystemHandlers('communications')}
        />
        <PropulsionAssembly
          part={propulsionPart}
          active={isHighlighted('propulsion')}
          firing={firing}
          interactions={subsystemHandlers('propulsion')}
        />
      </group>
    </>
  )
}

function SignalPulse({
  active,
  shipRef,
  reducedMotion,
}: {
  active: boolean
  shipRef: RefObject<Object3D | null>
  reducedMotion: boolean
}) {
  const pulseRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!pulseRef.current || !active) return
    const shipPosition = shipRef.current?.position
    if (!shipPosition) return
    const progress = reducedMotion ? 0.5 : (clock.elapsedTime % 1.5) / 1.5
    pulseRef.current.position.lerpVectors(EARTH_POSITION, shipPosition, progress)
  })

  if (!active) return null
  return (
    <>
      <Line points={[EARTH_POSITION, new Vector3(1.85, 0.08, 2.15)]} color="#dfb36c" lineWidth={1.5} dashed dashSize={0.12} gapSize={0.1} />
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial color="#f0bf74" />
      </mesh>
    </>
  )
}

// Soft studio lights that exist only as reflections, so foil, solar cells and metal read as real surfaces.
// Built from shapes in code: nothing is downloaded.
function StudioReflections() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.6}>
      <Lightformer form="rect" intensity={3.2} color="#fff3dc" position={[-5, 6, 6]} scale={[9, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.1} color="#9ab2c3" position={[6, 1, -5]} scale={[6, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={1.6} color="#ffffff" position={[0, 5, -6]} scale={4} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.35} color="#c8d8e1" position={[0, -6, 0]} scale={[10, 10, 1]} target={[0, 0, 0]} />
    </Environment>
  )
}

// Eases the camera in from further away when a view opens. Stops the moment the player takes control.
function CameraIntro({
  enabled,
  maxDistance,
  interrupted,
}: {
  enabled: boolean
  maxDistance: number
  interrupted: boolean
}) {
  const startedAt = useRef<number | null>(null)
  const finished = useRef(false)
  const from = useRef(new Vector3())
  const to = useRef(new Vector3())

  useFrame(({ camera, clock }) => {
    if (!enabled || finished.current) return
    if (interrupted) {
      finished.current = true
      return
    }
    if (startedAt.current === null) {
      startedAt.current = clock.elapsedTime
      to.current.copy(camera.position)
      const pullBack = Math.min(1.4, (maxDistance * 0.97) / to.current.length())
      from.current.copy(to.current).multiplyScalar(Math.max(1, pullBack))
    }
    const progress = Math.min(1, (clock.elapsedTime - startedAt.current) / 1.8)
    const eased = 1 - (1 - progress) ** 3
    camera.position.lerpVectors(from.current, to.current, eased)
    camera.lookAt(0, 0, 0)
    if (progress >= 1) finished.current = true
  })

  return null
}

function LunarScene({
  parts,
  selectedPart,
  onSelect,
  viewMode,
  missionState,
  eventType,
  reducedMotion,
  onMoonLoaded,
  onHoverSubsystem,
}: {
  parts: Lunar3DPart[]
  selectedPart: Lunar3DPart | null
  onSelect: (id: string) => void
  viewMode: ViewMode
  missionState?: MissionState | null
  eventType: MissionEventType | null
  reducedMotion: boolean
  onMoonLoaded: () => void
  onHoverSubsystem: (subsystem: MissionSubsystem | null) => void
}) {
  const shipRef = useRef<Object3D>(null)
  const [playerHasControl, setPlayerHasControl] = useState(false)
  const maxCameraDistance = viewMode === 'orbit' ? 12 : 9
  const orbitPoints = useMemo(() => Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    return new Vector3(Math.cos(angle) * 3.48, 0.03, Math.sin(angle) * 3.48)
  }), [])
  const scienceTarget = useMemo(() => new Vector3(0, 0, MOON_RADIUS + 0.02), [])
  const scienceLine = useMemo(() => [new Vector3(), scienceTarget], [scienceTarget])

  useFrame(({ clock }, delta) => {
    if (!shipRef.current) return
    if (viewMode === 'spacecraft') {
      shipRef.current.position.set(0, 0, 0)
      if (!reducedMotion) shipRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.16) * 0.12
      return
    }
    const target = getShipTarget(missionState, eventType, clock.elapsedTime, reducedMotion)
    if (reducedMotion) shipRef.current.position.copy(target)
    else shipRef.current.position.lerp(target, 1 - Math.exp(-delta * 2.2))
    shipRef.current.rotation.y = -Math.atan2(target.z, target.x) + Math.PI / 2
  })

  return (
    <>
      <color attach="background" args={['#070b10']} />
      <ambientLight intensity={0.26} />
      <hemisphereLight args={['#c8d8e1', '#101820', 0.48]} />
      <directionalLight
        position={[-6, 8, 7]}
        intensity={3.1}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <directionalLight position={[5, 1.5, -4]} intensity={0.58} color="#9ab2c3" />
      <NaturalStarfield />
      <StudioReflections />
      <CameraIntro enabled={!reducedMotion} maxDistance={maxCameraDistance} interrupted={playerHasControl} />
      {viewMode === 'orbit' && (
        <>
          <Suspense fallback={null}>
            <LunarAsset onLoaded={onMoonLoaded} />
          </Suspense>
          <Line points={orbitPoints} color={missionState?.telemetry.orbitAchieved ? '#a7d65c' : '#62737a'} lineWidth={1.2} dashed dashSize={0.11} gapSize={0.09} />
          {!missionState?.telemetry.orbitAchieved && (
            <Line
              points={[
                new Vector3(-4.35, 0.03, -1.05),
                new Vector3(-3.75, 0.05, -0.84),
                new Vector3(-3.15, 0.08, -0.62),
              ]}
              color="#91ad78"
              lineWidth={1.5}
              dashed
              dashSize={0.12}
              gapSize={0.1}
            />
          )}
          <mesh position={EARTH_POSITION}>
            <sphereGeometry args={[0.32, 24, 20]} />
            <meshStandardMaterial color="#557a90" roughness={0.78} metalness={0.08} />
          </mesh>
          <mesh position={[EARTH_POSITION.x - 0.04, EARTH_POSITION.y + 0.2, EARTH_POSITION.z + 0.03]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshBasicMaterial color="#b4d2a0" />
          </mesh>
          {eventType === 'science' && (
            <>
              <Line points={scienceLine} color="#c2f276" lineWidth={1.6} dashed dashSize={0.08} gapSize={0.06} />
              <mesh position={scienceTarget}>
                <sphereGeometry args={[0.09, 14, 12]} />
                <meshBasicMaterial color="#d6ff91" />
              </mesh>
            </>
          )}
          {eventType === 'communications' && (
            <SignalPulse active shipRef={shipRef} reducedMotion={reducedMotion} />
          )}
        </>
      )}
      <SpacecraftModel
        parts={parts}
        selectedPart={selectedPart}
        onSelect={onSelect}
        eventType={eventType}
        viewMode={viewMode}
        shipRef={shipRef}
        onHoverSubsystem={onHoverSubsystem}
      />
      <OrbitControls
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        enablePan
        enableZoom
        minDistance={viewMode === 'orbit' ? 4.3 : 2.5}
        maxDistance={maxCameraDistance}
        autoRotate={viewMode === 'spacecraft' && !reducedMotion && !playerHasControl}
        autoRotateSpeed={0.7}
        onStart={() => setPlayerHasControl(true)}
        minPolarAngle={Math.PI / 7}
        maxPolarAngle={Math.PI * 0.88}
        target={[0, 0, 0]}
      />
    </>
  )
}

function ComponentDetails({ part }: { part: Lunar3DPart | null }) {
  if (!part) {
    return (
      <div className="lunar3d-details" aria-live="polite">
        <p className="lunar3d-detail-kicker">NO SELECTED COMPONENT</p>
        <p>Choose an instrument, power system, propulsion option or communications component to inspect its builder specifications.</p>
      </div>
    )
  }

  return (
    <div className="lunar3d-details" aria-live="polite">
      <p className="lunar3d-detail-kicker">{part.subsystem.toUpperCase()} · ILLUSTRATIVE BUILDER SPECIFICATIONS</p>
      <h3>{part.name}</h3>
      <dl className="lunar3d-spec-grid">
        <div><dt>Mass</dt><dd>{part.massKg} kg</dd></div>
        <div>
          <dt>Power</dt>
          <dd>
            {part.powerOutputW !== undefined
              ? `${part.powerOutputW} W output`
              : `${part.powerDrawW} W draw`}
          </dd>
        </div>
        {part.maxDischargeW !== undefined && (
          <div><dt>Max discharge</dt><dd>{part.maxDischargeW} W</dd></div>
        )}
        {part.storageWh !== undefined && (
          <div><dt>Battery energy</dt><dd>{part.storageWh} Wh</dd></div>
        )}
        {part.subsystem === 'power' && part.storageWh === undefined && (
          <div className="lunar3d-spec-wide"><dt>Battery energy</dt><dd>Not separately specified by this selected power option.</dd></div>
        )}
        <div><dt>Mission cost</dt><dd>${part.costK.toLocaleString()}k</dd></div>
      </dl>
      <p className="lunar3d-function-label">Function and engineering trade-off</p>
      <p>{part.description}</p>
      <p className="lunar3d-spec-note">
        Mass, power and cost are illustrative gameplay values, not verified NASA hardware specifications.
      </p>
      {part.sourceUrls?.length ? (
        <div className="lunar3d-source-list">
          {part.sourceUrls.map((url) => (
            <a href={url} key={url} target="_blank" rel="noopener noreferrer">
              NASA instrument source: {new URL(url).hostname}{new URL(url).pathname}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ComponentPicker({
  parts,
  selectedPartId,
  onSelect,
}: {
  parts: Lunar3DPart[]
  selectedPartId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="lunar3d-component-list" aria-label="Selectable spacecraft components">
      {parts.map((part) => (
        <button
          key={part.id}
          type="button"
          className="lunar3d-component-button"
          aria-pressed={selectedPartId === part.id}
          title={`${part.name}: ${part.description}`}
          onClick={() => onSelect(part.id)}
        >
          <span>{part.subsystem}</span>
          <strong>{part.name}</strong>
        </button>
      ))}
    </div>
  )
}

function FallbackVisualization({
  viewMode,
  missionState,
  eventType,
  selectedPart,
  components,
  selectedPartId,
  onSelect,
  selectedPowerId,
  reason,
}: {
  viewMode: ViewMode
  missionState?: MissionState | null
  eventType: MissionEventType | null
  selectedPart: Lunar3DPart | null
  components: Lunar3DPart[]
  selectedPartId: string | null
  onSelect: (id: string) => void
  selectedPowerId: string
  reason: string
}) {
  const fallbackConfiguration = missionState?.design ?? {
    instrumentNames: components.filter((part) => part.subsystem === 'science').map((part) => part.name),
    powerId: selectedPowerId,
    powerName: components.find((part) => part.subsystem === 'power')?.name ?? 'Power not selected',
    propulsionName: components.find((part) => part.subsystem === 'propulsion')?.name ?? 'Propulsion not selected',
    communicationsName: components.find((part) => part.subsystem === 'communications')?.name ?? 'Communications not selected',
  }
  const selectedSubsystem = selectedPart?.subsystem ?? null
  const affectedSubsystem = getAffectedSubsystem(eventType ? { type: eventType } : null)

  return (
    <div className="lunar3d-fallback" role="region" aria-label="Interactive spacecraft 2D fallback">
      <p className="lunar3d-fallback-message" role="status">{reason} The interactive 2D spacecraft schematic remains available.</p>
      {viewMode === 'orbit' && missionState
        ? <MissionOrbitalVisualization state={missionState} event={getCurrentMissionEvent(missionState)} />
        : (
          <SpacecraftSchematic
            configuration={fallbackConfiguration}
            selectedSubsystem={selectedSubsystem}
            affectedSubsystem={affectedSubsystem}
          />
        )}
      <ComponentPicker parts={components} selectedPartId={selectedPartId} onSelect={onSelect} />
      <ComponentDetails part={selectedPart} />
    </div>
  )
}

export default function Lunar3DExperience({
  mode,
  parts,
  selectedPowerId,
  highlightedPartId = null,
  highlightedSubsystem = null,
  onHighlightPart,
  missionState = null,
}: Lunar3DExperienceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('orbit')
  const [selectedPartId, setSelectedPartId] = useState<string | null>(parts[0]?.id ?? null)
  const [moonLoaded, setMoonLoaded] = useState(false)
  const [hoveredSubsystem, setHoveredSubsystem] = useState<MissionSubsystem | null>(null)
  const [webglAvailable] = useState(supportsWebGL)
  const [webglError, setWebglError] = useState<string | null>(null)
  const reducedMotion = useReducedMotion()
  const onMoonLoaded = useCallback(() => setMoonLoaded(true), [])
  const onWebGLError = useCallback((error: Error) => {
    console.error('Lunar 3D visualization failed; switching to the interactive 2D fallback.', error)
    setWebglError(error.message)
  }, [])
  const canRenderWebGL = webglAvailable && webglError === null
  const builderHighlightedPart = mode === 'builder'
    ? parts.find((part) => part.id === highlightedPartId)
      ?? (highlightedSubsystem ? selectPartForSubsystem(parts, highlightedSubsystem) : undefined)
    : undefined
  const effectiveSelectedPartId = builderHighlightedPart?.id
    ?? (parts.some((part) => part.id === selectedPartId)
      ? selectedPartId
      : parts[0]?.id ?? null)
  const selectedPart = parts.find((part) => part.id === effectiveSelectedPartId) ?? null
  const hoveredPart = hoveredSubsystem ? selectPartForSubsystem(parts, hoveredSubsystem) : null
  const activeEvent = missionState ? getCurrentMissionEvent(missionState) : null
  const eventType = activeEvent?.type ?? null
  const handleSelectPart = (id: string) => {
    setSelectedPartId(id)
    if (mode === 'builder') onHighlightPart?.(id)
  }

  return (
    <section className={`lunar3d-experience${mode === 'mission' ? ' is-flight-view' : ''}`} aria-label="Interactive lunar 3D experience">
      <div className="lunar3d-heading">
        <div>
          <p className="section-kicker">{mode === 'mission' ? 'FLIGHT DYNAMICS · INTERACTIVE 3D' : 'SPACECRAFT SYSTEMS · INTERACTIVE 3D'}</p>
          <h2>{mode === 'mission' ? 'Lunar mission view' : 'Inspect your spacecraft'}</h2>
        </div>
        <div className="lunar3d-view-controls" role="group" aria-label="Choose visualization camera mode">
          <button type="button" aria-pressed={viewMode === 'orbit'} onClick={() => setViewMode('orbit')}>ORBIT VIEW</button>
          <button type="button" aria-pressed={viewMode === 'spacecraft'} onClick={() => setViewMode('spacecraft')}>SPACECRAFT VIEW</button>
        </div>
      </div>

      <div className="lunar3d-content">
        <div
          className="lunar3d-stage"
          data-testid="lunar-3d-stage"
          data-moon-loaded={moonLoaded}
          data-webgl-available={canRenderWebGL}
        >
          {canRenderWebGL ? (
            <>
              <WebGLErrorBoundary onError={onWebGLError}>
                <Canvas
                  key={viewMode}
                  shadows="percentage"
                  dpr={[1, 1.5]}
                  camera={{
                    position: viewMode === 'orbit' ? [0, 2.3, 7.6] : [4.1, 2.9, 5.6],
                    fov: viewMode === 'orbit' ? 43 : 39,
                    near: 0.1,
                    far: 60,
                  }}
                  gl={{ antialias: true, alpha: false, toneMapping: ACESFilmicToneMapping }}
                >
                  <Suspense fallback={null}>
                    <LunarScene
                      parts={parts}
                      selectedPart={selectedPart}
                      onSelect={handleSelectPart}
                      viewMode={viewMode}
                      missionState={missionState}
                      eventType={eventType}
                      reducedMotion={reducedMotion}
                      onMoonLoaded={onMoonLoaded}
                      onHoverSubsystem={setHoveredSubsystem}
                    />
                  </Suspense>
                </Canvas>
              </WebGLErrorBoundary>
              <div className="lunar3d-hud lunar3d-hud-top" aria-live="polite">
                <span>{viewMode === 'orbit' ? 'NASA LRO MOON · ORIGINAL ILLUSTRATIVE ORBITER' : 'ORIGINAL ILLUSTRATIVE ORBITER CONCEPT'}</span>
                {missionState && <strong>{missionState.phase.toUpperCase()} · {missionState.telemetry.orbitAchieved ? 'ORBIT ACHIEVED' : 'ORBIT NOT ACHIEVED'}</strong>}
                {activeEvent && <strong className="lunar3d-event-label">{activeEvent.type === 'eclipse' ? 'ECLIPSE · SOLAR GENERATION 0 W' : activeEvent.type === 'communications' ? 'COMMUNICATION LINK INTERRUPTION' : activeEvent.type === 'science' ? 'SOUTH-POLE SCIENCE OBSERVATION' : 'ORBITAL INSERTION EVENT'}</strong>}
              </div>
              {viewMode === 'orbit' && !moonLoaded && (
                <div className="lunar3d-model-loading" role="status">Loading local NASA Moon model…</div>
              )}
              {hoveredPart && (
                <div className="lunar3d-hover-tooltip" role="tooltip">
                  <strong>{hoveredPart.name}</strong>
                  <span>{hoveredPart.description}</span>
                </div>
              )}
              <div className="lunar3d-hud lunar3d-hud-bottom">
                <span>{viewMode === 'orbit' ? 'SOUTH-POLAR LOCATOR · SCHEMATIC' : 'SELECT A SUBSYSTEM TO INSPECT'}</span>
                <span>DRAG TO ROTATE · SCROLL OR PINCH TO ZOOM</span>
              </div>
            </>
          ) : (
            <FallbackVisualization
              viewMode={viewMode}
              missionState={missionState}
              eventType={eventType}
              selectedPart={selectedPart}
              components={parts}
              selectedPartId={effectiveSelectedPartId}
              onSelect={handleSelectPart}
              selectedPowerId={selectedPowerId}
              reason={webglError ? 'WebGL rendering failed.' : 'WebGL is unavailable.'}
            />
          )}
        </div>

        <aside className="lunar3d-inspector" aria-label="Spacecraft component inspector">
          {!canRenderWebGL
            ? <p className="lunar3d-fallback-note">2D FALLBACK ACTIVE · {webglError ? '3D rendering failed.' : '3D rendering is unavailable in this browser.'}</p>
            : (
              <>
                <ComponentPicker parts={parts} selectedPartId={effectiveSelectedPartId} onSelect={handleSelectPart} />
                <ComponentDetails part={selectedPart} />
              </>
            )}
          <div className="lunar3d-asset-credit">
            {viewMode === 'orbit' ? (
              <>
                <strong>NASA lunar model provenance</strong>
                <p>NASA GSFC Scientific Visualization Studio, SVS 14959; model by Dan Gallagher, based on Lunar Reconnaissance Orbiter data. NASA viewer orientation (270° about model Z) is applied; the model south-polar axis is brought into view with a schematic locator.</p>
                <p>The spacecraft shown alongside the Moon is an original illustrative concept, not NASA hardware.</p>
                <a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noopener noreferrer">NASA SVS 14959 · Moon 3D model</a>
              </>
            ) : (
              <>
                <strong>Original spacecraft schematic</strong>
                <p>This interactive spacecraft is an original visualization, not an actual NASA spacecraft. Geometry and relative scale are illustrative.</p>
              </>
            )}
          </div>
        </aside>
      </div>
      <p className="lunar3d-physics-note">
        {reducedMotion ? 'Reduced motion is enabled; automatic scene movement is minimized.' : 'Orbit positions and trajectory lines are schematic, not physically accurate.'}
        {' '}All component specifications shown here are illustrative game values.
      </p>
    </section>
  )
}
