import { getReviewTakeaway, compareMissionRuns } from './guidedMission'
import { useEffect, useRef, useState } from 'react'
import {
  getCurrentMissionEvent,
  getMissionPowerHeadroom,
  getMissionAdvice,
  getMissionChoices,
  MISSION_DURATION_SECONDS,
  MISSION_PHASES,
  SIMULATION_ASSUMPTIONS,
  type MissionDebrief,
  type ScienceFinding,
  type MissionState,
  type MissionTelemetry,
} from './missionSimulation'
import { getScienceOpportunity } from './scienceData'
import { MissionOrbitalVisualization, SpacecraftSchematic } from './MissionVisuals'
import { Lunar3DPanel } from './Lunar3DPanel'
import type { Lunar3DPart } from './lunar3dTypes'
import { playSound, playSoundOnce, type MissionSound } from './missionAudio'
import { SoundControls } from './SoundControls'
import { getAffectedSubsystem } from './missionSubsystems'
import { FailureReviewBoard } from './ReviewBoard'
import { TelemetryHistory } from './TelemetryHistory'

type MissionSimulationViewProps = {
  beforeDecision: MissionTelemetry | null
  guided?: boolean
  showOutcome?: boolean
  onAdvance: () => void
  onContinue: () => void
  state: MissionState
  parts: Lunar3DPart[]
  selectedPowerId: string
  onResolve: (eventId: string, choiceId: string) => void
}

function formatBudgetMargin(valueK: number) {
  const absolute = Math.abs(Math.round(valueK))
  const amount = absolute >= 1000 ? `$${(absolute / 1000).toFixed(2)}M` : `$${absolute}k`
  return valueK >= 0 ? `${amount} remaining` : `${amount} exceeded`
}

function formatMissionCost(costK: number) {
  return costK >= 1000 ? `$${(costK / 1000).toFixed(2)}M` : `$${costK}k`
}

function formatMassMargin(valueKg: number) {
  return valueKg >= 0 ? `${Math.round(valueKg)} kg remaining` : `${Math.abs(Math.round(valueKg))} kg exceeded`
}

function formatPowerMargin(valueW: number) {
  return valueW >= 0 ? `${Math.round(valueW)} W remaining` : `${Math.abs(Math.round(valueW))} W exceeded`
}

function formatSignedDelta(value: number, unit: string) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded} ${unit}`
}

function formatCostDelta(valueK: number) {
  const rounded = Math.round(valueK)
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${formatMissionCost(Math.abs(rounded))}`
}

function compareEvidenceTypes(before: string[], after: string[]) {
  const added = after.filter((modality) => !before.includes(modality))
  const removed = before.filter((modality) => !after.includes(modality))
  if (added.length === 0 && removed.length === 0) return 'No change'
  return [
    ...(added.length > 0 ? [`Added ${added.join(', ')}`] : []),
    ...(removed.length > 0 ? [`Removed ${removed.join(', ')}`] : []),
  ].join('; ')
}

function SourceLinks({ urls }: { urls: string[] }) {
  return (
    <div className="science-source-links">
      {urls.map((url) => (
        <a href={url} key={url} target="_blank" rel="noopener noreferrer">
          NASA source: {new URL(url).hostname}{new URL(url).pathname}
        </a>
      ))}
    </div>
  )
}

function ScienceFindingList({ findings }: { findings: ScienceFinding[] }) {
  if (findings.length === 0) {
    return <p className="science-empty">No instrument evidence was collected during this opportunity.</p>
  }

  return (
    <ul className="science-finding-list">
      {findings.map((finding) => (
        <li key={`${finding.instrumentId}-${finding.evidenceCategory}`}>
          <strong>{finding.instrumentName} · {finding.evidenceCategory}</strong>
          <p>{finding.finding}</p>
          <p>{finding.interpretation}</p>
          <p className="science-uncertainty">Uncertainty: {finding.uncertainty}</p>
          <small>{finding.sciencePoints} illustrative science points · {finding.waterEvidencePoints} illustrative water-evidence points</small>
          <SourceLinks urls={finding.sourceUrls} />
        </li>
      ))}
    </ul>
  )
}

function MissionTelemetry({ state }: { state: MissionState }) {
  const nominalPowerHeadroom = getMissionPowerHeadroom(state)
  const effectiveLoadW = Math.max(0, state.design.powerCapacityW - nominalPowerHeadroom)
  const powerLoadPercent = state.design.powerCapacityW > 0
    ? Math.max(0, Math.min(100, (effectiveLoadW / state.design.powerCapacityW) * 100))
    : 0
  const batteryPercent = state.design.batteryEnergyCapacityWh > 0
    ? Math.max(0, Math.min(100, (state.telemetry.batteryEnergyRemainingWh / state.design.batteryEnergyCapacityWh) * 100))
    : 0
  const healthLabel = state.telemetry.health >= 70
    ? 'NOMINAL'
    : state.telemetry.health >= 40
      ? 'DEGRADED'
      : 'CRITICAL'

  return (
    <aside className="sim-telemetry" aria-label="Live mission telemetry">
      <div className="sim-panel-heading">
        <p className="section-kicker">LIVE TELEMETRY</p>
        <span className="live-badge"><span /> {healthLabel}</span>
      </div>
      <div className="telemetry-grid">
        <div className="telemetry-reading">
          <span>NOMINAL POWER HEADROOM</span>
          <strong className="telemetry-value" key={Math.round(nominalPowerHeadroom)}>{Math.round(nominalPowerHeadroom)} <small>W</small></strong>
          <small className="telemetry-context">{Math.round(effectiveLoadW)} W load / {state.design.powerCapacityW} W capacity</small>
          <span className="telemetry-meter" role="progressbar" aria-label="Nominal power load" aria-valuemin={0} aria-valuemax={state.design.powerCapacityW} aria-valuenow={Math.round(effectiveLoadW)}>
            <span className={effectiveLoadW >= state.design.powerCapacityW ? 'is-over' : ''} style={{ width: `${powerLoadPercent}%` }} />
          </span>
        </div>
        <div className="telemetry-reading">
          <span>BATTERY ENERGY</span>
          {state.design.batteryEnergyCapacityWh > 0
            ? (
              <>
                <strong className="telemetry-value" key={Math.round(state.telemetry.batteryEnergyRemainingWh)}>
                  {Math.round(state.telemetry.batteryEnergyRemainingWh)} <small>/ {state.design.batteryEnergyCapacityWh} Wh</small>
                </strong>
                <small className="telemetry-context">Stored energy · illustrative values</small>
                <span className="telemetry-meter" role="progressbar" aria-label="Remaining battery energy" aria-valuemin={0} aria-valuemax={state.design.batteryEnergyCapacityWh} aria-valuenow={Math.round(state.telemetry.batteryEnergyRemainingWh)}>
                  <span style={{ width: `${batteryPercent}%` }} />
                </span>
              </>
            )
            : <strong>Not installed</strong>}
        </div>
        <div className="telemetry-reading">
          <span>ΔV RESERVE</span>
          <strong className="telemetry-value" key={Math.round(state.telemetry.deltaVRemainingMps)}>{Math.round(state.telemetry.deltaVRemainingMps)} <small>m/s</small></strong>
          <small className="telemetry-context">Illustrative maneuver resource</small>
        </div>
        <div className="telemetry-reading">
          <span>SCIENCE PROGRESS</span>
          <strong className="telemetry-value" key={Math.round(state.telemetry.scienceProgress)}>{Math.round(state.telemetry.scienceProgress)} <small>/ 100</small></strong>
          <span className="telemetry-meter" role="progressbar" aria-label="Science progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.telemetry.scienceProgress)}>
            <span style={{ width: `${state.telemetry.scienceProgress}%` }} />
          </span>
        </div>
        <div className="telemetry-reading">
          <span>SPACECRAFT HEALTH</span>
          <strong className="telemetry-value" key={Math.round(state.telemetry.health)}>{Math.round(state.telemetry.health)} <small>/ 100</small></strong>
          <span className="telemetry-meter" role="progressbar" aria-label="Spacecraft health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.telemetry.health)}>
            <span style={{ width: `${state.telemetry.health}%` }} />
          </span>
        </div>
        <div className="telemetry-reading">
          <span>DATA COLLECTED / RETURNED</span>
          <strong className="telemetry-value" key={`${Math.round(state.telemetry.dataCollectedPoints)}-${Math.round(state.telemetry.dataReturnedPoints)}`}>
            {Math.round(state.telemetry.dataCollectedPoints)} <small>/ {Math.round(state.telemetry.dataReturnedPoints)} pts</small>
          </strong>
          <small className="telemetry-context">Illustrative science-data points</small>
        </div>
      </div>
      <TelemetryHistory state={state} />
      <div className="spacecraft-status">
        <span>SPACECRAFT CONFIGURATION</span>
        <p>{state.design.instrumentNames.join(' + ')} · {state.design.powerName}{state.design.batteryName ? ` + ${state.design.batteryName}` : ''}</p>
        <p>{state.design.propulsionName} · {state.design.communicationsName}</p>
        <p>Science payload: {state.telemetry.instrumentsHibernated ? 'hibernated' : 'active'}</p>
        <p>Orbital status: {state.telemetry.orbitAchieved ? 'lunar orbit achieved' : 'not yet achieved'}</p>
        <small>{state.design.massKg} kg · {state.design.powerLoadW}/{state.design.powerCapacityW} W · {formatMissionCost(state.design.costK)}; component values illustrative</small>
      </div>
    </aside>
  )
}

export function MissionSimulationView({ state, parts, selectedPowerId, onResolve, guided = false, showOutcome = false, onContinue, onAdvance, beforeDecision }: MissionSimulationViewProps) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const activeEvent = getCurrentMissionEvent(state)
  const latest = state.resolvedEvents.at(-1)
  const visualEvent = activeEvent ?? (showOutcome && latest ? state.scenario.events.find(event => event.id === latest.id) ?? null : null)
  const affectedSubsystem = getAffectedSubsystem(visualEvent)
  const outcomeChanges = beforeDecision ? [
    { label: 'Health', value: state.telemetry.health - beforeDecision.health, unit: 'pts' },
    { label: 'Battery', value: state.telemetry.batteryEnergyRemainingWh - beforeDecision.batteryEnergyRemainingWh, unit: 'Wh' },
    { label: 'Maneuver reserve', value: state.telemetry.deltaVRemainingMps - beforeDecision.deltaVRemainingMps, unit: 'm/s' },
    { label: 'Science', value: state.telemetry.scienceProgress - beforeDecision.scienceProgress, unit: 'pts' },
    { label: 'Data home', value: state.telemetry.dataReturnedPoints - beforeDecision.dataReturnedPoints, unit: 'pts' },
  ].filter(change => change.value !== 0).slice(0, 3) : []
  const outcomeHeadline = !latest ? '' : latest.type === 'insertion' ? state.telemetry.orbitAchieved ? 'You made lunar orbit.' : 'Lunar orbit missed.'
    : latest.type === 'eclipse' ? latest.healthDelta < 0 ? 'The eclipse strained your explorer.' : 'Through the shadow safely.'
    : latest.type === 'science' ? latest.scienceDelta > 0 ? 'New evidence collected.' : 'Observation skipped.'
    : state.telemetry.dataReturnedPoints > 0 ? 'Your evidence reached Earth.' : 'No data reached Earth.'
  const phaseIndex = MISSION_PHASES.indexOf(state.phase)
  const progress = (state.elapsedSeconds / MISSION_DURATION_SECONDS) * 100
  const advice = activeEvent ? getMissionAdvice(activeEvent, state) : []
  const choices = activeEvent ? getMissionChoices(activeEvent) : []
  const scienceOpportunity = activeEvent?.type === 'science'
    ? getScienceOpportunity(activeEvent.scienceOpportunityId)
    : null
  const previousPhase = useRef(state.phase)
  const previousActiveEventId = useRef(state.activeEventId)
  const previousResolvedCount = useRef(state.resolvedEvents.length)

  useEffect(() => {
    if (state.phase !== previousPhase.current && state.elapsedSeconds > 0) {
      playSound('telemetry')
    }
    if (state.resolvedEvents.length > previousResolvedCount.current) {
      // The outcome sound says whether the decision helped or hurt the spacecraft.
      const latest = state.resolvedEvents[state.resolvedEvents.length - 1]
      const hurt = latest.healthDelta < 0 || latest.deltaVShortfallMps > 0
      const helped = latest.scienceDelta > 0 || latest.dataReturnedDelta > 0 || latest.healthDelta > 0
      playSound(hurt ? 'outcome-bad' : helped ? 'outcome-good' : 'outcome')
    }
    if (state.activeEventId && state.activeEventId !== previousActiveEventId.current) {
      const event = getCurrentMissionEvent(state)
      playSound(event ? (`alert-${event.type}` as MissionSound) : 'alert')
    }
    previousPhase.current = state.phase
    previousActiveEventId.current = state.activeEventId
    previousResolvedCount.current = state.resolvedEvents.length
    // `state` is read only when one of the listed fields changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeEventId, state.elapsedSeconds, state.phase, state.resolvedEvents.length])

  return (
    <section className={`simulation-view${guided ? ' is-guided' : ''}`} aria-labelledby="simulation-title">
      <div className="simulation-heading">
        <div className="simulation-heading-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> MISSION 01 / LIVE SIMULATION</p>
          <h1 id="simulation-title">{guided ? 'Find clues. Bring them home.' : 'Mission in progress.'}</h1>
          <p className="builder-intro">Seed {state.seed} · 75-second compressed orbital mission · illustrative game rules</p>
        </div>
        <div className="simulation-heading-tools">
          <SoundControls />
          <div className="sim-clock" aria-label={`${state.elapsedSeconds} of ${MISSION_DURATION_SECONDS} mission seconds elapsed`}>
            <span>MISSION ELAPSED</span>
            <strong>{state.elapsedSeconds}<small> / {MISSION_DURATION_SECONDS} SEC</small></strong>
          </div>
        </div>
      </div>

      {guided && <div className="guided-status" aria-label="Spacecraft status">
        {[['Health', state.telemetry.health, '/100'], ['Battery', state.telemetry.batteryEnergyRemainingWh, 'Wh'], ['Maneuver reserve', state.telemetry.deltaVRemainingMps, 'm/s'], ['Science', state.telemetry.scienceProgress, '/100'], ['Data home', state.telemetry.dataReturnedPoints, 'pts']].map(([label, value, unit]) => <span key={label}><small>{label}</small><strong className="guided-reading" key={`${label}-${value}`}>{Math.round(Number(value))} <small>{unit}</small></strong></span>)}
        <small>Illustrative values · {state.resolvedEvents.length}/4 decisions complete</small>
      </div>}
      <div className="phase-track" aria-label={`Current phase: ${state.phase}`}>
        {MISSION_PHASES.map((phase, index) => (
          <div className={`phase-stop${index < phaseIndex ? ' is-complete' : ''}${index === phaseIndex ? ' is-current' : ''}`} key={phase}>
            <span className="phase-marker">{index < phaseIndex ? '✓' : `0${index + 1}`}</span>
            <span>{phase}</span>
          </div>
        ))}
      </div>
      <div className="mission-progress" role="progressbar" aria-label="Mission timeline" aria-valuemin={0} aria-valuemax={MISSION_DURATION_SECONDS} aria-valuenow={state.elapsedSeconds}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="simulation-layout">
        <div className="simulation-main">
          {guided && <div className={`guided-flight${showOutcome && latest && latest.healthDelta < 0 ? ' has-damage' : ''}`}><MissionOrbitalVisualization state={state} event={visualEvent} /><div className="flight-subsystem" key={`${state.resolvedEvents.length}-${affectedSubsystem}`}><span className={showOutcome ? 'subsystem-feedback' : ''}>{affectedSubsystem ? `${affectedSubsystem.toUpperCase()} · ${showOutcome ? 'RESPONSE RECORDED' : 'DECISION AHEAD'}` : 'EXPLORER EN ROUTE'}</span></div></div>}
          <details className="flight-details" open={guided ? undefined : true} onToggle={event => setInspectorOpen(event.currentTarget.open)}><summary>3D inspector &amp; engineering schematics</summary>
          {(!guided || inspectorOpen) && <>
          <Lunar3DPanel
            mode="mission"
            parts={parts}
            selectedPowerId={selectedPowerId}
            missionState={state}
          />
          {!guided && <MissionOrbitalVisualization state={state} event={activeEvent ?? null} />}
          <SpacecraftSchematic
            configuration={state.design}
            affectedSubsystem={getAffectedSubsystem(activeEvent ?? null)}
            payloadHibernated={state.telemetry.instrumentsHibernated}
          />
          </>}
          </details>
          <section className={`event-control${activeEvent ? ' is-awaiting' : ''}`} aria-live="polite">
            <div className="sim-panel-heading">
              <p className="section-kicker">{state.phase.toUpperCase()}</p>
              <span className={`event-state${activeEvent ? ' needs-decision' : ''}`}>
                {showOutcome ? 'RESULT · CLOCK PAUSED' : activeEvent ? 'DECISION REQUIRED · CLOCK PAUSED' : 'MISSION CLOCK RUNNING'}
              </span>
            </div>
            {showOutcome && state.resolvedEvents.length > 0 ? (
              <div className="decision-outcome" key={state.resolvedEvents.length}>
                <p className="event-counter">DECISION {state.resolvedEvents.length} / 4 · RESULT</p>
                <h2>{outcomeHeadline}</h2>
                <ul className="outcome-numbers">{outcomeChanges.map(change => <li key={change.label}><span>{change.label}</span><strong>{formatSignedDelta(change.value, change.unit)}</strong></li>)}</ul>
                {outcomeChanges.length === 0 && <p>No change to the main spacecraft readings.</p>}
                <button className="primary-button" onClick={() => { playSound('confirm'); onContinue() }}>CONTINUE MISSION →</button>
                <details className="outcome-details"><summary>Why this happened · engineering &amp; science</summary><p>{latest!.outcome}</p><ul>{latest!.causalFactors.map(factor => <li key={factor}>{factor}</li>)}</ul><ScienceFindingList findings={latest!.scienceFindings} /></details>
              </div>
            ) : activeEvent ? (
              <>
                <p className="event-counter">SEEDED EVENT {state.resolvedEvents.length + 1} / 4</p>
                <h2>{guided ? EVENT_TITLES[activeEvent.type] : activeEvent.title}</h2>
                <p className="event-description">{guided ? EVENT_EXPLANATIONS[activeEvent.type] : activeEvent.description}</p>
                <h3 className="choice-heading">Choose a response</h3>
                <div className="mission-choices">
                  {choices.map((choice) => (
                    <button
                      className="mission-choice"
                      type="button"
                      key={choice.id}
                      onClick={() => {
                        playSound('selection')
                        onResolve(activeEvent.id, choice.id)
                      }}
                    >
                      <span className="choice-copy">
                        <strong>{guided ? CHOICE_LABELS[choice.id] : choice.label}</strong>
                        {guided ? <><span>Benefit: {CHOICE_GUIDANCE[choice.id][0]}</span><span>Risk: {CHOICE_GUIDANCE[choice.id][1]}</span></> : <span>{choice.description}</span>}
                      </span>
                      <span className="choice-arrow" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
                {scienceOpportunity && (
                  <details className="science-opportunity-context"><summary>NASA science, sources &amp; uncertainty</summary><section aria-label="Science opportunity facts">
                    <span>NASA-GROUNDED CAPABILITIES · ILLUSTRATIVE EVENT</span>
                    <p>{scienceOpportunity.scientific_basis}</p>
                    <p><strong>Recommended instruments:</strong> {scienceOpportunity.recommended_instruments.join(', ')}</p>
                    <SourceLinks urls={scienceOpportunity.source_urls} />
                    <p>No single observation confirms extractable ice. Neutrons indicate hydrogen; thermal data identify potentially ice-stable conditions; radar has multiple interpretations.</p>
                  </section></details>
                )}
                <details open={guided ? undefined : true}><summary>Engineering details &amp; team advice</summary><section className="advice-panel" aria-labelledby="advice-title">
                  <p className="section-kicker" id="advice-title">COMPETING ADVICE</p>
                  <div className="advice-grid">
                    {advice.map((item) => (
                      <article className="advice-card" key={item.role}>
                        <h3>{item.role}</h3>
                        <p>{item.recommendation}</p>
                      </article>
                    ))}
                  </div>
                </section></details>
              </>
            ) : (
              <div className="phase-status">
                <span className="phase-status-mark" aria-hidden="true">✳</span>
                <div>
                  <h2>{state.phase}</h2>
                  <p>Coasting to the next mission checkpoint. The clock pauses for every decision; take your time.</p>
                  {guided && <button className="primary-button" onClick={onAdvance}>{state.resolvedEvents.length === 4 ? 'SEE MISSION RESULTS' : 'GO TO NEXT DECISION'} →</button>}
                </div>
              </div>
            )}
          </section>

          {state.resolvedEvents.length > 0 && (
            <details className="resolved-event-log">
              <summary>Resolved event log ({state.resolvedEvents.length})</summary>
              <ol>
                {state.resolvedEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title}</strong>
                    <span>{event.choiceLabel} — {event.outcome}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
        <details className="telemetry-details" open={guided ? undefined : true}><summary>Detailed spacecraft status &amp; history</summary><MissionTelemetry state={state} /></details>
      </div>

      <details className="assumptions-panel">
        <summary>SIMPLIFIED PHYSICS &amp; SIMULATION ASSUMPTIONS</summary>
        <ul>{SIMULATION_ASSUMPTIONS.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
        <p>All values on this screen are illustrative gameplay values and are not verified NASA data.</p>
      </details>
      <footer className="page-footer"><span>DETERMINISTIC SIMULATION / SEED {state.seed}</span><span>EVENT CHOICES PAUSE THE MISSION CLOCK <span className="footer-star">✳</span></span></footer>
    </section>
  )
}

type MissionReviewViewProps = {
  debrief: MissionDebrief
  previousRun: MissionDebrief | null
  nextSeed: number
  onRedesign: () => void
  onNewScenario: () => void
}

function ScoreCard({ label, score, detail }: { label: string; score: number; detail: string }) {
  return (
    <article className="score-card">
      <span>{label}</span>
      <strong>{score}<small> / 100</small></strong>
      <span className="score-gauge" role="progressbar" aria-label={`${label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
        <span style={{ width: `${score}%` }} />
      </span>
      <p>{detail}</p>
    </article>
  )
}

export function MissionReviewView({
  debrief,
  previousRun,
  nextSeed,
  onRedesign,
  onNewScenario,
}: MissionReviewViewProps) {
  useEffect(() => {
    const sound: MissionSound = debrief.result === 'Success'
      ? 'mission-success'
      : debrief.result === 'Partial Success' ? 'mission-partial' : 'mission-failure'
    // Keyed by the run, so it plays once per mission and not on every re-render.
    playSoundOnce(`${debrief.seed}:${debrief.result}:${debrief.scores.science}:${debrief.scores.reliability}:${debrief.design.costK}`, sound)
  }, [debrief])
  const sameSeedComparison = previousRun?.seed === debrief.seed ? previousRun : null
  const previousEvents = new Map((sameSeedComparison?.eventResults ?? []).map((event) => [event.id, event]))
  const componentRows = sameSeedComparison
    ? [
      {
        label: 'Science instruments',
        before: sameSeedComparison.design.instrumentNames.slice().sort().join(' + '),
        after: debrief.design.instrumentNames.slice().sort().join(' + '),
      },
      { label: 'Power generation', before: sameSeedComparison.design.powerName, after: debrief.design.powerName },
      { label: 'Energy storage', before: sameSeedComparison.design.batteryName ?? 'No battery', after: debrief.design.batteryName ?? 'No battery' },
      { label: 'Propulsion', before: sameSeedComparison.design.propulsionName, after: debrief.design.propulsionName },
      { label: 'Communications', before: sameSeedComparison.design.communicationsName, after: debrief.design.communicationsName },
    ].filter((component) => component.before !== component.after)
    : []
  const objectiveComparisons = sameSeedComparison
    ? [
      { label: 'Primary objective', before: sameSeedComparison.objectives.primary, after: debrief.objectives.primary },
      ...debrief.objectives.bonus.map((objective, index) => ({
        label: `Bonus objective ${index + 1}`,
        before: sameSeedComparison.objectives.bonus[index],
        after: objective,
      })),
    ]
    : []
  const comparisonRows = sameSeedComparison
    ? [
      {
        label: 'Mission result',
        before: sameSeedComparison.result,
        after: debrief.result,
        change: sameSeedComparison.result === debrief.result ? 'No change' : 'Changed',
      },
      {
        label: 'Science score',
        before: `${sameSeedComparison.scores.science} / 100`,
        after: `${debrief.scores.science} / 100`,
        change: formatSignedDelta(debrief.scores.science - sameSeedComparison.scores.science, 'pts'),
      },
      {
        label: 'Water evidence types',
        before: sameSeedComparison.scienceSynthesis.evidenceModalities.join(', ') || 'None recorded',
        after: debrief.scienceSynthesis.evidenceModalities.join(', ') || 'None recorded',
        change: compareEvidenceTypes(
          sameSeedComparison.scienceSynthesis.evidenceModalities,
          debrief.scienceSynthesis.evidenceModalities,
        ),
      },
      {
        label: 'Reliability score',
        before: `${sameSeedComparison.scores.reliability} / 100`,
        after: `${debrief.scores.reliability} / 100`,
        change: formatSignedDelta(debrief.scores.reliability - sameSeedComparison.scores.reliability, 'pts'),
      },
      {
        label: 'Budget remaining score',
        before: `${sameSeedComparison.scores.budgetRemaining} / 100`,
        after: `${debrief.scores.budgetRemaining} / 100`,
        change: formatSignedDelta(debrief.scores.budgetRemaining - sameSeedComparison.scores.budgetRemaining, 'pts'),
      },
      {
        label: 'Margin score',
        before: `${sameSeedComparison.scores.margins} / 100`,
        after: `${debrief.scores.margins} / 100`,
        change: formatSignedDelta(debrief.scores.margins - sameSeedComparison.scores.margins, 'pts'),
      },
      {
        label: 'Ice evidence',
        before: `${sameSeedComparison.objectives.primary.value} pts`,
        after: `${debrief.objectives.primary.value} pts`,
        change: formatSignedDelta(debrief.objectives.primary.value - sameSeedComparison.objectives.primary.value, 'pts'),
      },
      {
        label: 'Terrain mapping',
        before: `${sameSeedComparison.objectives.bonus[0].value} pts`,
        after: `${debrief.objectives.bonus[0].value} pts`,
        change: formatSignedDelta(debrief.objectives.bonus[0].value - sameSeedComparison.objectives.bonus[0].value, 'pts'),
      },
      {
        label: 'Science data returned',
        before: `${sameSeedComparison.objectives.bonus[1].value} pts`,
        after: `${debrief.objectives.bonus[1].value} pts`,
        change: formatSignedDelta(debrief.objectives.bonus[1].value - sameSeedComparison.objectives.bonus[1].value, 'pts'),
      },
      {
        label: 'Δv reserve',
        before: `${Math.round(sameSeedComparison.telemetry.deltaVRemainingMps)} m/s`,
        after: `${Math.round(debrief.telemetry.deltaVRemainingMps)} m/s`,
        change: formatSignedDelta(debrief.telemetry.deltaVRemainingMps - sameSeedComparison.telemetry.deltaVRemainingMps, 'm/s'),
      },
      {
        label: 'Spacecraft mass',
        before: `${sameSeedComparison.design.massKg} kg`,
        after: `${debrief.design.massKg} kg`,
        change: formatSignedDelta(debrief.design.massKg - sameSeedComparison.design.massKg, 'kg'),
      },
      {
        label: 'Power load / capacity',
        before: `${sameSeedComparison.design.powerLoadW} / ${sameSeedComparison.design.powerCapacityW} W`,
        after: `${debrief.design.powerLoadW} / ${debrief.design.powerCapacityW} W`,
        change: `${formatSignedDelta(debrief.design.powerLoadW - sameSeedComparison.design.powerLoadW, 'W load')}; ${formatSignedDelta(debrief.design.powerCapacityW - sameSeedComparison.design.powerCapacityW, 'W capacity')}`,
      },
      {
        label: 'Spacecraft cost',
        before: formatMissionCost(sameSeedComparison.design.costK),
        after: formatMissionCost(debrief.design.costK),
        change: formatCostDelta(debrief.design.costK - sameSeedComparison.design.costK),
      },
      {
        label: 'Mass margin',
        before: formatMassMargin(sameSeedComparison.marginBreakdown.massKg),
        after: formatMassMargin(debrief.marginBreakdown.massKg),
        change: formatSignedDelta(debrief.marginBreakdown.massKg - sameSeedComparison.marginBreakdown.massKg, 'kg'),
      },
      {
        label: 'Power headroom',
        before: formatPowerMargin(sameSeedComparison.marginBreakdown.powerW),
        after: formatPowerMargin(debrief.marginBreakdown.powerW),
        change: formatSignedDelta(debrief.marginBreakdown.powerW - sameSeedComparison.marginBreakdown.powerW, 'W'),
      },
      {
        label: 'Budget margin',
        before: formatBudgetMargin(sameSeedComparison.marginBreakdown.budgetK),
        after: formatBudgetMargin(debrief.marginBreakdown.budgetK),
        change: formatCostDelta(debrief.marginBreakdown.budgetK - sameSeedComparison.marginBreakdown.budgetK),
      },
      {
        label: 'Launch date / propulsion penalty',
        before: `${sameSeedComparison.design.launchDate} · ${sameSeedComparison.design.launchPenaltyMps} m/s`,
        after: `${debrief.design.launchDate} · ${debrief.design.launchPenaltyMps} m/s`,
        change: sameSeedComparison.design.launchDate === debrief.design.launchDate
          && sameSeedComparison.design.launchPenaltyMps === debrief.design.launchPenaltyMps
          ? 'No change'
          : 'Changed',
      },
    ]
    : []
  const changedDecisionCount = debrief.eventResults.filter((event) => {
    const prior = previousEvents.get(event.id)
    return prior !== undefined && prior.choiceId !== event.choiceId
  }).length
  const marginRows = [
    { label: 'Mass margin', value: formatMassMargin(debrief.marginBreakdown.massKg) },
    { label: 'Power headroom', value: formatPowerMargin(debrief.marginBreakdown.powerW) },
    { label: 'Budget margin', value: formatBudgetMargin(debrief.marginBreakdown.budgetK) },
  ]
  const insertionResult = debrief.eventResults.find((event) => event.type === 'insertion')

  return (
    <section className="review-view" aria-labelledby="review-title">
      <div className="builder-heading review-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> MISSION 01 / FAILURE REVIEW BOARD</p>
          <h1 id="review-title">Mission review<span>.</span></h1>
          <p className="builder-intro">Seed {debrief.seed} · {debrief.eventResults.length} decisions recorded · illustrative mission data</p>
        </div>
        <div className="review-heading-tools">
          <span className={`result-badge result-${debrief.result.toLowerCase().replace(' ', '-')}`}>{debrief.result.toUpperCase()}</span>
          <SoundControls />
        </div>
      </div>

      <div className="review-result-banner">
        <span className="review-result-symbol" aria-hidden="true">{debrief.result === 'Success' ? '✓' : debrief.result === 'Partial Success' ? '!' : '×'}</span>
        <div>
          <h2>{debrief.result}</h2>
          <p>
            {debrief.result === 'Success'
              ? 'The primary ice-investigation objective met its science and reliability thresholds.'
              : debrief.result === 'Partial Success'
                ? 'The mission returned useful results but did not satisfy every success threshold.'
                : !debrief.telemetry.orbitAchieved
                  ? 'Lunar orbit was not achieved. The propulsion shortfall prevented orbital science observations and is recorded in the causal event review.'
                  : 'The primary science threshold was not met. Review the event causes and redesign before another run.'}
          </p>
        </div>
      </div>

      {sameSeedComparison && <section className="retry-comparison" aria-label="Same scenario comparison">
        <h2>{compareMissionRuns(sameSeedComparison, debrief)}</h2>
        <div className="retry-metrics">{[
          ['Result', sameSeedComparison.result, debrief.result],
          ['Health', `${Math.round(sameSeedComparison.telemetry.health)}/100`, `${Math.round(debrief.telemetry.health)}/100`],
          ['Science', `${Math.round(sameSeedComparison.telemetry.scienceProgress)}/100`, `${Math.round(debrief.telemetry.scienceProgress)}/100`],
          ['Data home', `${Math.round(sameSeedComparison.telemetry.dataReturnedPoints)} pts`, `${Math.round(debrief.telemetry.dataReturnedPoints)} pts`],
        ].map(([label, before, after]) => <div key={label}><span>{label}</span><strong>{before} → {after}</strong><small>{before === after ? 'Unchanged' : 'Changed'}</small></div>)}</div>
        <p>Same seed · {componentRows.length} component changes · {changedDecisionCount} response changes · illustrative values.</p>
        <small>Changes reflect all recorded inputs; multiple changes do not isolate a single cause.</small>
      </section>}
      <section className="retry-brief"><p className="section-kicker">YOUR NEXT EXPERIMENT</p><p>{getReviewTakeaway(debrief).cause}</p><h2>{getReviewTakeaway(debrief).recommendation}</h2><button className="primary-button" onClick={onRedesign}>FIX &amp; RETRY SAME SCENARIO →</button></section>
      <FailureReviewBoard debrief={debrief} previous={sameSeedComparison} />

      <section className="review-section" aria-labelledby="score-title">
        <div className="review-section-heading">
          <div><p className="section-kicker">01 <span>MISSION SCORECARD</span></p><h2 id="score-title">Performance metrics</h2></div>
        </div>
        <div className="score-grid">
          <ScoreCard label="SCIENCE" score={debrief.scores.science} detail="Science progress points, capped at 100." />
          <ScoreCard label="RELIABILITY" score={debrief.scores.reliability} detail="Remaining spacecraft health points." />
          <ScoreCard
            label="BUDGET REMAINING"
            score={debrief.scores.budgetRemaining}
            detail={`${formatBudgetMargin(debrief.marginBreakdown.budgetK)} of ${formatMissionCost(debrief.design.budgetLimitK)} illustrative limit.`}
          />
          <ScoreCard label="MARGINS" score={debrief.scores.margins} detail="Mean normalized mass, power, and budget headroom." />
        </div>
      </section>

      <div className="review-grid">
        <section className="review-panel" aria-labelledby="objective-title">
          <p className="section-kicker">02 <span>OBJECTIVES</span></p>
          <h2 id="objective-title">Mission goals</h2>
          <div className={`objective-result${debrief.objectives.primary.complete ? ' is-complete' : ' is-incomplete'}`}>
            <span>{debrief.objectives.primary.complete ? 'COMPLETE' : 'NOT COMPLETE'}</span>
            <strong>{debrief.objectives.primary.name}</strong>
            <small>{debrief.objectives.primary.detail}</small>
          </div>
          {debrief.objectives.bonus.map((objective) => (
            <div className={`objective-result${objective.complete ? ' is-complete' : ' is-incomplete'}`} key={objective.name}>
              <span>{objective.complete ? 'BONUS COMPLETE' : 'BONUS NOT COMPLETE'}</span>
              <strong>{objective.name}</strong>
              <small>{objective.detail}</small>
            </div>
          ))}
        </section>

        <section className="review-panel" aria-labelledby="margin-title">
          <p className="section-kicker">03 <span>ENGINEERING MARGINS</span></p>
          <h2 id="margin-title">Remaining / exceeded</h2>
          <dl className="review-margins">
            {marginRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
          <p className="review-footnote">
            Orbital insertion: {debrief.telemetry.orbitAchieved
              ? 'achieved'
              : `not achieved${insertionResult ? ` · ${Math.round(insertionResult.deltaVShortfallMps)} m/s short of the selected burn requirement` : ''}`}.
            {' '}Mass and budget are based on the selected spacecraft. Power headroom is instantaneous output minus load; eclipse energy is tracked separately in Wh.
          </p>
        </section>
      </div>

      <section className="review-section" aria-labelledby="event-review-title">
        <div className="review-section-heading">
          <div><p className="section-kicker">04 <span>CAUSAL EVENT REVIEW</span></p><h2 id="event-review-title">Decision by decision</h2></div>
        </div>
        <ol className="causal-event-list">
          {debrief.eventResults.map((event, index) => {
            const opportunity = event.scienceOpportunityId
              ? getScienceOpportunity(event.scienceOpportunityId)
              : null
            return (
              <li className="causal-event" key={event.id}>
                <div className="causal-event-index">0{index + 1}</div>
                <div className="causal-event-content">
                  <div className="causal-event-heading"><span>{event.phase.toUpperCase()}</span><strong>{event.title}</strong></div>
                  {getAffectedSubsystem(event) && (
                    <span className="timeline-subsystem">
                      AFFECTED SUBSYSTEM · {getAffectedSubsystem(event)?.toUpperCase()}
                    </span>
                  )}
                  <p className="causal-choice">Chosen response: <strong>{event.choiceLabel}</strong></p>
                  <p className="causal-outcome">{event.outcome}</p>
                  <ul>{event.causalFactors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
                  {opportunity && (
                    <div className="science-event-review">
                      <p><strong>Scientific basis:</strong> {opportunity.scientific_basis}</p>
                      <ScienceFindingList findings={event.scienceFindings} />
                      <SourceLinks urls={opportunity.source_urls} />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="review-section" aria-labelledby="science-synthesis-title">
        <div className="review-section-heading">
          <div><p className="section-kicker">05 <span>CROSS-INSTRUMENT SCIENCE</span></p><h2 id="science-synthesis-title">Evidence and uncertainty</h2></div>
        </div>
        <div className="science-synthesis-panel">
          <p className="science-classification">{debrief.scienceSynthesis.classification}</p>
          <p>{debrief.scienceSynthesis.detail}</p>
          <p>
            Evidence types: {debrief.scienceSynthesis.evidenceModalities.length
              ? debrief.scienceSynthesis.evidenceModalities.join(', ')
              : 'none recorded'}
            {' '}({debrief.scienceSynthesis.evidenceModalities.length} / {debrief.scienceSynthesis.independentModalitiesRequired} distinct water-relevant types required).
          </p>
        </div>
        <ScienceFindingList findings={debrief.scienceFindings} />
        <p className="science-uncertainty">No single instrument observation is classified as confirmed or extractable water ice. Hydrogen, temperature, ultraviolet and radar evidence are indirect and must be interpreted together.</p>
      </section>

      <section className="review-section" aria-labelledby="recommendations-title">
        <div className="review-section-heading">
          <div><p className="section-kicker">06 <span>ENGINEERING RECOMMENDATIONS</span></p><h2 id="recommendations-title">Next design iteration</h2></div>
        </div>
        <ul className="recommendation-list">
          {debrief.recommendations.map((recommendation) => (
            <li key={recommendation.objective}>
              <strong>{recommendation.objective}</strong>
              <p>{recommendation.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <details className="assumptions-panel scoring-rules">
        <summary>DOCUMENTED SCORING, EVENT &amp; OUTCOME LOGIC</summary>
        <ul>
          <li>Science score is the accumulated science-progress points, capped at 100. Reliability is remaining spacecraft health, capped at 100.</li>
          <li>Budget remaining score is remaining budget divided by the budget limit, clamped to 0–100. Margin score is the average of remaining mass, end-of-mission power headroom (including load shedding), and budget margins, each normalized to its limit and clamped to 0–100.</li>
          <li>Success requires lunar orbit insertion, at least 45 ice-evidence points, science score of 60 or more, and reliability of 70 or more. A mission that does not reach lunar orbit is Failure. Otherwise, Partial Success requires reliability of at least 35 and either the primary objective or at least 35 science points.</li>
          <li>The primary objective requires 45 ice-evidence points. Bonus objectives require 35 terrain-mapping points and 35 returned science-data points respectively.</li>
          <li>All thresholds, component capability values, scenario conditions, and scores are illustrative game rules—not NASA data or NASA mission benchmarks.</li>
          {SIMULATION_ASSUMPTIONS.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>
      </details>

      {sameSeedComparison && (
        <section className="review-section comparison-section" aria-labelledby="comparison-title">
          <div className="review-section-heading">
            <div><p className="section-kicker">07 <span>SAME-SEED REDESIGN COMPARISON</span></p><h2 id="comparison-title">Before / after</h2></div>
            <span className="comparison-seed">SEED {debrief.seed}</span>
          </div>
          <p className="comparison-intro">The same seed preserves baseline event order and severity. Outcomes are recalculated using each recorded spacecraft and response. This comparison shows observed values; when multiple components or decisions change, aggregate deltas are descriptive and do not isolate a single cause.</p>
          <div className="comparison-change-summary">
            <p>
              Recorded changes: {componentRows.length} spacecraft component{componentRows.length === 1 ? '' : 's'}; {changedDecisionCount} event response{changedDecisionCount === 1 ? '' : 's'}; launch window {sameSeedComparison.design.launchDate === debrief.design.launchDate && sameSeedComparison.design.launchPenaltyMps === debrief.design.launchPenaltyMps ? 'unchanged' : `changed from ${sameSeedComparison.design.launchDate} (${sameSeedComparison.design.launchPenaltyMps} m/s penalty) to ${debrief.design.launchDate} (${debrief.design.launchPenaltyMps} m/s penalty)`}.
            </p>
          </div>
          <div className="design-comparison" aria-label="Changed spacecraft components">
            {componentRows.length > 0
              ? componentRows.map((component) => (
                <div key={component.label}>
                  <span>{component.label.toUpperCase()} · CHANGED</span>
                  <p><strong>Before:</strong> {component.before}<br /><strong>After:</strong> {component.after}</p>
                </div>
              ))
              : <p className="no-component-changes">No spacecraft components changed between these runs.</p>}
          </div>
          <div className="comparison-score-pair" aria-label="Before and after mission score comparison">
            {[
              { label: 'Science', before: sameSeedComparison.scores.science, after: debrief.scores.science },
              { label: 'Reliability', before: sameSeedComparison.scores.reliability, after: debrief.scores.reliability },
              { label: 'Budget remaining', before: sameSeedComparison.scores.budgetRemaining, after: debrief.scores.budgetRemaining },
              { label: 'Margins', before: sameSeedComparison.scores.margins, after: debrief.scores.margins },
            ].map((score) => (
              <div key={score.label}>
                <span>{score.label.toUpperCase()}</span>
                <strong>{score.before} <small>BEFORE</small> · {score.after} <small>AFTER</small></strong>
                <span className="score-gauge" role="progressbar" aria-label={`${score.label} before redesign`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.before}>
                  <span style={{ width: `${score.before}%` }} />
                </span>
                <span className="score-gauge is-after" role="progressbar" aria-label={`${score.label} after redesign`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.after}>
                  <span style={{ width: `${score.after}%` }} />
                </span>
              </div>
            ))}
          </div>
          <div className="comparison-metrics">
            {comparisonRows.map(({ label, before, after, change }) => (
              <div className="comparison-row" key={label}>
                <span>{label}</span>
                <div><small>BEFORE</small><strong>{before}</strong></div>
                <div><small>AFTER</small><strong>{after}</strong></div>
                <div><small>CHANGE</small><strong>{change}</strong></div>
              </div>
            ))}
          </div>
          <section className="threshold-comparison" aria-labelledby="threshold-comparison-title">
            <h3 id="threshold-comparison-title">Objective threshold crossings</h3>
            <ul>
              {objectiveComparisons.map(({ label, before, after }) => {
                const transition = !before.complete && after.complete
                  ? 'THRESHOLD CROSSED · NOT MET → MET'
                  : before.complete && !after.complete
                    ? 'THRESHOLD CROSSED · MET → NOT MET'
                    : before.complete
                      ? 'THRESHOLD MET IN BOTH RUNS'
                      : 'THRESHOLD NOT MET IN EITHER RUN'
                return (
                  <li key={label}>
                    <strong>{label}: {after.name}</strong>
                    <span>{transition}</span>
                    <p>Before: {before.value} / {before.threshold} {before.unit} · After: {after.value} / {after.threshold} {after.unit}</p>
                  </li>
                )
              })}
            </ul>
          </section>
          <ol className="event-comparison-list">
            {debrief.eventResults.map((event) => {
              const prior = previousEvents.get(event.id)
              const responseChanged = prior !== undefined && prior.choiceId !== event.choiceId
              return (
                <li key={event.id}>
                  <h3>{event.title} <small>{responseChanged ? 'RESPONSE CHANGED' : 'SAME RESPONSE'}</small></h3>
                  <div className="event-comparison-columns">
                    <div>
                      <span>BEFORE · {prior?.choiceLabel ?? 'No recorded choice'}</span>
                      <p>{prior?.outcome ?? 'No prior outcome.'}</p>
                      {prior && <ul>{prior.causalFactors.map((factor) => <li key={factor}>{factor}</li>)}</ul>}
                      {prior && prior.scienceFindings.length > 0 && <ScienceFindingList findings={prior.scienceFindings} />}
                    </div>
                    <div>
                      <span>AFTER · {event.choiceLabel}</span>
                      <p>{event.outcome}</p>
                      <ul>{event.causalFactors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
                      {event.scienceFindings.length > 0 && <ScienceFindingList findings={event.scienceFindings} />}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <p className="illustrative-notice">MISSION DATA IS ILLUSTRATIVE. Component capabilities, event parameters, and scoring are simplified gameplay assumptions and are not verified NASA data.</p>
      <div className="review-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            playSound('confirm')
            onRedesign()
          }}
        >Redesign Spacecraft <span aria-hidden="true">↗</span></button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            playSound('confirm')
            onNewScenario()
          }}
        >New Scenario · Seed {nextSeed} <span aria-hidden="true">↻</span></button>
      </div>
      <footer className="page-footer"><span>FAILURE REVIEW BOARD / SEED {debrief.seed}</span><span>DECISIONS &amp; OUTCOMES SAVED <span className="footer-star">✳</span></span></footer>
    </section>
  )
}

const EVENT_TITLES = { insertion: 'Catch the Moon', eclipse: 'Into the shadow', science: 'Investigate the surface', communications: 'Send the evidence home' }
const EVENT_EXPLANATIONS = {
  insertion: 'Brake enough to enter lunar orbit without using up your maneuver reserve.',
  eclipse: 'Sunlight is gone, so demand must fit your generator and battery supply.',
  science: 'A polar target offers new clues, but observing it takes power.',
  communications: 'Your Earth connection has faded with science data still aboard.',
}
const CHOICE_LABELS: Record<string, string> = {
  nominal: 'Balanced braking', conserve: 'Save maneuver reserve', precision: 'Aim for precision',
  'full-science': 'Keep observing', 'low-power': 'Use less power', hibernate: 'Sleep the instruments',
  reacquire: 'Reconnect now', buffer: 'Store & forward', 'reduced-rate': 'Send a smaller set',
  'target-ice': 'Investigate ice clues', 'map-rim': 'Map the crater rim', 'stand-down': 'Skip this observation',
}
const CHOICE_GUIDANCE: Record<string, [string, string]> = {
  nominal: ['Balanced science', 'Needs the planned reserve'],
  conserve: ['Save maneuver reserve', 'Less science; still needs enough braking'],
  precision: ['More science if successful', 'Extra reserve needed'],
  'full-science': ['Most eclipse science if powered', 'Power shortage can damage systems'],
  'low-power': ['Lower demand', 'Less science; shortage may remain'],
  hibernate: ['Lowest instrument demand', 'No eclipse science; shortage may remain'],
  reacquire: ['Restore data return', 'Long outages can defeat your link'],
  buffer: ['Protect collected data', 'Hardware limits how much returns'],
  'reduced-rate': ['Reliable smaller return', 'Less data reaches Earth'],
  'target-ice': ['Gather ice clues', 'Power shortage reduces yield and health'],
  'map-rim': ['Gain terrain context', 'Less focus on ice; needs power'],
  'stand-down': ['Save power', 'No new evidence'],
}
