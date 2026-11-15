import { useEffect, useState } from 'react'
import type { PointerEvent } from 'react'
import { MISSION_DURATION_SECONDS, type MissionState } from './missionSimulation'

type Sample = {
  seed: number
  t: number
  health: number
  science: number
  battery: number | null
}

type SeriesKey = 'health' | 'science' | 'battery'

// Colours checked for colour-blind separation and contrast against the panel surface (#10131b).
// Dash patterns and end labels repeat the identity, so it never depends on colour alone.
const SERIES: { key: SeriesKey; label: string; color: string; dash?: string }[] = [
  { key: 'health', label: 'Health', color: '#3987e5' },
  { key: 'science', label: 'Science', color: '#199e70', dash: '6 3' },
  { key: 'battery', label: 'Battery', color: '#c98500', dash: '2 3' },
]

const WIDTH = 300
const HEIGHT = 150
const PLOT = { left: 26, right: 236, top: 20, bottom: 126 }

function x(t: number) {
  return PLOT.left + (t / MISSION_DURATION_SECONDS) * (PLOT.right - PLOT.left)
}

function y(value: number) {
  return PLOT.bottom - (Math.max(0, Math.min(100, value)) / 100) * (PLOT.bottom - PLOT.top)
}

function sampleOf(state: MissionState): Sample {
  const capacity = state.design.batteryEnergyCapacityWh
  return {
    seed: state.seed,
    t: state.elapsedSeconds,
    health: state.telemetry.health,
    science: Math.min(100, state.telemetry.scienceProgress),
    battery: capacity > 0 ? (state.telemetry.batteryEnergyRemainingWh / capacity) * 100 : null,
  }
}

function same(a: Sample, b: Sample) {
  return a.t === b.t && a.health === b.health && a.science === b.science && a.battery === b.battery
}

/**
 * Telemetry history for the live mission: health, science and battery on one 0–100% axis, with a
 * marker at every resolved event. A decision changes values while the clock is paused, so it shows
 * as a vertical step at that event.
 */
export function TelemetryHistory({ state }: { state: MissionState }) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const current = sampleOf(state)
  const sampleKey = `${current.seed}:${current.t}:${current.health}:${current.science}:${current.battery}`

  useEffect(() => {
    setSamples((previous) => {
      const last = previous[previous.length - 1]
      // A new mission, or a restarted clock, starts a fresh record.
      if (last && (last.seed !== current.seed || last.t > current.t)) return [current]
      if (last && same(last, current)) return previous
      return [...previous, current]
    })
    // sampleKey carries every field of `current`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey])

  const record = samples.length > 0 ? samples : [current]
  const latest = record[record.length - 1]
  const series = SERIES.filter((item) => latest[item.key] !== null)
  const shown = hoverIndex !== null && record[hoverIndex] ? record[hoverIndex] : latest
  const eventTimes = new Map(state.scenario.events.map((event) => [event.id, event.triggerSecond]))

  // Direct labels at the line ends, nudged apart so they never overlap.
  const endLabels = series
    .map((item) => ({ ...item, value: latest[item.key] as number, labelY: y(latest[item.key] as number) }))
    .sort((a, b) => a.labelY - b.labelY)
  for (let index = 1; index < endLabels.length; index += 1) {
    endLabels[index].labelY = Math.max(endLabels[index].labelY, endLabels[index - 1].labelY + 10)
  }
  const overflow = endLabels.length > 0 ? endLabels[endLabels.length - 1].labelY - (PLOT.bottom + 2) : 0
  if (overflow > 0) endLabels.forEach((label) => { label.labelY -= overflow })

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const viewX = ((event.clientX - bounds.left) / bounds.width) * WIDTH
    const t = ((viewX - PLOT.left) / (PLOT.right - PLOT.left)) * MISSION_DURATION_SECONDS
    let nearest = 0
    record.forEach((sample, index) => {
      // `<=` keeps the later of two samples at the same second: the value after the decision.
      if (Math.abs(sample.t - t) <= Math.abs(record[nearest].t - t)) nearest = index
    })
    setHoverIndex(nearest)
  }

  const changes = record.filter((sample, index) => index === 0 || index === record.length - 1 || sample.t === record[index - 1].t)

  return (
    <section className="telemetry-history" aria-label="Telemetry history">
      <div className="telemetry-history-heading">
        <span>TELEMETRY HISTORY</span>
        <ul className="telemetry-history-legend">
          {series.map((item) => (
            <li key={item.key}>
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="18" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} />
              </svg>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      <svg
        className="telemetry-history-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Health, science${series.length > 2 ? ' and battery' : ''} as a percentage over mission time. Latest: ${series.map((item) => `${item.label} ${Math.round(latest[item.key] as number)}%`).join(', ')}.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line className="history-grid" x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} />
            <text className="history-axis" x={PLOT.left - 4} y={y(tick) + 3} textAnchor="end">{tick === 100 ? '100%' : tick}</text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75].map((tick) => (
          <text className="history-axis" key={tick} x={x(tick)} y={PLOT.bottom + 11} textAnchor="middle">{tick}</text>
        ))}
        <text className="history-axis" x={PLOT.right + 6} y={PLOT.bottom + 11}>sec</text>

        {state.resolvedEvents.map((event, index) => {
          const at = x(eventTimes.get(event.id) ?? 0)
          return (
            <g key={event.id}>
              <title>{`Event ${index + 1}: ${event.title} — ${event.choiceLabel}`}</title>
              <line className="history-event" x1={at} x2={at} y1={PLOT.top - 6} y2={PLOT.bottom} />
              <circle className="history-event-dot" cx={at} cy={PLOT.top - 11} r="5" />
              <text className="history-event-number" x={at} y={PLOT.top - 8.5} textAnchor="middle">{index + 1}</text>
            </g>
          )
        })}

        {series.map((item) => (
          <polyline
            key={item.key}
            fill="none"
            stroke={item.color}
            strokeWidth="2"
            strokeDasharray={item.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={record.map((sample) => `${x(sample.t).toFixed(1)},${y(sample[item.key] as number).toFixed(1)}`).join(' ')}
          />
        ))}

        {hoverIndex !== null && (
          <line className="history-crosshair" x1={x(shown.t)} x2={x(shown.t)} y1={PLOT.top} y2={PLOT.bottom} />
        )}
        {series.map((item) => (
          <circle
            key={item.key}
            className="history-point"
            cx={x(shown.t)}
            cy={y(shown[item.key] as number)}
            r="4"
            fill={item.color}
          />
        ))}

        {endLabels.map((label) => (
          <g key={label.key}>
            <circle cx={PLOT.right + 9} cy={label.labelY - 3} r="2.5" fill={label.color} />
            <text className="history-end-label" x={PLOT.right + 15} y={label.labelY}>
              {label.label} {Math.round(label.value)}
            </text>
          </g>
        ))}
      </svg>
      <p className="telemetry-history-readout" aria-hidden="true">
        <strong>T+{shown.t} s</strong>
        {series.map((item) => <span key={item.key}>{item.label} {Math.round(shown[item.key] as number)}%</span>)}
      </p>
      <details className="telemetry-history-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr><th scope="col">Time</th>{series.map((item) => <th scope="col" key={item.key}>{item.label}</th>)}</tr>
          </thead>
          <tbody>
            {changes.map((sample, index) => (
              <tr key={`${sample.t}-${index}`}>
                <th scope="row">T+{sample.t} s</th>
                {series.map((item) => <td key={item.key}>{Math.round(sample[item.key] as number)}%</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="telemetry-history-note">Numbered markers are resolved events. Hover the chart to read any moment.</p>
    </section>
  )
}
