import type { MissionEvent } from './missionSimulation'

export type MissionSubsystem = 'science' | 'power' | 'propulsion' | 'communications'

export function getAffectedSubsystem(event: Pick<MissionEvent, 'type'> | null): MissionSubsystem | null {
  if (!event) return null
  if (event.type === 'insertion') return 'propulsion'
  if (event.type === 'eclipse') return 'power'
  if (event.type === 'communications') return 'communications'
  return 'science'
}
