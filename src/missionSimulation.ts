import {
  LUNAR_SCIENCE_DATA,
  SCIENCE_GAME_PROFILES,
  getScienceInstrument,
  getScienceOpportunity,
  getWaterEvidenceInterpretation,
  type ScienceInstrumentId,
  type ScienceOpportunityId,
  type WaterEvidenceModality,
} from './scienceData'

export const MISSION_DURATION_SECONDS = 75

export const MISSION_PHASES = [
  'Launch',
  'Transit',
  'Lunar Orbit Insertion',
  'South Pole Science',
  'Data Return',
] as const

export type MissionPhase = (typeof MISSION_PHASES)[number]
export type MissionEventType = 'insertion' | 'eclipse' | 'communications' | 'science'
export type MissionStatus = 'running' | 'awaiting-decision' | 'complete'
export type MissionResult = 'Success' | 'Partial Success' | 'Failure'

export type MissionDesign = {
  instrumentIds: ScienceInstrumentId[]
  instrumentNames: string[]
  powerId: string
  powerName: string
  /** Power the generator still produces during a full eclipse, W. Solar: 0. Radioisotope: its rated output. */
  eclipseGenerationW: number
  batteryId: string
  /** Null when no battery is installed. */
  batteryName: string | null
  /** Energy the battery stores when full, Wh. A battery stores energy; it never generates it. */
  batteryEnergyCapacityWh: number
  /** Highest power the battery can deliver, W. */
  batteryDischargeLimitW: number
  propulsionId: string
  propulsionName: string
  communicationsId: string
  communicationsName: string
  massKg: number
  massLimitKg: number
  massMarginKg: number
  powerLoadW: number
  powerCapacityW: number
  powerMarginW: number
  costK: number
  budgetLimitK: number
  budgetMarginK: number
  launchPenaltyMps: number
  launchDate: string
}

type EventBase = {
  id: string
  title: string
  description: string
  phase: MissionPhase
  triggerSecond: number
}

export type MissionEvent =
  | (EventBase & { type: 'insertion'; requiredDeltaVMps: number })
  | (EventBase & { type: 'eclipse'; extraPowerW: number; durationHours: number })
  | (EventBase & { type: 'communications'; blackoutSeconds: number })
  | (EventBase & {
    type: 'science'
    signalBonus: number
    requiredPowerW: number
    scienceOpportunityId: ScienceOpportunityId
  })

export type MissionScenario = {
  seed: number
  events: MissionEvent[]
}

export type MissionChoice = {
  id: string
  label: string
  description: string
}

export const MISSION_CHOICES: Record<MissionEventType, MissionChoice[]> = {
  insertion: [
    { id: 'nominal', label: 'Target the planned orbit', description: 'Spend the event’s nominal Δv requirement for a balanced capture.' },
    { id: 'conserve', label: 'Conserve maneuver reserve', description: 'Use less Δv, accepting a less favorable orbit and lower science yield.' },
    { id: 'precision', label: 'Prioritize precision capture', description: 'Spend extra Δv to improve orbital placement when reserve allows.' },
  ],
  eclipse: [
    { id: 'full-science', label: 'Maintain full science load', description: 'Keep current loads; outcome depends on eclipse power generation and stored battery energy.' },
    { id: 'low-power', label: 'Switch to low-power science', description: 'Shed 80 W of load; remaining power shortfall can still cause consequences.' },
    { id: 'hibernate', label: 'Hibernate payload systems', description: 'Power down the selected science instruments; they stay off until a later observation response explicitly restores them.' },
  ],
  communications: [
    { id: 'reacquire', label: 'Reacquire the selected link', description: 'Try to restore the link; recovery depends on the selected communications component and blackout duration.' },
    { id: 'buffer', label: 'Buffer and forward science data', description: 'Use onboard storage and the selected link’s illustrative return fraction.' },
    { id: 'reduced-rate', label: 'Return data at reduced rate', description: 'Send a smaller, robust data set and avoid spending time on a full link reacquisition.' },
  ],
  science: [
    { id: 'target-ice', label: 'Collect targeted instrument observations', description: 'Restore the selected instruments if hibernated; their full power draw is included before observations are scored.' },
    { id: 'map-rim', label: 'Map the crater rim and shadow context', description: 'Restore the selected instruments if hibernated; mapping yield uses their full power draw and available power.' },
    { id: 'stand-down', label: 'Stand down and preserve reserves', description: 'Skip the opportunity and shed 40 W of payload load for later mission phases.' },
  ],
}

export const SIMULATION_ASSUMPTIONS = [
  'Mission time is compressed to 75 seconds, split into five 15-second phases; decisions pause the clock.',
  'A seeded generator creates event severity and the order of the two South Pole Science events. The scenario is generated without spacecraft configuration.',
  'Illustrative Δv reserves are 420 m/s for cold-gas thrusters, 760 m/s for the bipropellant orbital engine, and 560 m/s for electric microthrusters. The chosen launch-window penalty is deducted from this reserve. Nominal insertion uses the seeded requirement; conserve uses max(120 m/s, requirement − 80 m/s); precision uses requirement + 60 m/s. An insertion shortfall subtracts 28 health points and prevents orbital observations. Successful insertion adds 4, 10, or 12 science points for conserve, nominal, or precision respectively.',
  'The illustrative full eclipse lasts 0.5 hours. Solar-array generation is 0 W during it; the radioisotope generator supplies its rated 320 W. A battery is optional storage carried alongside a generator, never a power source on its own: the illustrative battery stores 480 Wh and can discharge at up to its rated 240 W, with energy used equal to supplied W × eclipse hours. The mission has one eclipse, so in-flight recharging is not simulated; the builder checks that a generator leaves surplus power to recharge it. Eclipse demand is spacecraft load after shedding plus the seeded extra load; unused solar headroom is not counted. A shortfall causes min(25, 10 + ceil(shortfall / 20)) health-point damage. Low-power mode sheds 80 W; hibernation powers down the selected science instruments and sheds their combined illustrative draw. They remain off until a targeted science or mapping response explicitly restores them; restored instrument loads are included in spacecraft power demand. W, Wh and hours are separate quantities; all values are illustrative game assumptions.',
  'Illustrative link recovery windows are 24 seconds for X-band, 18 seconds for UHF, and 12 seconds for optical laser. Reacquire returns the link profile fraction when within the window and 45% of that fraction otherwise; buffer uses its profile fraction; reduced-rate returns 45%. These are game rules, not measured hardware performance.',
  'Instrument mass, power, cost, science yields, and evidence points are illustrative game values. NASA source links describe real instrument identities and capabilities only. If available power is below an event’s observation requirement, target/map yields are multiplied by 55%; those shortfalls also reduce health by 5/3 points respectively.',
  'Hydrogen, thermal, ultraviolet, and radar observations are separate evidence types. A potential water-ice candidate requires at least two distinct water-relevant evidence types and the illustrative point threshold. Neither a score nor any single observation confirms extractable water ice.',
]

export type MissionTelemetry = {
  deltaVRemainingMps: number
  orbitAchieved: boolean
  powerReliefW: number
  instrumentsHibernated: boolean
  batteryEnergyRemainingWh: number
  scienceProgress: number
  iceEvidencePoints: number
  terrainMapPoints: number
  dataCollectedPoints: number
  dataReturnedPoints: number
  health: number
}

export type MissionEventResult = {
  id: string
  type: MissionEventType
  title: string
  phase: MissionPhase
  choiceId: string
  choiceLabel: string
  outcome: string
  causalFactors: string[]
  scienceDelta: number
  healthDelta: number
  deltaVDeltaMps: number
  deltaVRequiredMps: number
  deltaVAvailableBeforeMps: number
  deltaVShortfallMps: number
  powerReliefDeltaW: number
  dataReturnedDelta: number
  eclipsePowerFlow?: EclipsePowerFlow
  scienceFindings: ScienceFinding[]
  scienceOpportunityId?: ScienceOpportunityId
}

export type EclipsePowerFlow = {
  demandW: number
  generationW: number
  batteryDischargeW: number
  suppliedW: number
  shortfallW: number
  durationHours: number
  batteryEnergyBeforeWh: number
  batteryEnergyUsedWh: number
  batteryEnergyRemainingWh: number
}

export type ScienceFinding = {
  instrumentId: ScienceInstrumentId
  instrumentName: string
  evidenceCategory: string
  modality: WaterEvidenceModality | null
  finding: string
  interpretation: string
  uncertainty: string
  sciencePoints: number
  waterEvidencePoints: number
  sourceUrls: string[]
}

export type MissionState = {
  seed: number
  scenario: MissionScenario
  design: MissionDesign
  status: MissionStatus
  elapsedSeconds: number
  phase: MissionPhase
  activeEventId: string | null
  telemetry: MissionTelemetry
  scienceFindings: ScienceFinding[]
  resolvedEvents: MissionEventResult[]
}

export type MissionAdvice = {
  role: 'Scientist' | 'Systems Engineer' | 'Finance Lead'
  recommendation: string
}

export type MissionObjective = {
  name: string
  complete: boolean
  value: number
  threshold: number
  unit: string
  detail: string
}

export type MissionRecommendation = {
  objective: string
  text: string
}

export type ScienceSynthesis = {
  classification: string
  evidenceModalities: WaterEvidenceModality[]
  independentModalitiesRequired: number
  detail: string
}

export type MissionDebrief = {
  seed: number
  scenario: MissionScenario
  design: MissionDesign
  result: MissionResult
  scores: {
    science: number
    reliability: number
    budgetRemaining: number
    margins: number
  }
  objectives: {
    primary: MissionObjective
    bonus: MissionObjective[]
  }
  marginBreakdown: {
    massKg: number
    powerW: number
    budgetK: number
  }
  telemetry: MissionTelemetry
  scienceFindings: ScienceFinding[]
  scienceSynthesis: ScienceSynthesis
  eventResults: MissionEventResult[]
  recommendations: MissionRecommendation[]
}

export type MissionAction =
  | { type: 'START'; seed: number; design: MissionDesign }
  | { type: 'TICK' }
  | { type: 'RESOLVE_EVENT'; eventId: string; choiceId: string }

const PROPULSION_RESERVE_MPS: Record<string, number> = {
  'cold-gas': 420,
  bipropellant: 760,
  electric: 560,
}

const COMMUNICATION_PROFILES: Record<string, { recoveryWindowSeconds: number; recoveryReturnPercent: number; bufferReturnPercent: number }> = {
  'x-band': { recoveryWindowSeconds: 24, recoveryReturnPercent: 82, bufferReturnPercent: 84 },
  uhf: { recoveryWindowSeconds: 18, recoveryReturnPercent: 68, bufferReturnPercent: 88 },
  laser: { recoveryWindowSeconds: 12, recoveryReturnPercent: 92, bufferReturnPercent: 76 },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createScienceFinding(instrumentId: ScienceInstrumentId, powerFraction: number): ScienceFinding {
  const instrument = getScienceInstrument(instrumentId)
  const profile = SCIENCE_GAME_PROFILES[instrumentId]
  const evidenceRule = LUNAR_SCIENCE_DATA.science_discovery_rules.evidence_categories.find(
    (category) => category.instrument === instrumentId,
  )

  return {
    instrumentId,
    instrumentName: instrument.name,
    evidenceCategory: evidenceRule?.category ?? instrument.game_mapping.mechanics[0],
    modality: profile.evidenceModality ?? null,
    finding: instrument.game_mapping.player_feedback,
    interpretation: getWaterEvidenceInterpretation(instrument),
    uncertainty: instrument.scientific_limitation
      ?? 'This observation is not standalone confirmation of water composition, presence, or accessibility.',
    sciencePoints: Math.round(profile.sciencePoints * powerFraction),
    waterEvidencePoints: Math.round(profile.waterEvidencePoints * powerFraction),
    sourceUrls: instrument.source_urls,
  }
}

function makeRandom(seed: number) {
  let state = seed >>> 0
  if (state === 0) state = 0x6d2b79f5

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function randomInteger(random: () => number, min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1))
}

export function generateMissionScenario(seed: number): MissionScenario {
  const normalizedSeed = seed >>> 0
  const random = makeRandom(normalizedSeed)
  const insertion: MissionEvent = {
    id: 'orbital-insertion',
    type: 'insertion',
    title: 'Lunar orbit insertion window',
    description: 'The capture corridor is narrower than planned. Select how to spend the available maneuver reserve.',
    phase: 'Lunar Orbit Insertion',
    triggerSecond: 30,
    requiredDeltaVMps: randomInteger(random, 280, 380),
  }
  const eclipse: MissionEvent = {
    id: 'eclipse-power',
    type: 'eclipse',
    title: 'South-pole eclipse power shortage',
    description: 'The orbiter enters a full eclipse for 0.5 illustrative hours; solar generation falls to zero while spacecraft demand continues.',
    phase: 'South Pole Science',
    triggerSecond: 45,
    extraPowerW: randomInteger(random, 90, 190),
    durationHours: 0.5,
  }
  const science: MissionEvent = {
    id: 'science-opportunity',
    type: 'science',
    title: 'South-pole science opportunity',
    description: 'The science team identifies an observation target. Select an observation strategy.',
    phase: 'South Pole Science',
    triggerSecond: 51,
    signalBonus: randomInteger(random, 14, 28),
    requiredPowerW: randomInteger(random, 80, 160),
    scienceOpportunityId: 'HYDROGEN_ANOMALY',
  }
  const communications: MissionEvent = {
    id: 'communications-interruption',
    type: 'communications',
    title: 'Earth link interruption',
    description: 'The downlink fades during a ground-station handoff. Decide how to protect the collected data.',
    phase: 'Data Return',
    triggerSecond: 60,
    blackoutSeconds: randomInteger(random, 10, 30),
  }

  const sciencePhaseEvents = random() < 0.5 ? [eclipse, science] : [science, eclipse]
  const scienceOpportunity = LUNAR_SCIENCE_DATA.mission_events[
    randomInteger(random, 0, LUNAR_SCIENCE_DATA.mission_events.length - 1)
  ]
  const scheduledScienceEvents = sciencePhaseEvents.map((event, index) => ({
    ...event,
    triggerSecond: 45 + index * 6,
    ...(event.type === 'science'
      ? {
        title: scienceOpportunity.name,
        description: scienceOpportunity.event_description,
        scienceOpportunityId: scienceOpportunity.id,
      }
      : {}),
  }))

  return {
    seed: normalizedSeed,
    events: [insertion, ...scheduledScienceEvents, communications],
  }
}

export function getMissionPhase(elapsedSeconds: number): MissionPhase {
  const phaseIndex = Math.min(Math.floor(elapsedSeconds / 15), MISSION_PHASES.length - 1)
  return MISSION_PHASES[phaseIndex]
}

export function getMissionChoices(event: MissionEvent) {
  return MISSION_CHOICES[event.type]
}

export function createMissionState(seed: number, design: MissionDesign): MissionState {
  const scenario = generateMissionScenario(seed)
  const propulsionReserve = PROPULSION_RESERVE_MPS[design.propulsionId] ?? 0

  return {
    seed: scenario.seed,
    scenario,
    design,
    status: 'running',
    elapsedSeconds: 0,
    phase: MISSION_PHASES[0],
    activeEventId: null,
    telemetry: {
      deltaVRemainingMps: propulsionReserve - design.launchPenaltyMps,
      orbitAchieved: false,
      powerReliefW: 0,
      instrumentsHibernated: false,
      batteryEnergyRemainingWh: design.batteryEnergyCapacityWh,
      scienceProgress: 0,
      iceEvidencePoints: 0,
      terrainMapPoints: 0,
      dataCollectedPoints: 0,
      dataReturnedPoints: 0,
      health: 100,
    },
    scienceFindings: [],
    resolvedEvents: [],
  }
}

function updateTelemetry(telemetry: MissionTelemetry, changes: Partial<MissionTelemetry>): MissionTelemetry {
  const updated = { ...telemetry, ...changes }
  updated.scienceProgress = clamp(updated.scienceProgress, 0, 100)
  updated.iceEvidencePoints = clamp(updated.iceEvidencePoints, 0, 100)
  updated.terrainMapPoints = clamp(updated.terrainMapPoints, 0, 100)
  updated.dataCollectedPoints = clamp(updated.dataCollectedPoints, 0, 100)
  updated.dataReturnedPoints = clamp(updated.dataReturnedPoints, 0, updated.dataCollectedPoints)
  updated.health = clamp(updated.health, 0, 100)
  updated.powerReliefW = Math.max(0, updated.powerReliefW)
  updated.batteryEnergyRemainingWh = clamp(updated.batteryEnergyRemainingWh, 0, telemetry.batteryEnergyRemainingWh)
  return updated
}

function getScienceInstrumentPowerDrawW(design: MissionDesign) {
  return design.instrumentIds.reduce(
    (total, instrumentId) => total + SCIENCE_GAME_PROFILES[instrumentId].powerDrawW,
    0,
  )
}

export function getMissionPowerHeadroom(state: Pick<MissionState, 'design' | 'telemetry'>) {
  return state.design.powerMarginW
    + state.telemetry.powerReliefW
    + (state.telemetry.instrumentsHibernated ? getScienceInstrumentPowerDrawW(state.design) : 0)
}

function calculateEclipsePowerFlow(
  state: MissionState,
  event: Extract<MissionEvent, { type: 'eclipse' }>,
  additionalLoadShedW: number,
): EclipsePowerFlow {
  const design = state.design
  const telemetry = state.telemetry
  const hibernatedInstrumentLoadW = telemetry.instrumentsHibernated
    ? getScienceInstrumentPowerDrawW(design)
    : 0
  const demandW = Math.max(
    0,
    design.powerLoadW - telemetry.powerReliefW - hibernatedInstrumentLoadW - additionalLoadShedW,
  )
    + event.extraPowerW
  // Generation and storage are separate equipment. In a full eclipse only the generator's eclipse
  // output counts as generation; the battery adds discharge, limited by both its W limit and its Wh.
  const generationW = design.eclipseGenerationW
  const batteryEnergyBeforeWh = telemetry.batteryEnergyRemainingWh
  const batteryDischargeLimitW = design.batteryEnergyCapacityWh > 0 ? design.batteryDischargeLimitW : 0
  const batteryEnergyLimitedPowerW = event.durationHours > 0
    ? batteryEnergyBeforeWh / event.durationHours
    : 0
  const batteryDischargeW = Math.min(
    Math.max(0, demandW - generationW),
    batteryDischargeLimitW,
    batteryEnergyLimitedPowerW,
  )
  const suppliedW = Math.min(demandW, generationW + batteryDischargeW)
  const batteryEnergyUsedWh = batteryDischargeW * event.durationHours

  return {
    demandW,
    generationW,
    batteryDischargeW,
    suppliedW,
    shortfallW: Math.max(0, demandW - suppliedW),
    durationHours: event.durationHours,
    batteryEnergyBeforeWh,
    batteryEnergyUsedWh,
    batteryEnergyRemainingWh: Math.max(0, batteryEnergyBeforeWh - batteryEnergyUsedWh),
  }
}

function recordUnavailableOrbitalEvent(state: MissionState, event: MissionEvent): MissionState {
  const insertion = state.resolvedEvents.find((result) => result.type === 'insertion')
  const requiredMps = insertion?.deltaVRequiredMps ?? 0
  const availableMps = insertion?.deltaVAvailableBeforeMps ?? 0
  const shortfallMps = insertion?.deltaVShortfallMps ?? Math.max(0, requiredMps - availableMps)
  const result: MissionEventResult = {
    id: event.id,
    type: event.type,
    title: event.title,
    phase: event.phase,
    choiceId: 'orbit-unavailable',
    choiceLabel: 'Orbital opportunity unavailable',
    outcome: `No orbital observation occurred because lunar orbit insertion failed: ${requiredMps} m/s was required and only ${availableMps} m/s was available, a ${shortfallMps} m/s shortfall.`,
    causalFactors: [
      `The spacecraft did not achieve lunar orbit; the insertion maneuver was short by ${shortfallMps} m/s.`,
      `This ${event.type === 'eclipse' ? 'orbital eclipse response' : 'South Pole science opportunity'} was unavailable, so no science or data-return rewards were recorded.`,
    ],
    scienceDelta: 0,
    healthDelta: 0,
    deltaVDeltaMps: 0,
    deltaVRequiredMps: 0,
    deltaVAvailableBeforeMps: 0,
    deltaVShortfallMps: 0,
    powerReliefDeltaW: 0,
    dataReturnedDelta: 0,
    scienceFindings: [],
    scienceOpportunityId: event.type === 'science' ? event.scienceOpportunityId : undefined,
  }

  return {
    ...state,
    status: 'running',
    activeEventId: null,
    resolvedEvents: [...state.resolvedEvents, result],
  }
}

function resolveEvent(state: MissionState, event: MissionEvent, choice: MissionChoice): MissionState {
  if (!state.telemetry.orbitAchieved && (event.type === 'eclipse' || event.type === 'science')) {
    return recordUnavailableOrbitalEvent(state, event)
  }

  const before = state.telemetry
  let telemetry = before
  let outcome = ''
  let causalFactors: string[] = []
  let scienceDelta = 0
  let healthDelta = 0
  let deltaVDeltaMps = 0
  let deltaVRequiredMps = 0
  let deltaVAvailableBeforeMps = 0
  let deltaVShortfallMps = 0
  let powerReliefDeltaW = 0
  let dataReturnedDelta = 0
  let scienceFindings: ScienceFinding[] = []
  let eclipsePowerFlow: EclipsePowerFlow | undefined

  if (event.type === 'insertion') {
    const burnMps = choice.id === 'conserve'
      ? Math.max(120, event.requiredDeltaVMps - 80)
      : choice.id === 'precision'
        ? event.requiredDeltaVMps + 60
        : event.requiredDeltaVMps
    const remainingBefore = before.deltaVRemainingMps
    deltaVRequiredMps = burnMps
    deltaVAvailableBeforeMps = Math.max(0, remainingBefore)
    const hasReserve = remainingBefore >= burnMps
    const actualBurnMps = hasReserve ? burnMps : Math.max(0, remainingBefore)
    deltaVDeltaMps = -actualBurnMps
    deltaVShortfallMps = Math.max(0, burnMps - actualBurnMps)

    if (hasReserve) {
      scienceDelta = choice.id === 'precision' ? 12 : choice.id === 'nominal' ? 10 : 4
      outcome = `${choice.label} completed using ${burnMps} m/s; ${Math.round(remainingBefore - burnMps)} m/s remains.`
    } else {
      healthDelta = -28
      outcome = `The burn required ${burnMps} m/s but only ${Math.round(deltaVAvailableBeforeMps)} m/s was available, a ${Math.round(deltaVShortfallMps)} m/s shortfall; lunar orbit was not achieved.`
    }

    telemetry = updateTelemetry(before, {
      deltaVRemainingMps: Math.max(0, remainingBefore - actualBurnMps),
      orbitAchieved: hasReserve,
      scienceProgress: before.scienceProgress + scienceDelta,
      dataCollectedPoints: before.dataCollectedPoints + scienceDelta,
      health: before.health + healthDelta,
    })
    causalFactors = [
      `${state.design.propulsionName} has an illustrative reserve of ${PROPULSION_RESERVE_MPS[state.design.propulsionId] ?? 0} m/s.`,
      `The selected ${state.design.launchDate} window applies a ${state.design.launchPenaltyMps} m/s penalty, leaving ${Math.round(remainingBefore)} m/s before this decision.`,
      `The ${choice.label.toLowerCase()} response required ${burnMps} m/s against a seeded ${event.requiredDeltaVMps} m/s nominal insertion requirement.`,
      ...(!hasReserve ? [`Only ${Math.round(actualBurnMps)} m/s could be spent; the remaining ${Math.round(deltaVShortfallMps)} m/s shortfall prevented lunar orbit and all later orbital observations.`] : []),
    ]
  } else if (event.type === 'eclipse') {
    powerReliefDeltaW = choice.id === 'low-power' ? 80 : 0
    const hibernatedLoadShedW = choice.id === 'hibernate' && !before.instrumentsHibernated
      ? getScienceInstrumentPowerDrawW(state.design)
      : 0
    const eventLoadShedW = powerReliefDeltaW + hibernatedLoadShedW
    const powerFlow = calculateEclipsePowerFlow(state, event, eventLoadShedW)
    eclipsePowerFlow = powerFlow
    if (choice.id === 'full-science') {
      scienceDelta = powerFlow.shortfallW === 0 ? 10 : 0
    } else if (choice.id === 'low-power') {
      scienceDelta = powerFlow.shortfallW === 0 ? 4 : 0
    } else if (powerFlow.shortfallW === 0) {
      healthDelta = 2
    }

    if (powerFlow.shortfallW > 0) {
      healthDelta = -Math.min(25, 10 + Math.ceil(powerFlow.shortfallW / 20))
    }
    const energyOutcome = state.design.batteryEnergyCapacityWh > 0
      ? `${Math.round(powerFlow.batteryEnergyUsedWh)} Wh of stored energy was used; ${Math.round(powerFlow.batteryEnergyRemainingWh)} Wh remains.`
      : '0 Wh of stored battery energy was available (no battery installed).'
    outcome = `During the ${powerFlow.durationHours} h illustrative full eclipse, demand was ${Math.round(powerFlow.demandW)} W and generation supplied ${Math.round(powerFlow.generationW)} W; battery discharge supplied ${Math.round(powerFlow.batteryDischargeW)} W. Power shortfall was ${Math.round(powerFlow.shortfallW)} W. ${energyOutcome}${scienceDelta > 0 ? ` ${scienceDelta} science points were collected.` : ' No eclipse science reward was earned.'}${healthDelta < 0 ? ` Spacecraft health fell by ${Math.abs(healthDelta)} points.` : ''}`

    telemetry = updateTelemetry(before, {
      powerReliefW: before.powerReliefW + powerReliefDeltaW,
      instrumentsHibernated: before.instrumentsHibernated || choice.id === 'hibernate',
      scienceProgress: before.scienceProgress + scienceDelta,
      dataCollectedPoints: before.dataCollectedPoints + scienceDelta,
      health: before.health + healthDelta,
      batteryEnergyRemainingWh: powerFlow.batteryEnergyRemainingWh,
    })
    causalFactors = [
      `Full-eclipse demand was ${Math.round(powerFlow.demandW)} W for ${powerFlow.durationHours} h after ${Math.round(eventLoadShedW)} W of load shedding${hibernatedLoadShedW > 0 ? `, including ${Math.round(hibernatedLoadShedW)} W from hibernated science instruments` : ''}; instantaneous solar generation is 0 W in eclipse.`,
      `The ${state.design.powerName} supplied ${Math.round(powerFlow.generationW)} W generation and ${state.design.batteryName ? `the ${state.design.batteryName} supplied` : 'no battery was installed, so there was'} ${Math.round(powerFlow.batteryDischargeW)} W battery discharge, leaving a ${Math.round(powerFlow.shortfallW)} W shortfall.`,
      `${Math.round(powerFlow.batteryEnergyBeforeWh)} Wh stored before the eclipse; ${Math.round(powerFlow.batteryEnergyUsedWh)} Wh used and ${Math.round(powerFlow.batteryEnergyRemainingWh)} Wh remain. Battery capacity and duration are illustrative.`,
    ]
  } else if (event.type === 'science') {
    const opportunity = getScienceOpportunity(event.scienceOpportunityId)
    const availablePower = state.design.powerMarginW + before.powerReliefW
    const powerShortfall = Math.max(0, event.requiredPowerW - availablePower)
    const poweredFraction = powerShortfall > 0 ? 0.55 : 1

    if (choice.id === 'target-ice' || choice.id === 'map-rim') {
      const restoredInstrumentPowerW = before.instrumentsHibernated
        ? getScienceInstrumentPowerDrawW(state.design)
        : 0
      const observationPriority = choice.id === 'target-ice' ? 1 : 0.55
      scienceFindings = state.design.instrumentIds.map((instrumentId) =>
        createScienceFinding(instrumentId, poweredFraction * observationPriority),
      )
      const waterFindings = scienceFindings.filter((finding) => finding.modality !== null)
      const effectiveSignalBonus = Math.round(event.signalBonus * poweredFraction)
      const evidenceGain = waterFindings.reduce((sum, finding) => sum + finding.waterEvidencePoints, 0)
        + (choice.id === 'target-ice' && waterFindings.length > 0 ? effectiveSignalBonus : 0)
      const observationScience = scienceFindings.reduce((sum, finding) => sum + finding.sciencePoints, 0)
      const signalScience = choice.id === 'target-ice' && waterFindings.length > 0
        ? effectiveSignalBonus
        : Math.floor(effectiveSignalBonus / 2)
      scienceDelta = observationScience + signalScience
      const terrainGain = choice.id === 'map-rim'
        ? Math.round((state.design.instrumentIds.reduce(
          (sum, instrumentId) => sum + SCIENCE_GAME_PROFILES[instrumentId].terrainPoints,
          0,
        ) + event.signalBonus) * poweredFraction)
        : 0
      healthDelta = powerShortfall > 0 ? choice.id === 'target-ice' ? -5 : -3 : 0
      telemetry = updateTelemetry(before, {
        scienceProgress: before.scienceProgress + scienceDelta,
        iceEvidencePoints: before.iceEvidencePoints + evidenceGain,
        terrainMapPoints: before.terrainMapPoints + terrainGain,
        dataCollectedPoints: before.dataCollectedPoints + scienceDelta,
        health: before.health + healthDelta,
        instrumentsHibernated: false,
      })
      const modalities = [...new Set(waterFindings.map((finding) => finding.modality))]
      const evidenceSummary = modalities.length >= 2
        ? `${modalities.length} distinct water-relevant measurement types were collected together; the result remains a potential candidate, not confirmation of extractable ice.`
        : modalities.length === 1
          ? `Only ${modalities[0]} evidence was collected; an independent measurement type is needed before classifying a potential ice candidate.`
          : 'No selected instrument collected a water-relevant measurement in this observation.'
      outcome = choice.id === 'target-ice'
        ? `${opportunity.name}: ${scienceFindings.length} selected instrument observation${scienceFindings.length === 1 ? '' : 's'} recorded ${evidenceGain} illustrative water-evidence points. ${restoredInstrumentPowerW > 0 ? `The hibernated instruments were restored; their full ${restoredInstrumentPowerW} W draw was included in the power check. ` : ''}${evidenceSummary}`
        : `The crater-rim mapping strategy recorded ${terrainGain} illustrative terrain points and ${scienceFindings.length} instrument observation${scienceFindings.length === 1 ? '' : 's'}. ${restoredInstrumentPowerW > 0 ? `The hibernated instruments were restored; their full ${restoredInstrumentPowerW} W draw was included in the power check. ` : ''}${evidenceSummary}`
      causalFactors = [
        `Selected instruments: ${scienceFindings.map((finding) => `${finding.instrumentName} (${finding.evidenceCategory})`).join('; ') || 'none'}.`,
        `${restoredInstrumentPowerW > 0 ? `The hibernated payload was restored; its ${restoredInstrumentPowerW} W base draw is already included in the spacecraft design load. ` : ''}Available power was ${availablePower} W against a ${event.requiredPowerW} W observation requirement${powerShortfall > 0 ? `, a ${powerShortfall} W shortfall that reduced observation yield` : ''}.`,
        `The ${choice.label.toLowerCase()} response recorded ${evidenceGain} illustrative water-evidence points, ${terrainGain} terrain points, and ${scienceDelta} science points.`,
        `The seeded opportunity recommends ${opportunity.recommended_instruments.join(', ')}; only selected, powered instruments contribute observations.`,
      ]
    } else {
      powerReliefDeltaW = 40
      telemetry = updateTelemetry(before, { powerReliefW: before.powerReliefW + powerReliefDeltaW })
      outcome = `${opportunity.name} was deferred; payload load fell by 40 W and no instrument evidence was collected.`
      causalFactors = [
        `Selected instruments were ${state.design.instrumentNames.join(', ')}; the team chose not to task them for this opportunity.`,
        `The ${choice.label.toLowerCase()} response preserved 40 W of power headroom.`,
        `No water-evidence or terrain-mapping points were added.`,
      ]
    }
  } else {
    const profile = COMMUNICATION_PROFILES[state.design.communicationsId] ?? COMMUNICATION_PROFILES['x-band']
    let returnPercent: number

    if (choice.id === 'reacquire') {
      const recovered = event.blackoutSeconds <= profile.recoveryWindowSeconds
      returnPercent = recovered ? profile.recoveryReturnPercent : Math.round(profile.recoveryReturnPercent * 0.45)
      outcome = recovered
        ? `The ${state.design.communicationsName} link recovered within its illustrative ${profile.recoveryWindowSeconds} s window; ${returnPercent}% of collected science data was returned.`
        : `The ${event.blackoutSeconds} s blackout exceeded the ${profile.recoveryWindowSeconds} s recovery window; only ${returnPercent}% of collected science data was returned.`
    } else if (choice.id === 'buffer') {
      returnPercent = profile.bufferReturnPercent
      outcome = `Store-and-forward preserved ${returnPercent}% of collected science data using the ${state.design.communicationsName} link.`
    } else {
      returnPercent = 45
      healthDelta = 3
      outcome = `The reduced-rate transmission returned ${returnPercent}% of collected science data and added 3 health points by avoiding a prolonged reacquisition attempt.`
    }

    const targetReturned = Math.round(before.dataCollectedPoints * returnPercent / 100)
    dataReturnedDelta = Math.max(0, targetReturned - before.dataReturnedPoints)
    telemetry = updateTelemetry(before, {
      dataReturnedPoints: before.dataReturnedPoints + dataReturnedDelta,
      health: before.health + healthDelta,
    })
    causalFactors = [
      `The selected ${state.design.communicationsName} link has an illustrative ${profile.recoveryWindowSeconds} s recovery window and ${profile.bufferReturnPercent}% buffer return fraction.`,
      `The seeded interruption lasted ${event.blackoutSeconds} s; the chosen ${choice.label.toLowerCase()} response returned ${dataReturnedDelta} additional data points.`,
      `The remaining ${Math.max(0, telemetry.dataCollectedPoints - telemetry.dataReturnedPoints)} data points were not returned in this compressed mission.`,
    ]
  }

  const result: MissionEventResult = {
    id: event.id,
    type: event.type,
    title: event.title,
    phase: event.phase,
    choiceId: choice.id,
    choiceLabel: choice.label,
    outcome,
    causalFactors,
    scienceDelta,
    healthDelta,
    deltaVDeltaMps,
    deltaVRequiredMps,
    deltaVAvailableBeforeMps,
    deltaVShortfallMps,
    powerReliefDeltaW,
    dataReturnedDelta,
    eclipsePowerFlow,
    scienceFindings,
    scienceOpportunityId: event.type === 'science' ? event.scienceOpportunityId : undefined,
  }

  return {
    ...state,
    status: 'running',
    activeEventId: null,
    telemetry,
    scienceFindings: [...state.scienceFindings, ...scienceFindings],
    resolvedEvents: [...state.resolvedEvents, result],
  }
}

export function missionReducer(state: MissionState | null, action: MissionAction): MissionState | null {
  if (action.type === 'START') return createMissionState(action.seed, action.design)
  if (!state) return state

  if (action.type === 'TICK') {
    if (state.status !== 'running') return state
    const nextElapsed = Math.min(state.elapsedSeconds + 1, MISSION_DURATION_SECONDS)
    const resolvedIds = new Set(state.resolvedEvents.map((event) => event.id))
    const nextEvent = state.scenario.events.find((event) =>
      event.triggerSecond <= nextElapsed && !resolvedIds.has(event.id),
    )

    if (nextEvent) {
      if (
        !state.telemetry.orbitAchieved
        && (nextEvent.type === 'eclipse' || nextEvent.type === 'science')
      ) {
        return {
          ...recordUnavailableOrbitalEvent(state, nextEvent),
          elapsedSeconds: nextEvent.triggerSecond,
          phase: nextEvent.phase,
        }
      }

      return {
        ...state,
        status: 'awaiting-decision',
        elapsedSeconds: nextEvent.triggerSecond,
        phase: nextEvent.phase,
        activeEventId: nextEvent.id,
      }
    }

    return {
      ...state,
      elapsedSeconds: nextElapsed,
      phase: getMissionPhase(nextElapsed),
      status: nextElapsed >= MISSION_DURATION_SECONDS ? 'complete' : 'running',
    }
  }

  if (state.status !== 'awaiting-decision' || state.activeEventId !== action.eventId) return state
  const event = state.scenario.events.find((candidate) => candidate.id === state.activeEventId)
  const choice = event && getMissionChoices(event).find((candidate) => candidate.id === action.choiceId)
  return event && choice ? resolveEvent(state, event, choice) : state
}

export function getCurrentMissionEvent(state: MissionState): MissionEvent | null {
  return state.activeEventId
    ? state.scenario.events.find((event) => event.id === state.activeEventId) ?? null
    : null
}

export function getMissionAdvice(event: MissionEvent, state: MissionState): MissionAdvice[] {
  const powerMargin = state.design.powerMarginW + state.telemetry.powerReliefW

  if (event.type === 'insertion') {
    return [
      { role: 'Scientist', recommendation: 'Favor a stable low orbit to improve south-pole observation coverage.' },
      {
        role: 'Systems Engineer',
        recommendation: `The ${state.design.propulsionName} leaves ${Math.round(state.telemetry.deltaVRemainingMps)} m/s after the launch-window penalty; compare that with the ${event.requiredDeltaVMps} m/s nominal burn.`,
      },
      { role: 'Finance Lead', recommendation: 'The planned burn uses less maneuver reserve than a precision capture; avoid spending reserve without a measured benefit.' },
    ]
  }

  if (event.type === 'eclipse') {
    const powerFlow = calculateEclipsePowerFlow(state, event, 0)
    return [
      { role: 'Scientist', recommendation: 'Continue observations only if the power system can support the eclipse load.' },
      {
        role: 'Systems Engineer',
        recommendation: `For this ${event.durationHours} h eclipse, demand is ${Math.round(powerFlow.demandW)} W; the system supplies ${Math.round(powerFlow.generationW)} W generation plus ${Math.round(powerFlow.batteryDischargeW)} W battery discharge. Shortfall: ${Math.round(powerFlow.shortfallW)} W; stored energy: ${Math.round(powerFlow.batteryEnergyBeforeWh)} Wh.`,
      },
      { role: 'Finance Lead', recommendation: 'Load shedding avoids consuming extra resources; hibernation sacrifices this observation window.' },
    ]
  }

  if (event.type === 'communications') {
    return [
      { role: 'Scientist', recommendation: 'Protect the science backlog; retransmitting may be preferable to discarding observations.' },
      {
        role: 'Systems Engineer',
        recommendation: `${state.design.communicationsName} has an illustrative ${COMMUNICATION_PROFILES[state.design.communicationsId]?.recoveryWindowSeconds ?? 0} s recovery window versus a ${event.blackoutSeconds} s interruption.`,
      },
      { role: 'Finance Lead', recommendation: 'A reduced-rate return protects reliability but sends fewer science points in this mission.' },
    ]
  }

  const opportunity = getScienceOpportunity(event.scienceOpportunityId)
  return [
    { role: 'Scientist', recommendation: `${opportunity.scientific_basis} Compare observations across instruments; no single measurement establishes extractable ice.` },
    {
      role: 'Systems Engineer',
      recommendation: `${state.design.instrumentNames.join(' + ')} have ${powerMargin} W power headroom after accounting for their base load; the observation requires another ${event.requiredPowerW} W.${state.telemetry.instrumentsHibernated ? ` Restoring the hibernated instruments reactivates their ${getScienceInstrumentPowerDrawW(state.design)} W draw, already included in the design load.` : ''}`,
    },
    { role: 'Finance Lead', recommendation: 'Stand-down preserves power headroom, while either observation adds data that must still be returned.' },
  ]
}

export function calculateMissionDebrief(state: MissionState): MissionDebrief {
  const telemetry = state.telemetry
  const design = state.design
  const science = Math.round(telemetry.scienceProgress)
  const reliability = Math.round(telemetry.health)
  const finalPowerMarginW = getMissionPowerHeadroom(state)
  const budgetRemaining = clamp(Math.round((design.budgetMarginK / design.budgetLimitK) * 100), 0, 100)
  const massMarginScore = clamp((design.massMarginKg / design.massLimitKg) * 100, 0, 100)
  const powerMarginScore = clamp((finalPowerMarginW / Math.max(1, design.powerCapacityW)) * 100, 0, 100)
  const budgetMarginScore = clamp((design.budgetMarginK / design.budgetLimitK) * 100, 0, 100)
  const margins = Math.round((massMarginScore + powerMarginScore + budgetMarginScore) / 3)
  const primaryValue = Math.round(telemetry.iceEvidencePoints)
  const terrainValue = Math.round(telemetry.terrainMapPoints)
  const dataValue = Math.round(telemetry.dataReturnedPoints)
  const primaryThreshold = 45
  const terrainThreshold = 35
  const dataThreshold = 35
  const evidenceModalities = [...new Set(state.scienceFindings.flatMap((finding) =>
    finding.modality ? [finding.modality] : [],
  ))]
  const primaryComplete = telemetry.orbitAchieved
    && primaryValue >= primaryThreshold
    && evidenceModalities.length >= 2
  const terrainComplete = terrainValue >= terrainThreshold
  const dataComplete = dataValue >= dataThreshold
  const result: MissionResult = !telemetry.orbitAchieved
    ? 'Failure'
    : primaryComplete && science >= 60 && reliability >= 70
      ? 'Success'
      : reliability >= 35 && (primaryComplete || science >= 35)
        ? 'Partial Success'
        : 'Failure'

  const scienceEvent = state.resolvedEvents.find((event) => event.type === 'science')
  const communicationsEvent = state.resolvedEvents.find((event) => event.type === 'communications')
  const insertionEvent = state.resolvedEvents.find((event) => event.type === 'insertion')
  const selectedInstrumentNames = design.instrumentNames.join(' + ')
  const selectedTerrainPoints = design.instrumentIds.reduce(
    (sum, instrumentId) => sum + SCIENCE_GAME_PROFILES[instrumentId].terrainPoints,
    0,
  )
  const communicationsProfile = COMMUNICATION_PROFILES[design.communicationsId] ?? COMMUNICATION_PROFILES['x-band']
  const evidenceCountGuidance = !telemetry.orbitAchieved
    ? 'No water evidence was collected because the spacecraft did not reach lunar orbit.'
    : evidenceModalities.length < 2
      ? `Recorded ${evidenceModalities.length} of 2 required distinct water-evidence types (${evidenceModalities.join(', ') || 'none'}). Pair the current payload with a different measurement type: neutron data for hydrogen, thermal data for cold-trap conditions, ultraviolet data for a possible frost signature, or radar data for surface/subsurface properties.`
      : `Recorded ${evidenceModalities.length} independent evidence types (${evidenceModalities.join(', ')}); preserve power and collect a targeted observation to meet the ${primaryThreshold}-point threshold.`
  const recommendations: MissionRecommendation[] = []
  if (!primaryComplete) {
    const primaryPlan = !telemetry.orbitAchieved
      ? `Lunar orbit was not achieved; insertion was short by ${Math.round(insertionEvent?.deltaVShortfallMps ?? 0)} m/s. Correct the propulsion reserve or launch-window penalty before attempting orbital observations.`
      : `Choose “Collect targeted instrument observations”${scienceEvent && scienceEvent.choiceId !== 'target-ice' ? ` rather than the recorded “${scienceEvent.choiceLabel}” response` : ''}.`
    const primaryConclusion = telemetry.orbitAchieved
      ? 'Any resulting classification remains a potential candidate, never confirmation of extractable ice.'
      : 'No candidate classification was possible because no orbital measurements were collected.'
    recommendations.push({
      objective: 'Primary objective — investigate potential water ice',
      text: `Recorded ${primaryValue} / ${primaryThreshold} illustrative evidence points with ${evidenceModalities.length} distinct water-relevant evidence type${evidenceModalities.length === 1 ? '' : 's'}. ${primaryPlan} Selected payload: ${selectedInstrumentNames}. ${evidenceCountGuidance} ${primaryConclusion}`,
    })
  }
  if (!terrainComplete) {
    const terrainPlan = !telemetry.orbitAchieved
      ? 'Resolve the propulsion shortfall and achieve lunar orbit before attempting crater-rim mapping.'
      : `Select “Map the crater rim and shadow context”${scienceEvent && scienceEvent.choiceId !== 'map-rim' ? `; this run chose “${scienceEvent.choiceLabel}”` : ''}.`
    recommendations.push({
      objective: 'Bonus objective — map safe landing terrain',
      text: `Recorded ${terrainValue} / ${terrainThreshold} illustrative terrain-mapping points. ${terrainPlan} The selected payloads provide ${selectedTerrainPoints} illustrative base terrain points; LOLA topography and LROC imagery are source-backed options for mapping and visual context.`,
    })
  }
  if (!dataComplete) {
    const dataPlan = !telemetry.orbitAchieved
      ? 'No data were collected because lunar orbit was not achieved; correct the insertion shortfall before optimizing the downlink.'
      : communicationsEvent && communicationsEvent.choiceId === 'buffer'
        ? 'This run used buffer-and-forward; increase science data collection before the data-return phase.'
        : 'At the communications interruption, choose “Buffer and forward science data”.'
    recommendations.push({
      objective: 'Bonus objective — maximize science data returned',
      text: `Recorded ${dataValue} / ${dataThreshold} illustrative returned data points from ${Math.round(telemetry.dataCollectedPoints)} collected. ${dataPlan} The current ${design.communicationsName} profile has an illustrative ${communicationsProfile.bufferReturnPercent}% buffer return fraction.`,
    })
  }
  if (!telemetry.orbitAchieved && insertionEvent) {
    recommendations.push({
      objective: 'Engineering — failed lunar orbit insertion',
      text: `Insertion required ${insertionEvent.deltaVRequiredMps} m/s, but only ${Math.round(insertionEvent.deltaVAvailableBeforeMps)} m/s was available (${Math.round(insertionEvent.deltaVShortfallMps)} m/s short). Lunar orbit was not achieved, so the eclipse and South Pole observation events yielded no orbital science or data. Increase maneuver reserve or choose a lower-penalty launch window before the next run.`,
    })
  }
  if (design.powerMarginW < 80 || telemetry.health < 70) {
    recommendations.push({
      objective: 'Engineering — power and health',
      text: `Increase power headroom with a higher-output generator, add a battery to carry loads through the eclipse, or shed payload load before it. Recorded margin: ${Math.round(finalPowerMarginW)} W; spacecraft health: ${reliability}/100.`,
    })
  }
  if (telemetry.orbitAchieved && telemetry.deltaVRemainingMps < 100) {
    recommendations.push({
      objective: 'Engineering — orbital insertion',
      text: `Compare the available Δv reserve (${Math.round(telemetry.deltaVRemainingMps)} m/s remaining) with the insertion requirement before committing. Consider the bipropellant orbital engine or a lower-penalty launch window.`,
    })
  }
  if (telemetry.dataCollectedPoints > 0 && telemetry.dataReturnedPoints / telemetry.dataCollectedPoints < 0.6) {
    recommendations.push({
      objective: 'Engineering — communications',
      text: `Improve the communications plan: this run returned ${Math.round(telemetry.dataReturnedPoints)} of ${Math.round(telemetry.dataCollectedPoints)} collected data points. Use store-and-forward or choose a link with a recovery window suited to the interruption scenario.`,
    })
  }
  if (design.massMarginKg < 15 || design.budgetMarginK < 200) {
    recommendations.push({
      objective: 'Engineering — mass and budget',
      text: `Keep additional mass and cost margin by trading down non-critical components before the next run. Recorded margins: ${Math.round(design.massMarginKg)} kg and ${Math.round(design.budgetMarginK)} k.`,
    })
  }
  if (recommendations.length === 0) {
    recommendations.push({
      objective: 'Next design iteration',
      text: 'All three objective thresholds were met. Retain the current balance of science capability, power headroom, maneuver reserve, and data return; use event outcomes to refine the next design.',
    })
  }

  return {
    seed: state.seed,
    scenario: state.scenario,
    design,
    result,
    scores: { science, reliability, budgetRemaining, margins },
    objectives: {
      primary: {
        name: 'Investigate potential water ice near the lunar south pole',
        complete: primaryComplete,
        value: primaryValue,
        threshold: primaryThreshold,
        unit: 'illustrative evidence points',
        detail: telemetry.orbitAchieved
          ? `${primaryValue} / ${primaryThreshold} illustrative evidence points · ${evidenceModalities.length} / 2 distinct water-evidence types`
          : `Lunar orbit not achieved · ${primaryValue} / ${primaryThreshold} illustrative evidence points; no orbital observations were credited`,
      },
      bonus: [
        {
          name: 'Map safe landing terrain around the crater rim',
          complete: terrainComplete,
          value: terrainValue,
          threshold: terrainThreshold,
          unit: 'illustrative terrain-mapping points',
          detail: `${terrainValue} / ${terrainThreshold} illustrative terrain-mapping points`,
        },
        {
          name: 'Maximize science data returned to Earth',
          complete: dataComplete,
          value: dataValue,
          threshold: dataThreshold,
          unit: 'illustrative returned data points',
          detail: `${dataValue} / ${dataThreshold} illustrative returned data points`,
        },
      ],
    },
    marginBreakdown: {
      massKg: design.massMarginKg,
      powerW: finalPowerMarginW,
      budgetK: design.budgetMarginK,
    },
    telemetry,
    scienceFindings: state.scienceFindings,
    scienceSynthesis: {
      classification: evidenceModalities.length >= 2
        ? primaryComplete
          ? 'Multiple independent indicators support a potential water-ice candidate'
          : 'Multiple observation types collected; evidence threshold not met'
        : evidenceModalities.length === 1
          ? 'Single evidence type; additional independent observations required'
          : telemetry.orbitAchieved
            ? 'No water-relevant evidence recorded'
            : 'Lunar orbit not achieved; no orbital water evidence recorded',
      evidenceModalities,
      independentModalitiesRequired: 2,
      detail: 'These measurements are indirect and require joint interpretation. No observation or game classification establishes water composition, concentration, accessibility, or extractability.',
    },
    eventResults: state.resolvedEvents,
    recommendations,
  }
}

export function getNextMissionSeed(seed: number) {
  const nextSeed = (seed + 104_729) >>> 0
  return nextSeed === seed ? (seed + 1) >>> 0 : nextSeed
}

export function formatRemaining(value: number, unit: string) {
  if (value >= 0) return `${Math.round(value)} ${unit} remaining`
  return `${Math.abs(Math.round(value))} ${unit} exceeded`
}
