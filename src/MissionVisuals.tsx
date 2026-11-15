import { useId } from 'react'
import {
  MISSION_PHASES,
  type MissionDesign,
  type MissionEvent,
  type MissionState,
} from './missionSimulation'
import type { MissionSubsystem } from './missionSubsystems'

export type SpacecraftConfiguration = Pick<
  MissionDesign,
  'instrumentNames' | 'powerId' | 'powerName' | 'propulsionName' | 'communicationsName'
>

const subsystemLabels: Record<MissionSubsystem, string> = {
  science: 'Science instruments',
  power: 'Power system',
  propulsion: 'Propulsion',
  communications: 'Communications',
}

function orbitPosition(state: MissionState, event: MissionEvent | null) {
  if (event?.type === 'eclipse') return { x: 492, y: 174 }
  if (event?.type === 'science') return { x: 470, y: 242 }
  const phaseIndex = MISSION_PHASES.indexOf(state.phase)

  if (phaseIndex < 2) {
    const progress = Math.min(state.elapsedSeconds / 30, 1)
    return { x: 82 + progress * 176, y: 218 - progress * 37 }
  }
  if (!state.telemetry.orbitAchieved) {
    const progress = Math.min(Math.max((state.elapsedSeconds - 30) / 15, 0), 1)
    return { x: 260 + progress * 34, y: 181 - progress * 20 }
  }

  const orbitalElapsed = Math.max(0, state.elapsedSeconds - 45)
  const angle = -Math.PI / 2 + orbitalElapsed * 0.12
  return {
    x: 385 + Math.cos(angle) * 124,
    y: 174 + Math.sin(angle) * 104,
  }
}

export function MissionOrbitalVisualization({
  state,
  event,
}: {
  state: MissionState
  event: MissionEvent | null
}) {
  const prefix = useId().replace(/:/g, '')
  const position = orbitPosition(state, event)
  const isEclipse = event?.type === 'eclipse'
  const isScience = event?.type === 'science'
  const isCommunications = event?.type === 'communications'
  const orbitStatus = state.telemetry.orbitAchieved
    ? 'LUNAR ORBIT ACHIEVED'
    : state.phase === 'Lunar Orbit Insertion'
      ? 'ORBIT INSERTION IN PROGRESS'
      : 'ORBIT NOT YET ACHIEVED'

  return (
    <section className={`mission-scene${isEclipse ? ' is-eclipse' : ''}`} aria-label="Simplified lunar mission visualization">
      <div className="mission-scene-heading">
        <div>
          <p className="section-kicker">FLIGHT DYNAMICS · SCHEMATIC</p>
          <h2>{state.phase}</h2>
        </div>
        <span className={`orbit-state${state.telemetry.orbitAchieved ? ' is-achieved' : ''}`}>
          {isEclipse ? 'ECLIPSE SHADOW · SOLAR 0 W' : orbitStatus}
        </span>
      </div>
      <svg className="mission-orbit-svg" viewBox="0 0 560 310" role="img" aria-labelledby={`${prefix}-title ${prefix}-desc`}>
        <title id={`${prefix}-title`}>Illustrative lunar orbiter mission diagram</title>
        <desc id={`${prefix}-desc`}>
          Earth, a schematic lunar south pole, the spacecraft and its orbit. Current phase: {state.phase}.
          {isEclipse ? ' The spacecraft is shown in eclipse shadow.' : ''}
          {isScience ? ' A science observation targets the south-polar region.' : ''}
          {isCommunications ? ' A communications link interruption is in progress between the spacecraft and Earth.' : ''}
        </desc>
        <defs>
          <radialGradient id={`${prefix}-moon`} cx="36%" cy="28%">
            <stop offset="0%" stopColor="#d0d0c5" />
            <stop offset="65%" stopColor="#858a8d" />
            <stop offset="100%" stopColor="#404852" />
          </radialGradient>
          <radialGradient id={`${prefix}-earth`} cx="38%" cy="30%">
            <stop offset="0%" stopColor="#b6d3d5" />
            <stop offset="100%" stopColor="#426674" />
          </radialGradient>
        </defs>
        <path className="flight-path" d="M 64 76 Q 142 13 224 123 Q 258 172 270 168" />
        <ellipse className={`orbit-path${state.telemetry.orbitAchieved ? ' is-active' : ''}`} cx="385" cy="174" rx="124" ry="104" />
        <circle className="earth-body" cx="42" cy="68" r="23" fill={`url(#${prefix}-earth)`} />
        <path className="earth-meridian" d="M 32 48 Q 52 68 32 88 M 24 62 Q 42 66 60 60" />
        <text className="scene-body-label" x="15" y="112">EARTH</text>

        <circle className="moon-body" cx="385" cy="174" r="96" fill={`url(#${prefix}-moon)`} />
        <circle className="moon-crater" cx="350" cy="145" r="12" />
        <circle className="moon-crater" cx="419" cy="163" r="18" />
        <circle className="moon-crater" cx="366" cy="202" r="9" />
        <circle className="moon-crater" cx="428" cy="220" r="11" />
        <path className="moon-terminator" d="M 410 80 C 468 103 491 145 481 194 C 475 222 457 244 430 257" />
        <ellipse className={`eclipse-shadow${isEclipse ? ' is-visible' : ''}`} cx="530" cy="174" rx="55" ry="81" />
        <ellipse className="south-pole-ring" cx="405" cy="254" rx="20" ry="7" />
        <circle className={`science-target${isScience ? ' is-active' : ''}`} cx="405" cy="254" r="7" />
        <text className="scene-body-label" x="360" y="291">SOUTH POLE</text>

        {isScience && (
          <path className="science-beam" d={`M ${position.x} ${position.y} L 405 254`} />
        )}
        {isCommunications && (
          <>
            <path className="communication-signal is-interrupted" d={`M ${position.x} ${position.y} Q 260 18 64 72`} />
            <text className="signal-label is-interrupted" x="150" y="46">LINK INTERRUPTION</text>
          </>
        )}

        <g
          className={`scene-spacecraft${isEclipse ? ' in-shadow' : ''}`}
          transform={`translate(${position.x} ${position.y})`}
          aria-label={`Spacecraft at mission second ${state.elapsedSeconds}`}
        >
          <title>{state.design.instrumentNames.join(' + ')} · {state.design.powerName}</title>
          {state.design.powerId === 'solar'
            ? (
              <>
                <rect className="solar-wing" x="-29" y="-5" width="18" height="10" rx="1" />
                <rect className="solar-wing" x="11" y="-5" width="18" height="10" rx="1" />
                <path className="solar-cell-lines" d="M -23 -5 V 5 M -17 -5 V 5 M 17 -5 V 5 M 23 -5 V 5" />
              </>
            )
            : <rect className="spacecraft-power-module" x="-29" y="-7" width="18" height="14" rx="2" />}
          <rect className="spacecraft-bus" x="-10" y="-9" width="20" height="18" rx="3" />
          <path className="spacecraft-antenna" d="M 0 -9 L 8 -19 M 5 -19 Q 13 -15 12 -9" />
          <path className="spacecraft-engine" d="M -4 9 L 0 15 L 4 9" />
          {isEclipse && <circle className="shadow-indicator" r="18" />}
        </g>
      </svg>
      <div className="mission-scene-footer">
        <span>{event ? `EVENT · ${event.title.toUpperCase()}` : `MISSION TIME · ${state.elapsedSeconds} / 75 SEC`}</span>
        <span>SIMPLIFIED ORBIT ANIMATION · NOT A PHYSICALLY ACCURATE TRAJECTORY</span>
      </div>
    </section>
  )
}

export function SpacecraftSchematic({
  configuration,
  affectedSubsystem = null,
  selectedSubsystem = null,
  payloadHibernated = false,
  compact = false,
}: {
  configuration: SpacecraftConfiguration
  affectedSubsystem?: MissionSubsystem | null
  selectedSubsystem?: MissionSubsystem | null
  payloadHibernated?: boolean
  compact?: boolean
}) {
  const subsystemClass = (subsystem: MissionSubsystem) => [
    'schematic-subsystem',
    selectedSubsystem === subsystem ? 'is-selected' : '',
    `subsystem-${subsystem}`,
    affectedSubsystem === subsystem ? 'is-affected' : '',
    subsystem === 'science' && payloadHibernated ? 'is-hibernated' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className={`spacecraft-schematic${compact ? ' is-compact' : ''}`} aria-label="Selected spacecraft subsystem schematic">
      <div className="schematic-heading">
        <p className="section-kicker">SPACECRAFT CONFIGURATION · SCHEMATIC</p>
        {affectedSubsystem
          ? <span className="schematic-active-label">ACTIVE · {subsystemLabels[affectedSubsystem].toUpperCase()}</span>
          : selectedSubsystem
            ? <span className="schematic-active-label">SELECTED · {subsystemLabels[selectedSubsystem].toUpperCase()}</span>
            : null}
      </div>
      <svg viewBox="0 0 420 150" role="img" aria-label="Spacecraft with labeled science payload, solar power arrays, propulsion and communications components">
        <g className={subsystemClass('power')}>
          <title>Power system: {configuration.powerName}</title>
          {configuration.powerId === 'solar'
            ? (
              <>
                <rect className="schematic-array" x="35" y="52" width="112" height="39" rx="2" />
                <path className="schematic-array-grid" d="M 63 52 V 91 M 91 52 V 91 M 119 52 V 91 M 35 71 H 147" />
                <rect className="schematic-array" x="273" y="52" width="112" height="39" rx="2" />
                <path className="schematic-array-grid" d="M 301 52 V 91 M 329 52 V 91 M 357 52 V 91 M 273 71 H 385" />
                <path className="schematic-boom" d="M 147 71 H 170 M 250 71 H 273" />
              </>
            )
            : (
              <>
                <rect className="schematic-power-module" x="65" y="54" width="82" height="36" rx="3" />
                <path className="schematic-power-lines" d="M 76 63 H 136 M 76 72 H 136 M 76 81 H 136" />
                <path className="schematic-boom" d="M 147 71 H 170" />
              </>
            )}
        </g>
        <g className={subsystemClass('science')}>
          <title>Science instruments: {configuration.instrumentNames.join(' and ')}{payloadHibernated ? ' (hibernated)' : ''}</title>
          <rect className="schematic-instrument" x="180" y="101" width="60" height="22" rx="2" />
          <path className="schematic-boom" d="M 210 91 V 101" />
        </g>
        <g className={subsystemClass('communications')}>
          <title>Communications: {configuration.communicationsName}</title>
          <path className="schematic-dish" d="M 225 37 Q 245 18 264 37 Q 245 56 225 37 Z" />
          <path className="schematic-boom" d="M 238 48 L 230 62" />
        </g>
        <g className="schematic-bus">
          <rect x="170" y="52" width="80" height="40" rx="4" />
          <path d="M 181 62 H 239 M 181 82 H 239" />
          <circle cx="210" cy="72" r="7" />
        </g>
        <g className={subsystemClass('propulsion')}>
          <title>Propulsion: {configuration.propulsionName}</title>
          <path className="schematic-engine" d="M 197 92 L 210 108 L 223 92 Z" />
        </g>
      </svg>
      <div className="schematic-component-list">
        <div className={subsystemClass('science')} title={configuration.instrumentNames.join(' + ')}>
          <span>SCIENCE PAYLOAD</span><strong>{configuration.instrumentNames.join(' + ') || 'No instrument selected'}</strong>
        </div>
        <div className={subsystemClass('power')} title={configuration.powerName}>
          <span>{configuration.powerId === 'solar' ? 'SOLAR ARRAY' : configuration.powerId === 'rtg' ? 'RADIOISOTOPE POWER' : 'BATTERY POWER'}</span><strong>{configuration.powerName}</strong>
        </div>
        <div className={subsystemClass('propulsion')} title={configuration.propulsionName}>
          <span>PROPULSION</span><strong>{configuration.propulsionName}</strong>
        </div>
        <div className={subsystemClass('communications')} title={configuration.communicationsName}>
          <span>COMMUNICATIONS</span><strong>{configuration.communicationsName}</strong>
        </div>
      </div>
      {payloadHibernated && <p className="schematic-payload-state">PAYLOAD HIBERNATED · instruments remain off until restored</p>}
    </section>
  )
}
