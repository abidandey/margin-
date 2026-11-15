import scienceDataset from './data/margin-lunar-science.json'

export const LUNAR_SCIENCE_DATA = scienceDataset

export type ScienceInstrument = (typeof scienceDataset.instruments)[number]
export type ScienceInstrumentId = ScienceInstrument['id']
export type ScienceOpportunity = (typeof scienceDataset.mission_events)[number]
export type ScienceOpportunityId = ScienceOpportunity['id']

export type WaterEvidenceModality = 'hydrogen' | 'thermal' | 'ultraviolet' | 'radar'

export type ScienceGameProfile = {
  massKg: number
  costK: number
  powerDrawW: number
  sciencePoints: number
  terrainPoints: number
  waterEvidencePoints: number
  evidenceModality?: WaterEvidenceModality
}

export const SCIENCE_GAME_PROFILES: Record<ScienceInstrumentId, ScienceGameProfile> = {
  LOLA: { massKg: 18, costK: 360, powerDrawW: 65, sciencePoints: 14, terrainPoints: 24, waterEvidencePoints: 0 },
  LAMP: { massKg: 10, costK: 300, powerDrawW: 55, sciencePoints: 18, terrainPoints: 8, waterEvidencePoints: 16, evidenceModality: 'ultraviolet' },
  LEND: { massKg: 18, costK: 360, powerDrawW: 70, sciencePoints: 20, terrainPoints: 8, waterEvidencePoints: 22, evidenceModality: 'hydrogen' },
  DIVINER: { massKg: 22, costK: 420, powerDrawW: 90, sciencePoints: 18, terrainPoints: 18, waterEvidencePoints: 18, evidenceModality: 'thermal' },
  LROC: { massKg: 16, costK: 340, powerDrawW: 65, sciencePoints: 14, terrainPoints: 20, waterEvidencePoints: 0 },
  MINI_RF: { massKg: 30, costK: 600, powerDrawW: 150, sciencePoints: 22, terrainPoints: 12, waterEvidencePoints: 18, evidenceModality: 'radar' },
  CRATER: { massKg: 12, costK: 280, powerDrawW: 50, sciencePoints: 12, terrainPoints: 4, waterEvidencePoints: 0 },
}

const instrumentById = new Map<ScienceInstrumentId, ScienceInstrument>(
  scienceDataset.instruments.map((instrument) => [instrument.id, instrument]),
)

const opportunityById = new Map<ScienceOpportunityId, ScienceOpportunity>(
  scienceDataset.mission_events.map((opportunity) => [opportunity.id, opportunity]),
)

export function getScienceInstrument(id: ScienceInstrumentId): ScienceInstrument {
  const instrument = instrumentById.get(id)
  if (!instrument) throw new Error(`Unknown science instrument: ${id}`)
  return instrument
}

export function getScienceOpportunity(id: ScienceOpportunityId): ScienceOpportunity {
  const opportunity = opportunityById.get(id)
  if (!opportunity) throw new Error(`Unknown science opportunity: ${id}`)
  return opportunity
}

export function getWaterEvidenceInterpretation(instrument: ScienceInstrument) {
  const rule = scienceDataset.science_discovery_rules.evidence_categories.find(
    (category) => category.instrument === instrument.id,
  )
  return rule?.interpretation ?? instrument.game_mapping.player_feedback
}
