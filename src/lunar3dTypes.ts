import type { MissionState } from './missionSimulation'
import type { MissionSubsystem } from './missionSubsystems'

export type Lunar3DPart = {
  id: string
  subsystem: MissionSubsystem
  name: string
  description: string
  massKg: number
  powerDrawW: number
  powerOutputW?: number
  maxDischargeW?: number
  storageWh?: number
  costK: number
  sourceUrls?: string[]
}

export type Lunar3DExperienceProps = {
  mode: 'builder' | 'mission'
  parts: Lunar3DPart[]
  selectedPowerId: string
  highlightedPartId?: string | null
  highlightedSubsystem?: MissionSubsystem | null
  onHighlightPart?: (id: string) => void
  missionState?: MissionState | null
}
