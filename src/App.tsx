import { getRetryFocus } from './guidedMission'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { MissionReviewView, MissionSimulationView } from './MissionViews'
import { Lunar3DPanel } from './Lunar3DPanel'
import {
  calculateMissionDebrief,
  getNextMissionSeed,
  missionReducer,
  type MissionDebrief,
  type MissionTelemetry,
} from './missionSimulation'
import {
  LUNAR_SCIENCE_DATA,
  SCIENCE_GAME_PROFILES,
  type ScienceInstrument,
  type ScienceInstrumentId,
} from './scienceData'
import {
  BUDGET_LIMIT,
  COMPONENT_OPTIONS as options,
  DEFAULT_SELECTION,
  MASS_LIMIT,
  MAX_SCIENCE_INSTRUMENTS,
  MIN_SCIENCE_INSTRUMENTS,
  NO_BATTERY_ID,
  evaluateDesign,
  toMissionDesign,
  type ComponentCategory,
  type ComponentOption,
  type ComponentSelection,
} from './spacecraftDesign'
import horizonsCache from './data/horizons2027.json'
import { SpacecraftSchematic } from './MissionVisuals'
import type { Lunar3DPart } from './lunar3dTypes'
import type { MissionSubsystem } from './missionSubsystems'
import { playSound } from './missionAudio'
import { MOON_FACT_SHEET_URL, MOON_GM_KM3_S2, MOON_RADIUS_KM, referenceOrbit } from './lunarOrbit'
import { REFERENCE_ECLIPSE_HOURS } from './spacecraftDesign'
import { SoundControls } from './SoundControls'
import './App.css'

type Category = 'instrument' | ComponentCategory
type NonInstrumentCategory = ComponentCategory

const COMPONENT_CATEGORIES = ['power', 'battery', 'propulsion', 'communications'] as const
// The battery is part of the power subsystem in the diagrams and the 3D view.
const subsystemOf = (category: NonInstrumentCategory): MissionSubsystem => (category === 'battery' ? 'power' : category)

type InstrumentOption = ComponentOption & { facts: ScienceInstrument }

type LaunchWindow = {
  id: string
  date: string
  dateLabel: string
  distanceKm: number
  oneWayLightTimeSeconds: number
  propulsionPenaltyMps: number
  tradeoff: string
}

const categories: { id: Category; title: string; eyebrow: string }[] = [
  { id: 'instrument', title: 'Science instrument', eyebrow: '01 / PAYLOAD' },
  { id: 'power', title: 'Power generation', eyebrow: '02 / GENERATION' },
  { id: 'battery', title: 'Energy storage', eyebrow: '03 / STORAGE' },
  { id: 'propulsion', title: 'Propulsion', eyebrow: '04 / MOBILITY' },
  { id: 'communications', title: 'Communications', eyebrow: '05 / TELEMETRY' },
]

const instrumentOptions: InstrumentOption[] = LUNAR_SCIENCE_DATA.instruments.map((instrument) => {
  const profile = SCIENCE_GAME_PROFILES[instrument.id]
  return {
    id: instrument.id,
    name: instrument.name,
    description: instrument.purpose,
    mass: profile.massKg,
    cost: profile.costK,
    draw: profile.powerDrawW,
    facts: instrument,
  }
})

const DEFAULT_INSTRUMENT_IDS: ScienceInstrumentId[] = ['LEND', 'DIVINER']
const REAL_ORBIT = referenceOrbit()

const launchWindowOptions = [
  {
    id: 'jan-08',
    date: '2027-01-08',
    dateLabel: '08 JAN 2027',
    propulsionPenaltyMps: 120,
    tradeoff: 'Moderate maneuver allowance with a mid-range communication light-time.',
  },
  {
    id: 'jan-22',
    date: '2027-01-22',
    dateLabel: '22 JAN 2027',
    propulsionPenaltyMps: 240,
    tradeoff: 'Shortest communication light-time, paired with the highest illustrative maneuver allowance.',
  },
  {
    id: 'feb-05',
    date: '2027-02-05',
    dateLabel: '05 FEB 2027',
    propulsionPenaltyMps: 0,
    tradeoff: 'Lowest illustrative maneuver allowance, with a slightly longer communication light-time.',
  },
]

const horizonsObservations = new Map(horizonsCache.observations.map((observation) => [observation.date, observation]))
const launchWindows: LaunchWindow[] = launchWindowOptions.map((window) => {
  const observation = horizonsObservations.get(window.date)
  if (!observation) throw new Error(`Cached NASA/JPL Horizons data is missing ${window.date}`)
  return {
    ...window,
    distanceKm: observation.distanceKm,
    oneWayLightTimeSeconds: observation.oneWayLightTimeSeconds,
  }
})

const distanceMinimum = Math.min(...launchWindows.map((window) => window.distanceKm))
const distanceMaximum = Math.max(...launchWindows.map((window) => window.distanceKm))
const distancePadding = Math.max(1_000, (distanceMaximum - distanceMinimum) * 0.1)
const DISTANCE_CHART_MIN_KM = Math.floor((distanceMinimum - distancePadding) / 1_000) * 1_000
const DISTANCE_CHART_MAX_KM = Math.ceil((distanceMaximum + distancePadding) / 1_000) * 1_000

function formatCost(cost: number) {
  return cost >= 1000 ? `$${(cost / 1000).toFixed(2)}M` : `$${cost}k`
}

function formatDistance(distanceKm: number) {
  return `${Math.round(distanceKm).toLocaleString('en-US')} km`
}

function getDistanceBarHeight(distanceKm: number) {
  const range = DISTANCE_CHART_MAX_KM - DISTANCE_CHART_MIN_KM
  return 20 + ((distanceKm - DISTANCE_CHART_MIN_KM) / range) * 80
}

function formatMargin(value: number, unit: string) {
  return `${value > 0 ? '+' : ''}${value} ${unit}`
}

function formatBudgetMargin(value: number) {
  const cost = formatCost(Math.abs(value))
  return value > 0 ? `+${cost}` : value < 0 ? `-${cost}` : cost
}

function NonInstrumentOptionGrid({
  categoryId,
  selectedId,
  onSelect,
}: {
  categoryId: NonInstrumentCategory
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="option-grid">
      {options[categoryId].map((option) => {
        const checked = selectedId === option.id
        return (
          <label className={`option-card${checked ? ' is-selected' : ''}`} key={option.id}>
            <input
              type="radio"
              name={categoryId}
              value={option.id}
              checked={checked}
              onChange={() => {
                playSound('selection')
                onSelect(option.id)
              }}
            />
            <span className="option-top"><span className="radio-indicator" aria-hidden="true" /><span className="option-cost">{formatCost(option.cost)} · ILLUSTRATIVE</span></span>
            <span className="option-name">{option.name}</span>
            <span className="option-description">{option.description}</span>
            <span className="option-stats">
              <span>{option.mass} <small>KG · ILLUSTRATIVE</small></span>
              <span>
                {option.output !== undefined
                  ? `${option.output} W SUNLIT · ${option.eclipseOutput ?? 0} W ECLIPSE`
                  : option.storageWh !== undefined
                    ? `${option.storageWh} Wh STORED · ${option.maxDischargeW ?? 0} W MAX DISCHARGE`
                    : categoryId === 'battery'
                      ? '0 Wh STORED'
                      : `${option.draw} W`}
                {' '}<small>ILLUSTRATIVE</small>
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<'briefing' | 'builder' | 'launch' | 'ready' | 'simulation' | 'review'>('briefing')
  const [guided, setGuided] = useState(false)
  const [beforeDecision, setBeforeDecision] = useState<MissionTelemetry | null>(null)
  const [showOutcome, setShowOutcome] = useState(false)
  const [retryCategory, setRetryCategory] = useState<Category | null>(null)
  const [selection, setSelection] = useState<ComponentSelection>(DEFAULT_SELECTION)
  const [selectedInstrumentIds, setSelectedInstrumentIds] = useState<ScienceInstrumentId[]>(DEFAULT_INSTRUMENT_IDS)
  const [highlightedSubsystem, setHighlightedSubsystem] = useState<MissionSubsystem>('science')
  const [highlightedPartId, setHighlightedPartId] = useState<string>(DEFAULT_INSTRUMENT_IDS[0])
  const [selectedLaunchWindow, setSelectedLaunchWindow] = useState(launchWindows[0])
  const [missionSeed, setMissionSeed] = useState(104729)
  const [missionState, dispatchMission] = useReducer(missionReducer, null)
  const [previousRun, setPreviousRun] = useState<MissionDebrief | null>(null)

  const evaluation = useMemo(
    () => evaluateDesign({ ...selection, instrumentIds: selectedInstrumentIds }),
    [selection, selectedInstrumentIds],
  )
  // `output` is generator output only. A battery's discharge limit is never counted as generation.
  const totals = { mass: evaluation.massKg, cost: evaluation.costK, draw: evaluation.loadW, output: evaluation.generationW }
  const selectedBattery = options.battery.find((option) => option.id === selection.battery && option.id !== NO_BATTERY_ID) ?? null

  const selectedInstrumentOptions = instrumentOptions.filter((option) => selectedInstrumentIds.includes(option.id))
  const visualizationParts: Lunar3DPart[] = [
    ...selectedInstrumentOptions.map((option) => ({
      id: option.id,
      subsystem: 'science' as const,
      name: option.name,
      description: option.description,
      massKg: option.mass,
      powerDrawW: option.draw,
      costK: option.cost,
      sourceUrls: option.facts.source_urls,
    })),
    ...COMPONENT_CATEGORIES.flatMap((category) => {
      const option = options[category].find((candidate) => candidate.id === selection[category])
      // "No battery" is the absence of equipment, so it has no part to inspect.
      if (!option || (category === 'battery' && option.id === NO_BATTERY_ID)) return []
      return [{
        id: option.id,
        subsystem: subsystemOf(category),
        name: option.name,
        description: option.description,
        massKg: option.mass,
        powerDrawW: option.draw,
        ...(option.output !== undefined ? { powerOutputW: option.output, eclipseOutputW: option.eclipseOutput ?? 0 } : {}),
        ...(option.storageWh !== undefined
          ? { maxDischargeW: option.maxDischargeW ?? 0, storageWh: option.storageWh }
          : {}),
        costK: option.cost,
      }]
    }),
  ]

  const missionDesign = useMemo(
    () => toMissionDesign({ ...selection, instrumentIds: selectedInstrumentIds }, selectedLaunchWindow),
    [selection, selectedInstrumentIds, selectedLaunchWindow],
  )

  const massMargin = evaluation.massMarginKg
  const powerMargin = evaluation.sustainedMarginW
  const budgetMargin = evaluation.budgetMarginK
  const isWithinLimits = evaluation.isValid
  const selectedComponents = [
    ...selectedInstrumentOptions.map((option) => ({ category: 'Science instrument', option })),
    ...COMPONENT_CATEGORIES.flatMap((category) => {
      const option = options[category].find((candidate) => candidate.id === selection[category])
      const title = categories.find((item) => item.id === category)?.title ?? category
      return option ? [{ category: title, option }] : []
    }),
  ]
  const limitWarnings = evaluation.blockingIssues
  const eclipse = evaluation.eclipse
  const currentDebrief = missionState?.status === 'complete' ? calculateMissionDebrief(missionState) : null
  const nextSeed = getNextMissionSeed(missionSeed)
  const displayedScreen = screen === 'simulation' && missionState?.status === 'complete' ? 'review' : screen

  useEffect(() => {
    if (showOutcome || screen !== 'simulation' || missionState?.status !== 'running') return
    const intervalId = window.setInterval(() => dispatchMission({ type: 'TICK' }), 1000)
    return () => window.clearInterval(intervalId)
  }, [screen, missionState?.status, showOutcome])

  const startMission = (seed = missionSeed) => {
    if (!missionDesign) return
    setShowOutcome(false)
    dispatchMission({ type: 'START', seed, design: missionDesign })
    setMissionSeed(seed)
    setScreen('simulation')
  }

  const startGuided = () => {
    const starter = { ...DEFAULT_SELECTION, battery: 'high-density', propulsion: 'bipropellant' }
    const design = toMissionDesign({ ...starter, instrumentIds: DEFAULT_INSTRUMENT_IDS }, launchWindows[2])
    if (!design) return
    setSelection(starter)
    setSelectedInstrumentIds(DEFAULT_INSTRUMENT_IDS)
    setSelectedLaunchWindow(launchWindows[2])
    setGuided(true)
    setShowOutcome(false)
    setPreviousRun(null)
    setMissionSeed(104729)
    dispatchMission({ type: 'START', seed: 104729, design })
    setScreen('simulation')
  }

  const redesignSpacecraft = () => {
    if (currentDebrief) setPreviousRun(currentDebrief)
    if (currentDebrief) setRetryCategory(getRetryFocus(currentDebrief).category)
    setScreen('builder')
  }

  const startNewScenario = () => {
    if (!missionDesign) return
    const seed = getNextMissionSeed(missionSeed)
    setPreviousRun(null)
    startMission(seed)
  }

  useEffect(() => {
    if (displayedScreen === 'simulation' || displayedScreen === 'review') window.scrollTo({ top: 0, behavior: 'instant' })
  }, [displayedScreen])

  useEffect(() => {
    if (screen === 'builder' && retryCategory) {
      document.getElementById(`component-${retryCategory}`)?.scrollIntoView({ block: 'start' })
      document.getElementById(`component-${retryCategory}`)?.focus({ preventScroll: true })
    }
  }, [screen, retryCategory])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="MARGIN home" onClick={() => setScreen('briefing')}>
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MARGIN<span className="wordmark-period">.</span></span>
        </a>
        <div className="topbar-center"><span className="status-dot" /> NASA SPACE APPS CHALLENGE</div>
        <div className="topbar-right"><SoundControls compact /><span className="topbar-label">MISSION CONTROL <span>01</span></span></div>
      </header>

      {displayedScreen === 'briefing' ? (
        <section className="briefing-view" id="top" aria-labelledby="briefing-title">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line" /> LUNAR EXPLORATION / MISSION 01</p>
              <h1 id="briefing-title">The next great<br />discovery is on<br /><span>the Moon.</span></h1>
              <p className="hero-description">
                Keep your explorer safe, collect clues to possible Moon ice, and send them home. You make four decisions; we provide a ready-built spacecraft.
              </p>
              <button className="primary-button" type="button" onClick={() => { playSound('confirm'); startGuided() }}>START GUIDED MISSION <span aria-hidden="true">↗</span></button>
              <button className="secondary-button entry-secondary" type="button" onClick={() => { setGuided(false); setScreen('builder') }}>ADVANCED SPACECRAFT BUILDER</button>
              {missionState && <button className="back-button" type="button" onClick={() => setScreen(missionState.status === 'complete' ? 'review' : 'simulation')}>Return to current mission</button>}
              <p className="button-note">READY-BUILT EXPLORER · FOUR DECISIONS · NO EXPERIENCE NEEDED</p>
            </div>
            <div className="lunar-scene" role="img" aria-label="Illustration of the Moon's south pole beneath a star field">
              <div className="scene-coordinate">89° 42′ S<br />63° 12′ E</div>
              <div className="scene-label"><span className="scene-label-dot" /> SHACKLETON CRATER</div>
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="lander">
                <span className="lander-body" />
                <span className="lander-leg lander-leg-left" />
                <span className="lander-leg lander-leg-right" />
                <span className="lander-antenna" />
              </div>
              <div className="moon">
                <span className="crater crater-one" />
                <span className="crater crater-two" />
                <span className="crater crater-three" />
                <span className="moon-ridge" />
              </div>
              <div className="scene-caption">A WORLD OF POSSIBILITY<br /><span>WAITING IN THE SHADOWS</span></div>
            </div>
          </div>

          <div className="briefing-lower">
            <section className="primary-objective" aria-labelledby="primary-objective-title">
              <p className="section-kicker">01 <span>PRIMARY OBJECTIVE</span></p>
              <h2 id="primary-objective-title">Hunt for water ice.</h2>
              <p>Investigate permanently shadowed regions near the lunar south pole for evidence of water ice and other valuable volatiles.</p>
            </section>
            <section className="bonus-objectives" aria-labelledby="bonus-title">
              <p className="section-kicker">OPTIONAL <span>BONUS OBJECTIVES</span></p>
              <h2 id="bonus-title" className="visually-hidden">Bonus objectives</h2>
              <div className="bonus-list">
                <div className="bonus-item"><span className="bonus-number">+01</span><p>Map safe landing terrain around the crater rim.</p><span className="bonus-arrow" aria-hidden="true">↗</span></div>
                <div className="bonus-item"><span className="bonus-number">+02</span><p>Maximize the science data returned to Earth.</p><span className="bonus-arrow" aria-hidden="true">↗</span></div>
              </div>
            </section>
          </div>
          <footer className="page-footer"><span>MISSION BRIEFING / 01</span><span>THE MOON IS CALLING <span className="footer-star">✳</span></span></footer>
          <p className="project-disclosure">Student project for the NASA Space Apps Challenge. Not affiliated with or endorsed by NASA. Built with the help of AI coding tools; see the project README for details and data sources.</p>
        </section>
      ) : displayedScreen === 'builder' ? (
        <section className="builder-view" aria-labelledby="builder-title">
          <div className="builder-heading">
            <button type="button" className="back-button" onClick={() => setScreen('briefing')}><span aria-hidden="true">←</span> BRIEFING</button>
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> MISSION 01 / SPACECRAFT DESIGN</p>
              <h1 id="builder-title">Build your explorer<span>.</span></h1>
              <p className="builder-intro">Choose one or two NASA science instruments, then balance your spacecraft within the limits.</p>
            </div>
            <span className="spec-note">NASA FACTS SOURCED · SPECS ILLUSTRATIVE</span>
          </div>

          {retryCategory && previousRun && <aside className="retry-brief"><strong>Same scenario · seed {missionSeed}</strong><p>{getRetryFocus(previousRun).text}</p><p>Change one component or response at a time to understand the difference.</p><button className="primary-button" disabled={!missionDesign} onClick={() => { setShowOutcome(false); startMission() }}>RETRY SAME SCENARIO →</button></aside>}
          <Lunar3DPanel
            mode="builder"
            parts={visualizationParts}
            selectedPowerId={selection.power}
            highlightedPartId={highlightedPartId}
            highlightedSubsystem={highlightedSubsystem}
            onHighlightPart={(id) => {
              const part = visualizationParts.find((candidate) => candidate.id === id)
              setHighlightedPartId(id)
              if (part) setHighlightedSubsystem(part.subsystem)
            }}
          />

          <div className="builder-layout">
            <div className="component-groups">
              {categories.map((category) => (
                <fieldset className="component-group" id={`component-${category.id}`} tabIndex={-1} key={category.id}>
                  <legend>
                    <span className="group-eyebrow">{category.eyebrow}</span>
                    <span className="group-title">{category.title}</span>
                  </legend>
                  {retryCategory === category.id && previousRun && <div className="component-retry"><p>{getRetryFocus(previousRun).text}</p><button className="primary-button" disabled={!missionDesign} onClick={() => { setShowOutcome(false); startMission() }}>RETRY SAME SCENARIO →</button><p>Keep this spacecraft and change your response, or edit components below. Mass, power and budget limits still apply.</p></div>}
                  {category.id === 'instrument' ? (
                    <>
                      <p className="instrument-selection-help" id="instrument-selection-help">
                        Select 1–2 distinct instruments. This game does not model pair-specific integration constraints, so any distinct pair is eligible; spacecraft mass, power and budget limits still apply.
                      </p>
                      <div className="option-grid instrument-grid">
                        {instrumentOptions.map((option) => {
                          const checked = selectedInstrumentIds.includes(option.id)
                          const disabled = !checked && selectedInstrumentIds.length >= MAX_SCIENCE_INSTRUMENTS
                          return (
                            <div className="instrument-option" key={option.id}>
                              <label className={`option-card instrument-card${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
                                <input
                                  type="checkbox"
                                  name="science-instruments"
                                  value={option.id}
                                  checked={checked}
                                  disabled={disabled}
                                  aria-describedby="instrument-selection-help"
                                  onChange={() => {
                                    playSound('selection')
                                    setHighlightedSubsystem('science')
                                    setHighlightedPartId(
                                      selectedInstrumentIds.includes(option.id)
                                        ? selectedInstrumentIds.find((id) => id !== option.id) ?? option.id
                                        : option.id,
                                    )
                                    setSelectedInstrumentIds((current) => {
                                      if (current.includes(option.id)) return current.filter((id) => id !== option.id)
                                      if (current.length >= MAX_SCIENCE_INSTRUMENTS) return current
                                      return [...current, option.id]
                                    })
                                  }}
                                />
                                <span className="option-top">
                                  <span className="checkbox-indicator" aria-hidden="true">{checked ? '✓' : ''}</span>
                                  <span className="option-cost">{formatCost(option.cost)} · ILLUSTRATIVE</span>
                                </span>
                                <span className="option-name">{option.name}</span>
                                <span className="option-description">{option.description}</span>
                                <span className="option-stats">
                                  <span>{option.mass} <small>KG · ILLUSTRATIVE</small></span>
                                  <span>{option.draw} W <small>ILLUSTRATIVE</small></span>
                                </span>
                              </label>
                              <details className="instrument-facts">
                                <summary>NASA capabilities &amp; sources</summary>
                                <div className="instrument-facts-content">
                                  <p><strong>Mission status:</strong> {option.facts.mission_status}</p>
                                  <p>{option.facts.purpose}</p>
                                  <strong>Measurements</strong>
                                  <ul>{option.facts.measurements.map((measurement) => <li key={measurement}>{measurement}</li>)}</ul>
                                  <strong>Science applications</strong>
                                  <ul>{option.facts.science_application.map((application) => <li key={application}>{application}</li>)}</ul>
                                  {option.facts.scientific_limitation && <p className="instrument-limitation"><strong>Scientific limitation:</strong> {option.facts.scientific_limitation}</p>}
                                  <div className="instrument-source-list">
                                    {option.facts.source_urls.map((source) => (
                                      <a href={source} key={source} target="_blank" rel="noopener noreferrer">
                                        NASA source: {new URL(source).hostname}{new URL(source).pathname}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              </details>
                            </div>
                          )
                        })}
                      </div>
                      <p className="instrument-selection-count" role="status">
                        {selectedInstrumentIds.length} of {MAX_SCIENCE_INSTRUMENTS} instruments selected.
                        {selectedInstrumentIds.length < MIN_SCIENCE_INSTRUMENTS ? ' Select at least one science instrument to continue.' : ''}
                      </p>
                      <p className="illustrative-spec-note">NASA sources describe instrument identity and capabilities. Every mass, power and cost figure in this builder is an illustrative gameplay value, not a verified NASA hardware specification.</p>
                    </>
                  ) : (
                    <NonInstrumentOptionGrid
                      categoryId={category.id}
                      selectedId={selection[category.id]}
                      onSelect={(id) => {
                        setHighlightedSubsystem(category.id === 'instrument' ? 'science' : subsystemOf(category.id))
                        // "No battery" has no part to highlight, so fall back to the generator.
                        setHighlightedPartId(category.id === 'battery' && id === NO_BATTERY_ID ? selection.power : id)
                        setSelection((current) => ({ ...current, [category.id]: id }))
                      }}
                    />
                  )}
                </fieldset>
              ))}
            </div>

            <aside className="mission-summary" aria-label="Live mission calculations">
              <div className="summary-top">
                <p className="section-kicker">LIVE TELEMETRY</p>
                <span className="live-badge"><span /> LIVE</span>
              </div>
              <h2>Mission<br />parameters</h2>
              <p className="selected-instrument-summary">
                SCIENCE PAYLOAD · {selectedInstrumentOptions.map((instrument) => instrument.name).join(' + ') || 'none selected'}
              </p>
              <SpacecraftSchematic
                compact
                configuration={{
                  instrumentNames: selectedInstrumentOptions.map((instrument) => instrument.name),
                  powerId: selection.power,
                  powerName: options.power.find((option) => option.id === selection.power)?.name ?? 'No power selected',
                  batteryName: selectedBattery?.name ?? null,
                  propulsionName: options.propulsion.find((option) => option.id === selection.propulsion)?.name ?? 'No propulsion selected',
                  communicationsName: options.communications.find((option) => option.id === selection.communications)?.name ?? 'No communications selected',
                }}
                selectedSubsystem={highlightedSubsystem}
              />
              <div className="metric" title="Mass margin is the spacecraft mass still available before reaching the 150 kg limit.">
                <div className="metric-heading"><span>SPACECRAFT MASS</span><span className={massMargin < 0 ? 'over-limit' : ''}>{totals.mass} <small>/ {MASS_LIMIT} KG · {formatMargin(massMargin, 'KG')}</small></span></div>
                <div className="meter"><span className={massMargin < 0 ? 'meter-over' : ''} style={{ width: `${Math.min((totals.mass / MASS_LIMIT) * 100, 100)}%` }} /></div>
              </div>
              <div className="metric" title="Sunlit power compares the spacecraft load with what the generator produces in sunlight. A battery stores energy and is never counted as generation.">
                <div className="metric-heading"><span>SUNLIT POWER</span><span className={powerMargin < 0 ? 'over-limit' : ''}>{totals.draw} <small>/ {totals.output} W · {formatMargin(powerMargin, 'W')}</small></span></div>
                <div className="meter"><span className={powerMargin < 0 ? 'meter-over' : ''} style={{ width: `${totals.output ? Math.min((totals.draw / totals.output) * 100, 100) : 0}%` }} /></div>
              </div>
              <div className="metric" title={`Power needed in a full eclipse against power available: ${eclipse.generationW} W from the generator plus ${evaluation.batteryDischargeLimitW} W battery discharge limit.`}>
                <div className="metric-heading"><span>ECLIPSE POWER</span><span className={eclipse.powerShortfallW > 0 ? 'over-limit' : ''}><small>NEED</small> {eclipse.demandW} W <small>· HAVE</small> {eclipse.powerAvailableW} W</span></div>
                <div className="meter"><span className={eclipse.powerShortfallW > 0 ? 'meter-over' : ''} style={{ width: `${eclipse.powerAvailableW ? Math.min((eclipse.demandW / eclipse.powerAvailableW) * 100, 100) : 100}%` }} /></div>
              </div>
              <div className="metric" title={`Energy the battery must supply over the ${eclipse.hours} hour reference eclipse against the energy it stores${evaluation.batteryCapacityWh > 0 ? '' : ' (no battery fitted)'}.`}>
                <div className="metric-heading"><span>ECLIPSE ENERGY</span><span className={eclipse.energyShortfallWh > 0 ? 'over-limit' : ''}><small>NEED</small> {eclipse.energyNeededWh} Wh <small>· HAVE</small> {eclipse.energyAvailableWh} Wh</span></div>
                <div className="meter"><span className={eclipse.energyShortfallWh > 0 ? 'meter-over' : ''} style={{ width: `${eclipse.energyAvailableWh ? Math.min((eclipse.energyNeededWh / eclipse.energyAvailableWh) * 100, 100) : eclipse.energyNeededWh > 0 ? 100 : 0}%` }} /></div>
              </div>
              <div className="metric" title="Budget margin is the mission budget still available before reaching $2.40M.">
                <div className="metric-heading"><span>MISSION BUDGET</span><span className={budgetMargin < 0 ? 'over-limit' : ''}>{formatCost(totals.cost)} <small>/ $2.40M · {formatBudgetMargin(budgetMargin)}</small></span></div>
                <div className="meter"><span className={budgetMargin < 0 ? 'meter-over' : ''} style={{ width: `${Math.min((totals.cost / BUDGET_LIMIT) * 100, 100)}%` }} /></div>
              </div>
              <div className={`limit-status${isWithinLimits ? '' : ' status-warning'}`} role="status">
                <span aria-hidden="true">{isWithinLimits ? '✓' : '!'}</span>
                {isWithinLimits ? 'All systems within mission limits' : limitWarnings.join('; ')}
              </div>
              {isWithinLimits && evaluation.advisories.length > 0 && (
                <div className="limit-status status-advisory" role="status">
                  <span aria-hidden="true">!</span>
                  <p>
                    <strong>Eclipse risk, launch allowed.</strong> {evaluation.advisories.join('; ')}. In flight you can shed load or hibernate instruments; a shortfall costs spacecraft health.
                  </p>
                </div>
              )}
              {selectedBattery && evaluation.recharge.possible && evaluation.recharge.hoursToFull !== null && (
                <p className="recharge-note">Battery recharge: {evaluation.recharge.surplusW} W sunlit surplus refills {evaluation.batteryCapacityWh} Wh in about {evaluation.recharge.hoursToFull.toFixed(1)} h. Illustrative.</p>
              )}
              <div className="summary-footnote">Spacecraft limits, component specifications, mission costs, and balancing estimates are illustrative game values. NASA source links describe real instrument capabilities only.</div>
              <button className="primary-button launch-button" type="button" disabled={!isWithinLimits} onClick={() => { playSound('confirm'); setScreen('launch') }}>
                {isWithinLimits ? 'Confirm spacecraft' : 'Adjust your design'} <span aria-hidden="true">↗</span>
              </button>
            </aside>
          </div>
          <footer className="page-footer"><span>SPACECRAFT DESIGN / 02</span><span>DESIGNED FOR THE SOUTH POLE <span className="footer-star">✳</span></span></footer>
        </section>
      ) : displayedScreen === 'launch' ? (
        <section className="launch-view" aria-labelledby="launch-title">
          <div className="builder-heading">
            <button type="button" className="back-button" onClick={() => setScreen('builder')}><span aria-hidden="true">←</span> BACK TO BUILDER</button>
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> MISSION 01 / TRAJECTORY PLANNING</p>
              <h1 id="launch-title">Select a launch window<span>.</span></h1>
              <p className="builder-intro">Compare cached NASA/JPL Earth–Moon geometry for three launch dates.</p>
            </div>
            <span className="spec-note">CACHED NASA/JPL GEOMETRY</span>
          </div>

          <div className="launch-layout">
            <section className="launch-chart-panel" aria-label="Cached Earth-Moon geometry launch window chart">
              <div className="launch-chart-heading">
                <p className="section-kicker">THREE CANDIDATE WINDOWS</p>
                <span>EARTH-CENTER TO MOON-CENTER / KM</span>
              </div>
              <p className="chart-scale-label">
                DISTANCE AXIS: {DISTANCE_CHART_MIN_KM.toLocaleString('en-US')}–{DISTANCE_CHART_MAX_KM.toLocaleString('en-US')} KM
              </p>
              <fieldset className="launch-window-fieldset">
                <legend className="visually-hidden">Select a launch date</legend>
                <div className="launch-window-grid">
                  {launchWindows.map((window, index) => {
                    const selected = selectedLaunchWindow.id === window.id
                    return (
                      <label className={`launch-window${selected ? ' is-selected' : ''}`} key={window.id}>
                        <input
                          type="radio"
                          name="launch-window"
                          value={window.date}
                          aria-label={`${window.dateLabel}, ${formatDistance(window.distanceKm)}, ${window.oneWayLightTimeSeconds.toFixed(2)} seconds one-way light-time, ${window.propulsionPenaltyMps} meters per second illustrative propulsion penalty`}
                          checked={selected}
                          onChange={() => { playSound('selection'); setSelectedLaunchWindow(window) }}
                        />
                        <span className="window-card-top">
                          <span className="window-radio-indicator" aria-hidden="true" />
                          <span>WINDOW 0{index + 1}</span>
                        </span>
                        <span className="window-date">{window.dateLabel}</span>
                        <span className="window-chart-area" aria-hidden="true">
                          <span
                            className="window-distance-bar"
                            style={{ height: `${getDistanceBarHeight(window.distanceKm)}%` }}
                          />
                          <span className="window-chart-baseline" />
                        </span>
                        <span className="window-distance">{formatDistance(window.distanceKm)}</span>
                        <span className="window-light-time">{window.oneWayLightTimeSeconds.toFixed(2)} s one-way light-time</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <p className="chart-footnote">Horizons reports center-to-center geometry, an approximation of spacecraft communication distance and delay. Propulsion penalties are separate illustrative gameplay assumptions.</p>
              <section className="real-orbit-panel" aria-labelledby="real-orbit-title">
                <p className="section-kicker">REAL ORBIT CHECK · COMPUTED FROM NASA LUNAR CONSTANTS</p>
                <h3 id="real-orbit-title">Your orbiter at {REAL_ORBIT.altitudeKm} km above the Moon</h3>
                <dl className="real-orbit-values">
                  <div><dt>ORBITAL SPEED</dt><dd>{REAL_ORBIT.speedKmS.toFixed(2)} km/s</dd><small>v = √(GM / r)</small></div>
                  <div><dt>ONE ORBIT</dt><dd>{Math.round(REAL_ORBIT.periodMinutes)} min</dd><small>T = 2π√(r³ / GM) · {REAL_ORBIT.orbitsPerDay.toFixed(1)} orbits a day</small></div>
                  <div><dt>LONGEST ECLIPSE</dt><dd>{Math.round(REAL_ORBIT.maxEclipseMinutes)} min</dd><small>{Math.round(REAL_ORBIT.maxEclipseShare * 100)}% of an orbit in the Moon's shadow</small></div>
                </dl>
                <p className="real-orbit-note">
                  Calculated from the Moon's gravitational parameter ({MOON_GM_KM3_S2.toLocaleString('en-US')} km³/s²) and mean radius ({MOON_RADIUS_KM} km) in the{' '}
                  <a href={MOON_FACT_SHEET_URL} target="_blank" rel="noopener noreferrer">NASA Moon Fact Sheet</a>, for a circular orbit at the altitude of a low polar mapping orbit. The game compresses time: its eclipse event lasts {REFERENCE_ECLIPSE_HOURS * 60} minutes, shorter than this real worst case, and its mission clock runs 75 seconds.
                </p>
              </section>
            </section>

            <aside className="launch-details" aria-label="Selected launch window parameters" aria-live="polite">
              <div className="summary-top">
                <p className="section-kicker">SELECTED WINDOW</p>
                <span className="live-badge"><span /> READY</span>
              </div>
              <h2>{selectedLaunchWindow.dateLabel}</h2>
              <p className="launch-tradeoff">{selectedLaunchWindow.tradeoff}</p>
              <dl className="launch-parameters">
                <div>
                  <dt>EARTH-CENTER TO MOON-CENTER DISTANCE</dt>
                  <dd>{formatDistance(selectedLaunchWindow.distanceKm)}</dd>
                </div>
                <div>
                  <dt>ONE-WAY COMMUNICATION LIGHT-TIME</dt>
                  <dd>{selectedLaunchWindow.oneWayLightTimeSeconds.toFixed(2)} seconds</dd>
                </div>
                <div>
                  <dt>SIMPLIFIED PROPULSION PENALTY</dt>
                  <dd>+{selectedLaunchWindow.propulsionPenaltyMps} m/s Δv</dd>
                </div>
              </dl>
              <p className="propulsion-note">ILLUSTRATIVE GAMEPLAY ASSUMPTIONS: simplified additional Δv versus a reference window. It is not calculated from Earth–Moon distance, and Horizons does not identify optimal transfer windows.</p>
              <p className="orbital-attribution">Horizons reports Earth-center-to-Moon-center geometry. These values approximate, but are not identical to, spacecraft communication distance and delay.</p>
              <p className="orbital-attribution">
                Orbital geometry: NASA/JPL Horizons — cached ephemeris data ·{' '}
                <a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html" target="_blank" rel="noreferrer">Horizons documentation</a>
              </p>
              <button className="primary-button launch-button" type="button" onClick={() => { playSound('confirm'); setScreen('ready') }}>
                Confirm Launch Window <span aria-hidden="true">↗</span>
              </button>
            </aside>
          </div>
          <footer className="page-footer"><span>LAUNCH SELECTION / 03</span><span>PROPULSION PENALTIES ARE ILLUSTRATIVE <span className="footer-star">✳</span></span></footer>
        </section>
      ) : displayedScreen === 'ready' ? (
        <section className="ready-view" aria-labelledby="ready-title">
          <div className="builder-heading">
            <button type="button" className="back-button" onClick={() => setScreen('launch')}><span aria-hidden="true">←</span> BACK TO LAUNCH SELECTION</button>
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> MISSION 01 / PRE-LAUNCH CHECK</p>
              <h1 id="ready-title">Mission ready<span>.</span></h1>
              <p className="builder-intro">Your spacecraft and cached orbital geometry are confirmed for the simulation handoff.</p>
            </div>
            <span className="spec-note">DETERMINISTIC SIMULATION</span>
          </div>

          <div className="ready-summary-grid">
            <section className="ready-card" aria-labelledby="spacecraft-summary-title">
              <p className="section-kicker">01 <span>SELECTED SPACECRAFT</span></p>
              <h2 id="spacecraft-summary-title">Lunar polar orbiter</h2>
              <dl className="ready-metrics">
                <div><dt>SPACECRAFT MASS</dt><dd>{totals.mass} kg</dd></div>
                <div><dt>SUNLIT LOAD / GENERATION</dt><dd>{totals.draw} / {totals.output} W</dd></div>
                <div><dt>ECLIPSE LOAD / AVAILABLE</dt><dd>{eclipse.demandW} / {eclipse.powerAvailableW} W</dd></div>
                <div><dt>BATTERY · ILLUSTRATIVE</dt><dd>{missionDesign && missionDesign.batteryEnergyCapacityWh > 0 ? `${missionDesign.batteryEnergyCapacityWh} Wh · ${missionDesign.batteryDischargeLimitW} W max` : 'None'}</dd></div>
                <div><dt>MISSION COST</dt><dd>{formatCost(totals.cost)}</dd></div>
              </dl>
              <ul className="ready-components">
                {selectedComponents.map(({ category, option }, index) => (
                  <li key={`${category}-${option.id}`}>
                    <span>{category === 'Science instrument' ? `${category} ${index + 1}` : category}</span>
                    <strong>{option.name}</strong>
                  </li>
                ))}
              </ul>
              <p className="illustrative-spec-note">Spacecraft mass, power and cost figures are illustrative gameplay estimates; they are not verified NASA hardware specifications.</p>
            </section>

            <section className="ready-card ready-window-card" aria-labelledby="launch-summary-title">
              <p className="section-kicker">02 <span>CONFIRMED LAUNCH WINDOW</span></p>
              <h2 id="launch-summary-title">{selectedLaunchWindow.dateLabel}</h2>
              <dl className="ready-metrics">
                <div><dt>EARTH-CENTER TO MOON-CENTER DISTANCE</dt><dd>{formatDistance(selectedLaunchWindow.distanceKm)}</dd></div>
                <div><dt>ONE-WAY LIGHT-TIME</dt><dd>{selectedLaunchWindow.oneWayLightTimeSeconds.toFixed(2)} seconds</dd></div>
                <div><dt>ILLUSTRATIVE PROPULSION PENALTY</dt><dd>+{selectedLaunchWindow.propulsionPenaltyMps} m/s Δv</dd></div>
              </dl>
              <p className="orbital-attribution">Horizons center-to-center geometry approximates, but is not identical to, spacecraft communication distance and delay. Propulsion penalties remain illustrative gameplay assumptions, not Horizons transfer-window analysis.</p>
              <p className="orbital-attribution">Orbital geometry: NASA/JPL Horizons — cached ephemeris data ·{' '}
                <a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html" target="_blank" rel="noreferrer">Horizons documentation</a>
              </p>
            </section>
          </div>
          <div className="ready-actions">
            <button className="back-button" type="button" onClick={() => setScreen('builder')}><span aria-hidden="true">←</span> EDIT SPACECRAFT</button>
            <button className="primary-button" type="button" onClick={() => { playSound('confirm'); startMission() }}>
              Begin Mission <span aria-hidden="true">↗</span>
            </button>
            <p className="ready-seed">SCENARIO SEED {missionSeed}</p>
            <span className="ready-indicator"><span /> MISSION CONFIGURATION SAVED</span>
          </div>
          <footer className="page-footer"><span>MISSION READY / 04</span><span>CONFIGURATION SAVED IN THIS SESSION <span className="footer-star">✳</span></span></footer>
        </section>
      ) : displayedScreen === 'simulation' && missionState ? (
        <MissionSimulationView
          guided={guided}
          showOutcome={showOutcome}
          beforeDecision={beforeDecision}
          onContinue={() => setShowOutcome(false)}
          onAdvance={() => {
            if (missionState.status !== 'running') return
            const next = missionState.scenario.events.find(event => !missionState.resolvedEvents.some(result => result.id === event.id))
            const target = next?.triggerSecond ?? 75
            for (let second = missionState.elapsedSeconds; second < target; second++) dispatchMission({ type: 'TICK' })
          }}
          state={missionState}
          parts={visualizationParts}
          selectedPowerId={selection.power}
          onResolve={(eventId, choiceId) => { setBeforeDecision(missionState.telemetry); dispatchMission({ type: 'RESOLVE_EVENT', eventId, choiceId }); if (guided) setShowOutcome(true) }}
        />
      ) : displayedScreen === 'review' && currentDebrief ? (
        <MissionReviewView
          debrief={currentDebrief}
          previousRun={previousRun}
          nextSeed={nextSeed}
          onRedesign={redesignSpacecraft}
          onNewScenario={startNewScenario}
        />
      ) : null}
    </main>
  )
}

export default App
