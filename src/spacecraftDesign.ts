/*
 * Spacecraft catalogue and design validation.
 *
 * Power architecture rules:
 *   - A generator (solar array or radioisotope generator) produces power in watts (W).
 *   - A battery stores energy in watt-hours (Wh) and can release it at up to its discharge limit (W).
 *     It generates nothing, so it can never be the only power equipment on the spacecraft.
 *   - Sustained supply, eclipse power (W) and eclipse energy (Wh) are checked separately.
 *
 * Every mass, power, energy and cost figure here is an illustrative gameplay value,
 * not a verified NASA hardware specification.
 */
import type { MissionDesign } from './missionSimulation'
import { LUNAR_SCIENCE_DATA, SCIENCE_GAME_PROFILES, type ScienceInstrumentId } from './scienceData'

export type ComponentCategory = 'power' | 'battery' | 'propulsion' | 'communications'

export type ComponentOption = {
  id: string
  name: string
  description: string
  mass: number
  cost: number
  /** Electrical load this component adds, W. */
  draw: number
  /** Generators only: power produced in sunlight, W. */
  output?: number
  /** Generators only: power produced during a full eclipse, W. */
  eclipseOutput?: number
  /** Batteries only: highest power the battery can deliver, W. */
  maxDischargeW?: number
  /** Batteries only: stored energy when full, Wh. */
  storageWh?: number
}

export const MASS_LIMIT = 150
export const BUDGET_LIMIT = 2400
export const MAX_SCIENCE_INSTRUMENTS = 2
export const MIN_SCIENCE_INSTRUMENTS = 1
/** Length of the reference full eclipse used for design checks, hours. Matches the mission's eclipse event. */
export const REFERENCE_ECLIPSE_HOURS = 0.5
export const NO_BATTERY_ID = 'none'

export const COMPONENT_OPTIONS: Record<ComponentCategory, ComponentOption[]> = {
  power: [
    { id: 'solar', name: 'Deployable solar array', description: 'Fold-out panels optimized for low-angle light. Generates nothing in full eclipse.', mass: 22, cost: 340, draw: 0, output: 500, eclipseOutput: 0 },
    { id: 'rtg', name: 'Radioisotope generator', description: 'Steady output through long polar shadows, in sunlight and eclipse alike.', mass: 31, cost: 690, draw: 0, output: 320, eclipseOutput: 320 },
  ],
  battery: [
    { id: NO_BATTERY_ID, name: 'No battery', description: 'No energy storage. The spacecraft runs only on what its generator produces at that moment.', mass: 0, cost: 0, draw: 0 },
    { id: 'high-density', name: 'High-density battery', description: 'Stores energy to carry loads through an eclipse. Recharges only from surplus generator power.', mass: 18, cost: 260, draw: 0, maxDischargeW: 240, storageWh: 480 },
  ],
  propulsion: [
    { id: 'cold-gas', name: 'Cold-gas thrusters', description: 'Precise, low-complexity orbital adjustments.', mass: 25, cost: 420, draw: 80 },
    { id: 'bipropellant', name: 'Bipropellant orbital engine', description: 'Provide thrust for lunar orbit insertion and orbital maneuvers.', mass: 38, cost: 640, draw: 60 },
    { id: 'electric', name: 'Electric microthrusters', description: 'Efficient, fine-tuned station keeping.', mass: 19, cost: 510, draw: 140 },
  ],
  communications: [
    { id: 'x-band', name: 'X-band high-gain dish', description: 'Reliable long-range data to Earth.', mass: 12, cost: 220, draw: 70 },
    { id: 'uhf', name: 'UHF relay link', description: 'Robust low-power link to a lunar relay.', mass: 8, cost: 160, draw: 45 },
    { id: 'laser', name: 'Optical laser terminal', description: 'High-bandwidth science data return.', mass: 15, cost: 390, draw: 110 },
  ],
}

export type ComponentSelection = Record<ComponentCategory, string>

export const DEFAULT_SELECTION: ComponentSelection = {
  power: 'solar',
  battery: NO_BATTERY_ID,
  propulsion: 'cold-gas',
  communications: 'x-band',
}

export type DesignSelection = ComponentSelection & { instrumentIds: ScienceInstrumentId[] }

export type DesignEvaluation = {
  massKg: number
  costK: number
  /** Total electrical load of the selected equipment, W. */
  loadW: number
  /** Generator output in sunlight, W. Zero when no generator is selected. */
  generationW: number
  /** Generator output during a full eclipse, W. */
  eclipseGenerationW: number
  batteryDischargeLimitW: number
  batteryCapacityWh: number
  massMarginKg: number
  budgetMarginK: number
  /** Sunlit generation minus load, W. Battery discharge is never counted here. */
  sustainedMarginW: number
  eclipse: {
    hours: number
    /** Load to carry through the reference eclipse, before any in-flight load shedding, W. */
    demandW: number
    generationW: number
    /** Power the battery must deliver, W. */
    batteryPowerNeededW: number
    /** Power check: generation plus the battery discharge limit, W. */
    powerAvailableW: number
    powerShortfallW: number
    /** Energy check: what the battery must supply over the eclipse, Wh. */
    energyNeededWh: number
    energyAvailableWh: number
    energyShortfallWh: number
  }
  recharge: {
    /** True only when a generator leaves surplus power after the spacecraft load. */
    possible: boolean
    surplusW: number
    hoursToFull: number | null
  }
  /** Problems that make the design invalid. */
  blockingIssues: string[]
  /** Risks the player may accept: the design can fly, with consequences in the eclipse. */
  advisories: string[]
  isValid: boolean
}

function findOption(category: ComponentCategory, id: string) {
  return COMPONENT_OPTIONS[category].find((option) => option.id === id)
}

function formatCostK(costK: number) {
  return costK >= 1000 ? `$${(costK / 1000).toFixed(2)}M` : `$${costK}k`
}

export function evaluateDesign(selection: DesignSelection): DesignEvaluation {
  const instrumentIds = [...new Set(selection.instrumentIds)]
  const instruments = instrumentIds.map((id) => SCIENCE_GAME_PROFILES[id])
  const generator = findOption('power', selection.power)
  const battery = findOption('battery', selection.battery)
  const propulsion = findOption('propulsion', selection.propulsion)
  const communications = findOption('communications', selection.communications)
  const equipment = [generator, battery, propulsion, communications].filter((option) => option !== undefined)

  const massKg = instruments.reduce((sum, profile) => sum + profile.massKg, 0)
    + equipment.reduce((sum, option) => sum + option.mass, 0)
  const costK = instruments.reduce((sum, profile) => sum + profile.costK, 0)
    + equipment.reduce((sum, option) => sum + option.cost, 0)
  const loadW = instruments.reduce((sum, profile) => sum + profile.powerDrawW, 0)
    + equipment.reduce((sum, option) => sum + option.draw, 0)

  // Generation comes only from a generator. A battery's discharge limit is not generation.
  const generationW = generator?.output ?? 0
  const eclipseGenerationW = generator?.eclipseOutput ?? 0
  const batteryDischargeLimitW = battery?.maxDischargeW ?? 0
  const batteryCapacityWh = battery?.storageWh ?? 0
  const hasBattery = batteryCapacityWh > 0

  const massMarginKg = MASS_LIMIT - massKg
  const budgetMarginK = BUDGET_LIMIT - costK
  const sustainedMarginW = generationW - loadW

  const batteryPowerNeededW = Math.max(0, loadW - eclipseGenerationW)
  const powerAvailableW = eclipseGenerationW + batteryDischargeLimitW
  const powerShortfallW = Math.max(0, loadW - powerAvailableW)
  const energyNeededWh = batteryPowerNeededW * REFERENCE_ECLIPSE_HOURS
  const energyShortfallWh = Math.max(0, energyNeededWh - batteryCapacityWh)

  const rechargePossible = hasBattery && generationW > 0 && sustainedMarginW > 0
  const recharge = {
    possible: rechargePossible,
    surplusW: Math.max(0, sustainedMarginW),
    hoursToFull: rechargePossible ? batteryCapacityWh / sustainedMarginW : null,
  }

  const blockingIssues: string[] = []
  if (instrumentIds.length < MIN_SCIENCE_INSTRUMENTS) blockingIssues.push('Select at least one science instrument')
  if (instrumentIds.length > MAX_SCIENCE_INSTRUMENTS) blockingIssues.push(`Select at most ${MAX_SCIENCE_INSTRUMENTS} science instruments`)
  if (!propulsion) blockingIssues.push('Select a propulsion system')
  if (!communications) blockingIssues.push('Select a communications system')
  if (massMarginKg < 0) blockingIssues.push(`Mass limit exceeded by ${Math.abs(massMarginKg)} kg`)
  if (budgetMarginK < 0) blockingIssues.push(`Budget exceeded by ${formatCostK(Math.abs(budgetMarginK))}`)
  if (generationW <= 0) {
    blockingIssues.push(hasBattery
      ? 'No power generator: a battery only stores energy and cannot power or recharge the spacecraft on its own'
      : 'No power generator selected')
  } else if (sustainedMarginW < 0) {
    blockingIssues.push(`Sunlit generation is ${Math.abs(sustainedMarginW)} W short of the ${loadW} W load`)
  }

  const advisories: string[] = []
  if (generationW > 0) {
    if (powerShortfallW > 0) {
      advisories.push(hasBattery
        ? `Eclipse power: ${loadW} W load exceeds ${powerAvailableW} W available (${eclipseGenerationW} W generation + ${batteryDischargeLimitW} W battery discharge limit) by ${powerShortfallW} W`
        : `Eclipse power: ${eclipseGenerationW} W generation and no battery against a ${loadW} W load, a ${powerShortfallW} W shortfall`)
    }
    if (hasBattery && energyShortfallWh > 0) {
      advisories.push(`Eclipse energy: ${energyNeededWh} Wh needed over ${REFERENCE_ECLIPSE_HOURS} h, ${batteryCapacityWh} Wh stored`)
    }
    if (hasBattery && !rechargePossible) {
      advisories.push('Battery cannot recharge: the generator has no surplus power after the spacecraft load')
    }
  }

  return {
    massKg,
    costK,
    loadW,
    generationW,
    eclipseGenerationW,
    batteryDischargeLimitW,
    batteryCapacityWh,
    massMarginKg,
    budgetMarginK,
    sustainedMarginW,
    eclipse: {
      hours: REFERENCE_ECLIPSE_HOURS,
      demandW: loadW,
      generationW: eclipseGenerationW,
      batteryPowerNeededW,
      powerAvailableW,
      powerShortfallW,
      energyNeededWh,
      energyAvailableWh: batteryCapacityWh,
      energyShortfallWh,
    },
    recharge,
    blockingIssues,
    advisories,
    isValid: blockingIssues.length === 0,
  }
}

const instrumentNames = new Map(LUNAR_SCIENCE_DATA.instruments.map((instrument) => [instrument.id, instrument.name]))

/** The simulation's view of a design. Returns null when required equipment is missing. */
export function toMissionDesign(
  selection: DesignSelection,
  launch: { date: string; propulsionPenaltyMps: number },
): MissionDesign | null {
  const evaluation = evaluateDesign(selection)
  const generator = findOption('power', selection.power)
  const battery = findOption('battery', selection.battery)
  const propulsion = findOption('propulsion', selection.propulsion)
  const communications = findOption('communications', selection.communications)
  const instrumentIds = [...new Set(selection.instrumentIds)]
  if (
    !generator
    || !propulsion
    || !communications
    || instrumentIds.length < MIN_SCIENCE_INSTRUMENTS
    || instrumentIds.length > MAX_SCIENCE_INSTRUMENTS
  ) return null

  return {
    instrumentIds,
    instrumentNames: instrumentIds.map((id) => instrumentNames.get(id) ?? id),
    powerId: generator.id,
    powerName: generator.name,
    batteryId: battery?.id ?? NO_BATTERY_ID,
    batteryName: evaluation.batteryCapacityWh > 0 && battery ? battery.name : null,
    batteryEnergyCapacityWh: evaluation.batteryCapacityWh,
    batteryDischargeLimitW: evaluation.batteryDischargeLimitW,
    eclipseGenerationW: evaluation.eclipseGenerationW,
    propulsionId: propulsion.id,
    propulsionName: propulsion.name,
    communicationsId: communications.id,
    communicationsName: communications.name,
    massKg: evaluation.massKg,
    massLimitKg: MASS_LIMIT,
    massMarginKg: evaluation.massMarginKg,
    powerLoadW: evaluation.loadW,
    powerCapacityW: evaluation.generationW,
    powerMarginW: evaluation.sustainedMarginW,
    costK: evaluation.costK,
    budgetLimitK: BUDGET_LIMIT,
    budgetMarginK: evaluation.budgetMarginK,
    launchPenaltyMps: launch.propulsionPenaltyMps,
    launchDate: launch.date,
  }
}
