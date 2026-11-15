import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'

const buildResult = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    lib: {
      entry: 'src/missionSimulation.ts',
      formats: ['es'],
      fileName: 'missionSimulation',
    },
    target: 'esnext',
    write: false,
  },
})
const outputs = Array.isArray(buildResult) ? buildResult[0].output : buildResult.output
const bundle = outputs.find((item) => item.type === 'chunk')
assert.ok(bundle)
const simulation = await import(`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`)

const SEED = 104729

// Generation and storage are separate equipment: `powerId` is the generator, `battery` adds storage.
function makeDesign({
  powerId = 'solar',
  battery = false,
  launchPenaltyMps = 0,
} = {}) {
  const powerCapacityW = powerId === 'solar' ? 500 : 320
  return {
    instrumentIds: ['LEND'],
    instrumentNames: ['Lunar Exploration Neutron Detector'],
    powerId,
    powerName: powerId === 'solar' ? 'Deployable solar array' : 'Radioisotope generator',
    eclipseGenerationW: powerId === 'rtg' ? 320 : 0,
    batteryId: battery ? 'high-density' : 'none',
    batteryName: battery ? 'High-density battery' : null,
    batteryEnergyCapacityWh: battery ? 480 : 0,
    batteryDischargeLimitW: battery ? 240 : 0,
    propulsionId: 'cold-gas',
    propulsionName: 'Cold-gas thrusters',
    communicationsId: 'x-band',
    communicationsName: 'X-band high-gain dish',
    massKg: battery ? 95 : 77,
    massLimitKg: 150,
    massMarginKg: battery ? 55 : 73,
    powerLoadW: 220,
    powerCapacityW,
    powerMarginW: powerCapacityW - 220,
    costK: battery ? 1600 : 1340,
    budgetLimitK: 2400,
    budgetMarginK: battery ? 800 : 1060,
    launchPenaltyMps,
    launchDate: '2027-01-22',
  }
}

function startMission(design, seed = SEED) {
  return simulation.missionReducer(null, { type: 'START', seed, design })
}

function resolve(state, event, choiceId) {
  return simulation.missionReducer(state, {
    type: 'RESOLVE_EVENT',
    eventId: event.id,
    choiceId,
  })
}

function driveToEclipse(state) {
  for (let count = 0; count < 200; count += 1) {
    if (state.status === 'awaiting-decision') {
      const event = simulation.getCurrentMissionEvent(state)
      assert.ok(event)
      if (event.type === 'eclipse') return state
      const choiceId = event.type === 'insertion'
        ? 'nominal'
        : event.type === 'science'
          ? 'stand-down'
          : 'buffer'
      state = resolve(state, event, choiceId)
    } else {
      state = simulation.missionReducer(state, { type: 'TICK' })
    }
  }
  assert.fail('Eclipse event was not reached')
}

function driveToScience(state) {
  for (let count = 0; count < 200; count += 1) {
    if (state.status === 'awaiting-decision') {
      const event = simulation.getCurrentMissionEvent(state)
      assert.ok(event)
      if (event.type === 'science') return state
      const choiceId = event.type === 'insertion'
        ? 'nominal'
        : event.type === 'eclipse'
          ? 'hibernate'
          : 'buffer'
      state = resolve(state, event, choiceId)
    } else {
      state = simulation.missionReducer(state, { type: 'TICK' })
    }
  }
  assert.fail('Science opportunity was not reached')
}

function completeMission(state) {
  for (let count = 0; count < 200 && state.status !== 'complete'; count += 1) {
    if (state.status === 'awaiting-decision') {
      const event = simulation.getCurrentMissionEvent(state)
      assert.ok(event)
      const choiceId = event.type === 'insertion'
        ? 'nominal'
        : event.type === 'science'
          ? 'target-ice'
          : event.type === 'eclipse'
            ? 'full-science'
            : 'buffer'
      state = resolve(state, event, choiceId)
    } else {
      state = simulation.missionReducer(state, { type: 'TICK' })
    }
  }
  assert.equal(state.status, 'complete')
  return state
}

test('failed seed-104729 insertion blocks orbital science and forces Failure', () => {
  let state = startMission(makeDesign({ launchPenaltyMps: 240 }))
  const insertion = state.scenario.events.find((event) => event.type === 'insertion')
  assert.equal(insertion.requiredDeltaVMps, 287)
  assert.equal(state.telemetry.deltaVRemainingMps, 180)

  while (state.status !== 'awaiting-decision') {
    state = simulation.missionReducer(state, { type: 'TICK' })
  }
  state = resolve(state, insertion, 'nominal')
  const insertionResult = state.resolvedEvents.find((event) => event.type === 'insertion')
  assert.equal(state.telemetry.orbitAchieved, false)
  assert.equal(state.telemetry.deltaVRemainingMps, 0)
  assert.equal(insertionResult.deltaVShortfallMps, 107)

  state = completeMission(state)
  const skippedOrbitalEvents = state.resolvedEvents.filter(
    (event) => event.type === 'eclipse' || event.type === 'science',
  )
  assert.equal(skippedOrbitalEvents.length, 2)
  assert.ok(skippedOrbitalEvents.every((event) => event.choiceId === 'orbit-unavailable'))
  assert.ok(skippedOrbitalEvents.every((event) => event.scienceDelta === 0))
  assert.deepEqual(state.scienceFindings, [])

  const debrief = simulation.calculateMissionDebrief(state)
  assert.equal(debrief.result, 'Failure')
  assert.equal(debrief.objectives.primary.complete, false)
  const insertionAdvice = debrief.recommendations.find((item) => item.objective.includes('failed lunar orbit insertion'))
  assert.match(insertionAdvice.text, /107 m\/s short/)
  const primaryAdvice = debrief.recommendations.find((item) => item.objective.includes('Primary objective')).text
  assert.match(primaryAdvice, /Correct the propulsion reserve or launch-window penalty/)
  assert.doesNotMatch(primaryAdvice, /rather than the recorded “Orbital opportunity unavailable”/)
  assert.match(primaryAdvice, /No candidate classification was possible/)
})

test('solar headroom is not counted during a full eclipse', () => {
  let state = driveToEclipse(startMission(makeDesign({ powerId: 'solar' })))
  const eclipse = simulation.getCurrentMissionEvent(state)
  assert.equal(eclipse.durationHours, 0.5)
  state = resolve(state, eclipse, 'full-science')

  const result = state.resolvedEvents.find((event) => event.id === eclipse.id)
  assert.equal(result.eclipsePowerFlow.generationW, 0)
  assert.equal(result.eclipsePowerFlow.batteryDischargeW, 0)
  assert.equal(result.eclipsePowerFlow.suppliedW, 0)
  assert.equal(result.eclipsePowerFlow.shortfallW, result.eclipsePowerFlow.demandW)
  assert.equal(result.eclipsePowerFlow.batteryEnergyUsedWh, 0)
  assert.equal(result.scienceDelta, 0)
  assert.ok(result.healthDelta < 0)
  assert.match(result.outcome, /0\.5 h.*0 W.*Wh/)
})

test('battery eclipse power is limited by discharge W and stored Wh over hours', () => {
  const design = makeDesign({ powerId: 'solar', battery: true })
  let state = driveToEclipse(startMission(design))
  const eclipse = simulation.getCurrentMissionEvent(state)
  state = resolve(state, eclipse, 'full-science')

  const result = state.resolvedEvents.find((event) => event.id === eclipse.id)
  const flow = result.eclipsePowerFlow
  assert.equal(state.design.batteryEnergyCapacityWh, 480)
  assert.equal(flow.durationHours, 0.5)
  assert.equal(flow.generationW, 0)
  assert.ok(flow.batteryDischargeW <= design.batteryDischargeLimitW)
  assert.equal(flow.batteryEnergyUsedWh, flow.batteryDischargeW * flow.durationHours)
  assert.equal(flow.batteryEnergyRemainingWh, flow.batteryEnergyBeforeWh - flow.batteryEnergyUsedWh)
  assert.equal(state.telemetry.batteryEnergyRemainingWh, flow.batteryEnergyRemainingWh)
  assert.ok(flow.shortfallW > 0)
  assert.ok(result.healthDelta < 0)
})

test('seed 3 hibernation requires explicit restoration and counts full instrument draw', () => {
  const design = {
    ...makeDesign(),
    instrumentIds: ['LEND', 'MINI_RF'],
    instrumentNames: ['Lunar Exploration Neutron Detector', 'Miniature Radio Frequency Instrument'],
    propulsionId: 'electric',
    propulsionName: 'Electric microthrusters',
    communicationsId: 'laser',
    communicationsName: 'Optical laser terminal',
    massKg: 104,
    massMarginKg: 46,
    powerLoadW: 470,
    powerMarginW: 30,
    costK: 2200,
    budgetMarginK: 200,
  }

  let hibernatedState = driveToEclipse(startMission(design, 3))
  const eclipse = simulation.getCurrentMissionEvent(hibernatedState)
  assert.equal(eclipse.extraPowerW, 93)
  hibernatedState = resolve(hibernatedState, eclipse, 'hibernate')
  assert.equal(hibernatedState.telemetry.instrumentsHibernated, true)
  assert.equal(hibernatedState.telemetry.powerReliefW, 0)

  hibernatedState = driveToScience(hibernatedState)
  const scienceEvent = simulation.getCurrentMissionEvent(hibernatedState)
  assert.equal(scienceEvent.requiredPowerW, 86)
  hibernatedState = resolve(hibernatedState, scienceEvent, 'target-ice')
  const hibernatedRunScience = hibernatedState.resolvedEvents.find((event) => event.id === scienceEvent.id)
  assert.equal(hibernatedState.telemetry.instrumentsHibernated, false)
  assert.match(hibernatedRunScience.outcome, /restored; their full 220 W draw was included/)
  assert.match(hibernatedRunScience.causalFactors.join(' '), /30 W against a 86 W observation requirement, a 56 W shortfall/)

  let baselineState = driveToEclipse(startMission(design, 3))
  baselineState = resolve(baselineState, simulation.getCurrentMissionEvent(baselineState), 'full-science')
  baselineState = driveToScience(baselineState)
  const baselineScienceEvent = simulation.getCurrentMissionEvent(baselineState)
  baselineState = resolve(baselineState, baselineScienceEvent, 'target-ice')
  const baselineRunScience = baselineState.resolvedEvents.find((event) => event.id === baselineScienceEvent.id)
  assert.equal(hibernatedRunScience.scienceDelta, baselineRunScience.scienceDelta)

  let noRestoreState = driveToEclipse(startMission(design, 3))
  noRestoreState = resolve(noRestoreState, simulation.getCurrentMissionEvent(noRestoreState), 'hibernate')
  noRestoreState = driveToScience(noRestoreState)
  const noRestoreEvent = simulation.getCurrentMissionEvent(noRestoreState)
  noRestoreState = resolve(noRestoreState, noRestoreEvent, 'stand-down')
  assert.equal(noRestoreState.telemetry.instrumentsHibernated, true)
  assert.deepEqual(noRestoreState.resolvedEvents.find((event) => event.id === noRestoreEvent.id).scienceFindings, [])
})
