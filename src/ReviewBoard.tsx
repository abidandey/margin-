import { useState } from 'react'
import {
  MISSION_DURATION_SECONDS,
  MISSION_PHASES,
  type MissionDebrief,
  type MissionEventResult,
} from './missionSimulation'
import { getAffectedSubsystem } from './missionSubsystems'
import { SpacecraftSchematic } from './MissionVisuals'
import { playSound } from './missionAudio'

type Severity = 'problem' | 'gain' | 'neutral'

const SEVERITY_LABEL: Record<Severity, string> = {
  problem: 'PROBLEM',
  gain: 'GAIN',
  neutral: 'NO CHANGE',
}

// Shape as well as colour, so the state never depends on colour alone.
const SEVERITY_MARK: Record<Severity, string> = {
  problem: '×',
  gain: '✓',
  neutral: '–',
}

function severityOf(event: MissionEventResult): Severity {
  if (event.healthDelta < 0 || event.deltaVShortfallMps > 0) return 'problem'
  if (event.scienceDelta > 0 || event.dataReturnedDelta > 0) return 'gain'
  return 'neutral'
}

function signed(value: number, unit: string) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)} ${unit}`
}

function effectsOf(event: MissionEventResult) {
  const effects: { label: string; value: string; bad: boolean }[] = []
  if (event.deltaVShortfallMps > 0) {
    effects.push({ label: 'Δv shortfall', value: `${Math.round(event.deltaVShortfallMps)} m/s`, bad: true })
  }
  if (Math.round(event.healthDelta) !== 0) {
    effects.push({ label: 'Health', value: signed(event.healthDelta, 'pts'), bad: event.healthDelta < 0 })
  }
  if (Math.round(event.scienceDelta) !== 0) {
    effects.push({ label: 'Science', value: signed(event.scienceDelta, 'pts'), bad: event.scienceDelta < 0 })
  }
  if (Math.round(event.deltaVDeltaMps) !== 0) {
    effects.push({ label: 'Δv reserve', value: signed(event.deltaVDeltaMps, 'm/s'), bad: false })
  }
  if (Math.round(event.dataReturnedDelta) !== 0) {
    effects.push({ label: 'Data returned', value: signed(event.dataReturnedDelta, 'pts'), bad: event.dataReturnedDelta < 0 })
  }
  if (Math.round(event.powerReliefDeltaW) !== 0) {
    effects.push({ label: 'Load shed', value: signed(event.powerReliefDeltaW, 'W'), bad: false })
  }
  return effects
}

function EffectChips({ event }: { event: MissionEventResult }) {
  const effects = effectsOf(event)
  if (effects.length === 0) return <p className="board-no-effect">No measurable change to the spacecraft.</p>
  return (
    <ul className="board-effects">
      {effects.map((effect) => (
        <li className={effect.bad ? 'is-bad' : ''} key={effect.label}>
          <span>{effect.label.toUpperCase()}</span>
          <strong>{effect.value}</strong>
        </li>
      ))}
    </ul>
  )
}

/**
 * Visual failure review board: a mission timeline with one marker per event. Selecting an event shows
 * which spacecraft system it hit, what it cost, why, and (after a same-seed redesign) what changed.
 */
export function FailureReviewBoard({
  debrief,
  previous,
}: {
  debrief: MissionDebrief
  previous: MissionDebrief | null
}) {
  const events = debrief.eventResults
  const triggerSecond = new Map(debrief.scenario.events.map((event) => [event.id, event.triggerSecond]))
  const worst = events.reduce<MissionEventResult | null>((current, event) => {
    if (severityOf(event) !== 'problem') return current
    if (!current) return event
    return event.healthDelta < current.healthDelta ? event : current
  }, null)
  const [selectedId, setSelectedId] = useState<string | null>(worst?.id ?? events[0]?.id ?? null)
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null
  const problemCount = events.filter((event) => severityOf(event) === 'problem').length

  if (!selected) return null

  const selectedSeverity = severityOf(selected)
  const subsystem = getAffectedSubsystem(selected)
  const prior = previous?.eventResults.find((event) => event.id === selected.id) ?? null

  return (
    <section className="review-section review-board" aria-labelledby="review-timeline-title">
      <div className="review-section-heading">
        <div>
          <p className="section-kicker">MISSION EVENT TIMELINE</p>
          <h2 id="review-timeline-title">Flight record</h2>
        </div>
        <span className="board-summary">
          {problemCount === 0
            ? 'NO PROBLEMS RECORDED'
            : `${problemCount} PROBLEM${problemCount === 1 ? '' : 'S'} RECORDED`} · SELECT AN EVENT
        </span>
      </div>

      <div className="board-track" aria-hidden="true">
        <div className="board-phases">
          {MISSION_PHASES.map((phase) => <span key={phase}>{phase}</span>)}
        </div>
        <div className="board-line">
          {events.map((event, index) => {
            const severity = severityOf(event)
            const left = ((triggerSecond.get(event.id) ?? 0) / MISSION_DURATION_SECONDS) * 100
            return (
              <button
                type="button"
                tabIndex={-1}
                key={event.id}
                className={`board-marker is-${severity}${event.id === selected.id ? ' is-selected' : ''}`}
                style={{ left: `${left}%` }}
                title={`${event.title} · ${SEVERITY_LABEL[severity]}`}
                onClick={() => setSelectedId(event.id)}
              >
                {index + 1}
              </button>
            )
          })}
        </div>
        <div className="board-scale"><span>T+0</span><span>T+{MISSION_DURATION_SECONDS} SEC</span></div>
      </div>

      <ol className="review-timeline">
        {events.map((event, index) => {
          const severity = severityOf(event)
          const eventSubsystem = getAffectedSubsystem(event)
          return (
            <li key={event.id} style={{ animationDelay: `${index * 80}ms` }}>
              <button
                type="button"
                className={`review-timeline-item board-card is-${severity}`}
                aria-pressed={event.id === selected.id}
                onClick={() => {
                  playSound('selection')
                  setSelectedId(event.id)
                }}
              >
                <span>{index + 1} · T+{triggerSecond.get(event.id) ?? 0} SEC · {event.phase.toUpperCase()}</span>
                <strong>{event.title}</strong>
                <small>{event.choiceLabel}</small>
                <span className="board-card-tags">
                  <span className={`board-status is-${severity}`}>
                    <span aria-hidden="true">{SEVERITY_MARK[severity]}</span> {SEVERITY_LABEL[severity]}
                  </span>
                  {eventSubsystem && <span className="timeline-subsystem">{eventSubsystem.toUpperCase()}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className={`board-detail is-${selectedSeverity}`} aria-live="polite">
        <div className="board-detail-diagram">
          <SpacecraftSchematic configuration={debrief.design} affectedSubsystem={subsystem} compact />
        </div>
        <div className="board-detail-copy">
          <p className="section-kicker">
            T+{triggerSecond.get(selected.id) ?? 0} SEC · {selected.phase.toUpperCase()}
            {subsystem ? ` · ${subsystem.toUpperCase()} AFFECTED` : ''}
          </p>
          <h3>{selected.title}</h3>
          <p className="board-choice">You chose: <strong>{selected.choiceLabel}</strong></p>
          <p className="board-outcome">{selected.outcome}</p>
          <EffectChips event={selected} />
          {selected.causalFactors.length > 0 && (
            <>
              <p className="board-why">WHY IT HAPPENED</p>
              <ul className="board-factors">
                {selected.causalFactors.map((factor) => <li key={factor}>{factor}</li>)}
              </ul>
            </>
          )}
          {prior ? (
            <div className="board-redesign">
              <p className="board-why">WHAT CHANGED AFTER REDESIGN · SAME SEED</p>
              <div className="board-redesign-columns">
                <div>
                  <span>BEFORE · {prior.choiceLabel}</span>
                  <EffectChips event={prior} />
                </div>
                <div>
                  <span>AFTER · {selected.choiceLabel}</span>
                  <EffectChips event={selected} />
                </div>
              </div>
            </div>
          ) : (
            <p className="board-hint">Redesign the spacecraft and fly this seed again to compare this event before and after.</p>
          )}
        </div>
      </div>
    </section>
  )
}
