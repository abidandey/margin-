// Regression tests for the power architecture: generation (W) is separate from battery storage (Wh)
// and battery discharge capability (W). All component values are illustrative game values.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'

async function load(entry) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: { lib: { entry, formats: ['es'], fileName: 'bundle' }, target: 'esnext', write: false },
  })
  const outputs = Array.isArray(result) ? result[0].output : result.output
  const bundle = outputs.find((item) => item.type === 'chunk')
  assert.ok(bundle)
  return import(`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`)
}

const design = await load('src/spacecraftDesign.ts')
const simulation = await load('src/missionSimulation.ts')

const SEED = 104729
const LAUNCH = { date: '2027-02-05', propulsionPenaltyMps: 0 }
// Lightest sensible load: LEND 70 W + cold-gas 80 W + UHF 45 W = 195 W.
const LOW_LOAD = { instrumentIds: ['LEND'], propulsion: 'cold-gas', communications: 'uhf' }

function driveToEclipse(state) {
  for (let count = 0; count < 200; count += 1) {
    if (state.status === 'awaiting-decision') {
      const event = simulation.getCurrentMissionEvent(state)
      assert.ok(event)
      if (event.type === 'eclipse') return state
      const choiceId = event.type === 'insertion' ? 'nominal' : event.type === 'science' ? 'stand-down' : 'buffer'
      state = simulation.missionReducer(state, { type: 'RESOLVE_EVENT', eventId: event.id, choiceId })
    } else {
      state = simulation.missionReducer(state, { type: 'TICK' })
    }
  }
  assert.fail('Eclipse event was not reached')
}

function flyEclipse(selection, choiceId = 'full-science') {
  const missionDesign = design.toMissionDesign(selection, LAUNCH)
  assert.ok(missionDesign)
  let state = driveToEclipse(simulation.missionReducer(null, { type: 'START', seed: SEED, design: missionDesign }))
  const eclipse = simulation.getCurrentMissionEvent(state)
  const reliefBeforeW = state.telemetry.powerReliefW
  state = simulation.missionReducer(state, { type: 'RESOLVE_EVENT', eventId: eclipse.id, choiceId })
  const result = state.resolvedEvents.find((event) => event.id === eclipse.id)
  return { missionDesign, eclipse, reliefBeforeW, state, result, flow: result.eclipsePowerFlow }
}

test('the catalogue separates generators from batteries', () => {
  for (const generator of design.COMPONENT_OPTIONS.power) {
    assert.ok(generator.output > 0, `${generator.name} must generate power`)
    assert.equal(generator.storageWh, undefined, `${generator.name} must not be a battery`)
    assert.equal(generator.maxDischargeW, undefined)
  }
  for (const battery of design.COMPONENT_OPTIONS.battery) {
    assert.equal(battery.output, undefined, `${battery.name} must not be listed as generating power`)
    assert.equal(battery.eclipseOutput, undefined)
  }
  assert.equal(design.COMPONENT_OPTIONS.power.find((option) => option.id === 'solar').eclipseOutput, 0)
  assert.equal(design.COMPONENT_OPTIONS.power.find((option) => option.id === 'rtg').eclipseOutput, 320)
})

test('a battery-only spacecraft is invalid, even when its load is under the battery discharge limit', () => {
  // Under the old rule this passed: 240 W "capacity" - 195 W load = +45 W margin.
  for (const power of ['none', 'battery']) {
    const result = design.evaluateDesign({ ...LOW_LOAD, power, battery: 'high-density' })
    assert.equal(result.loadW, 195)
    assert.ok(result.loadW < result.batteryDischargeLimitW, 'load is inside the discharge limit')
    assert.equal(result.generationW, 0)
    assert.equal(result.sustainedMarginW, -195)
    assert.equal(result.recharge.possible, false)
    assert.equal(result.isValid, false)
    assert.ok(result.blockingIssues.some((issue) => /battery only stores energy/.test(issue)))
    assert.equal(design.toMissionDesign({ ...LOW_LOAD, power, battery: 'high-density' }, LAUNCH), null)
  }
})

test('sustained supply counts generation only, never battery discharge', () => {
  // LEND 70 + Mini-RF 150 + electric 140 + laser 110 = 470 W.
  const heavy = { instrumentIds: ['LEND', 'MINI_RF'], propulsion: 'electric', communications: 'laser' }
  const rtgWithBattery = design.evaluateDesign({ ...heavy, power: 'rtg', battery: 'high-density' })
  assert.equal(rtgWithBattery.loadW, 470)
  assert.equal(rtgWithBattery.generationW, 320)
  assert.equal(rtgWithBattery.sustainedMarginW, -150)
  // 320 W + 240 W of discharge would cover 470 W, but a battery cannot sustain a load.
  assert.equal(rtgWithBattery.isValid, false)
  assert.ok(rtgWithBattery.blockingIssues.some((issue) => /Sunlit generation is 150 W short/.test(issue)))

  const solar = design.evaluateDesign({ ...heavy, power: 'solar', battery: 'none' })
  assert.equal(solar.sustainedMarginW, 30)
  assert.equal(solar.isValid, true)
})

test('battery mass and cost are counted in the spacecraft budgets', () => {
  const without = design.evaluateDesign({ ...LOW_LOAD, power: 'solar', battery: 'none' })
  const withBattery = design.evaluateDesign({ ...LOW_LOAD, power: 'solar', battery: 'high-density' })
  assert.equal(without.massKg, 18 + 22 + 25 + 8)
  assert.equal(without.costK, 360 + 340 + 420 + 160)
  assert.equal(withBattery.massKg - without.massKg, 18)
  assert.equal(withBattery.costK - without.costK, 260)
  assert.equal(withBattery.loadW, without.loadW)
  assert.equal(withBattery.generationW, without.generationW)
  const mission = design.toMissionDesign({ ...LOW_LOAD, power: 'solar', battery: 'high-density' }, LAUNCH)
  assert.equal(mission.massKg, 91)
  assert.equal(mission.costK, 1540)
  assert.equal(mission.powerCapacityW, 500)
  assert.equal(mission.batteryEnergyCapacityWh, 480)
  assert.equal(mission.batteryDischargeLimitW, 240)
})

test('eclipse power (W) and eclipse energy (Wh) are validated separately', () => {
  const solarOnly = design.evaluateDesign({ ...LOW_LOAD, power: 'solar', battery: 'none' })
  assert.equal(solarOnly.eclipse.generationW, 0)
  assert.equal(solarOnly.eclipse.powerAvailableW, 0)
  assert.equal(solarOnly.eclipse.powerShortfallW, 195)
  assert.equal(solarOnly.isValid, true, 'an eclipse risk is an advisory, not a launch block')
  assert.equal(solarOnly.advisories.length, 1)

  const solarBattery = design.evaluateDesign({ ...LOW_LOAD, power: 'solar', battery: 'high-density' })
  assert.equal(solarBattery.eclipse.batteryPowerNeededW, 195)
  assert.equal(solarBattery.eclipse.powerAvailableW, 240)
  assert.equal(solarBattery.eclipse.powerShortfallW, 0)
  assert.equal(solarBattery.eclipse.energyNeededWh, 97.5) // 195 W x 0.5 h
  assert.equal(solarBattery.eclipse.energyAvailableWh, 480)
  assert.equal(solarBattery.eclipse.energyShortfallWh, 0)
  assert.deepEqual(solarBattery.advisories, [])
  assert.equal(solarBattery.recharge.possible, true)
  assert.equal(solarBattery.recharge.surplusW, 305) // 500 W - 195 W
  assert.ok(Math.abs(solarBattery.recharge.hoursToFull - 480 / 305) < 1e-9)

  // Default two-instrument build: 310 W load. The battery has the energy (155 of 480 Wh)
  // but not the power (240 W limit), so only the power check fails.
  const powerLimited = design.evaluateDesign({
    instrumentIds: ['LEND', 'DIVINER'], power: 'solar', battery: 'high-density', propulsion: 'cold-gas', communications: 'x-band',
  })
  assert.equal(powerLimited.loadW, 310)
  assert.equal(powerLimited.eclipse.powerShortfallW, 70)
  assert.equal(powerLimited.eclipse.energyNeededWh, 155)
  assert.equal(powerLimited.eclipse.energyShortfallWh, 0)

  const rtg = design.evaluateDesign({ ...LOW_LOAD, power: 'rtg', battery: 'none' })
  assert.equal(rtg.eclipse.generationW, 320)
  assert.equal(rtg.eclipse.batteryPowerNeededW, 0)
  assert.equal(rtg.eclipse.energyNeededWh, 0)
  assert.deepEqual(rtg.advisories, [])
})

test('in flight, solar generation is zero in full eclipse and the battery supplies W limited by its Wh', () => {
  const { missionDesign, eclipse, reliefBeforeW, state, flow } = flyEclipse({ ...LOW_LOAD, power: 'solar', battery: 'high-density' })
  const expectedDemandW = missionDesign.powerLoadW - reliefBeforeW + eclipse.extraPowerW
  assert.equal(eclipse.durationHours, 0.5)
  assert.equal(flow.demandW, expectedDemandW)
  assert.equal(flow.generationW, 0)
  assert.equal(flow.batteryDischargeW, Math.min(expectedDemandW, 240, 480 / 0.5))
  assert.equal(flow.batteryEnergyBeforeWh, 480)
  assert.equal(flow.batteryEnergyUsedWh, flow.batteryDischargeW * 0.5)
  assert.equal(flow.batteryEnergyRemainingWh, 480 - flow.batteryEnergyUsedWh)
  assert.equal(flow.shortfallW, expectedDemandW - flow.batteryDischargeW)
  assert.equal(state.telemetry.batteryEnergyRemainingWh, flow.batteryEnergyRemainingWh)
  assert.ok(flow.batteryEnergyUsedWh > 0)
})

test('in flight, the same spacecraft without a battery has nothing to draw on in eclipse', () => {
  const withBattery = flyEclipse({ ...LOW_LOAD, power: 'solar', battery: 'high-density' })
  const without = flyEclipse({ ...LOW_LOAD, power: 'solar', battery: 'none' })
  assert.equal(without.flow.demandW, withBattery.flow.demandW, 'same seed, same load')
  assert.equal(without.flow.generationW, 0)
  assert.equal(without.flow.batteryDischargeW, 0)
  assert.equal(without.flow.batteryEnergyUsedWh, 0)
  assert.equal(without.flow.shortfallW, without.flow.demandW)
  assert.ok(without.result.healthDelta < 0)
  assert.ok(without.flow.shortfallW > withBattery.flow.shortfallW)
  assert.ok(without.result.healthDelta <= withBattery.result.healthDelta)
})

test('in flight, a radioisotope generator keeps its rated output through the eclipse', () => {
  const { flow, state } = flyEclipse({ ...LOW_LOAD, power: 'rtg', battery: 'none' })
  assert.equal(flow.generationW, 320)
  assert.equal(flow.batteryDischargeW, 0)
  assert.equal(flow.suppliedW, Math.min(flow.demandW, 320))
  assert.equal(state.telemetry.batteryEnergyRemainingWh, 0)
})

test('battery energy never increases during the mission: no recharge is credited without modelling a source', () => {
  let { state } = flyEclipse({ ...LOW_LOAD, power: 'solar', battery: 'high-density' })
  const afterEclipseWh = state.telemetry.batteryEnergyRemainingWh
  for (let count = 0; count < 200 && state.status !== 'complete'; count += 1) {
    if (state.status === 'awaiting-decision') {
      const event = simulation.getCurrentMissionEvent(state)
      const choiceId = event.type === 'science' ? 'target-ice' : 'buffer'
      state = simulation.missionReducer(state, { type: 'RESOLVE_EVENT', eventId: event.id, choiceId })
    } else {
      state = simulation.missionReducer(state, { type: 'TICK' })
    }
    assert.ok(state.telemetry.batteryEnergyRemainingWh <= afterEclipseWh)
  }
  assert.equal(state.status, 'complete')
})

test('viable combinations exist under the hard mass, power and budget limits', () => {
  const instrumentIds = ['LOLA', 'LAMP', 'LEND', 'DIVINER', 'LROC', 'MINI_RF', 'CRATER']
  const payloads = [
    ...instrumentIds.map((id) => [id]),
    ...instrumentIds.flatMap((first, index) => instrumentIds.slice(index + 1).map((second) => [first, second])),
  ]
  const counts = {}
  let total = 0
  for (const payload of payloads) {
    for (const power of design.COMPONENT_OPTIONS.power) {
      for (const battery of design.COMPONENT_OPTIONS.battery) {
        for (const propulsion of design.COMPONENT_OPTIONS.propulsion) {
          for (const communications of design.COMPONENT_OPTIONS.communications) {
            total += 1
            const result = design.evaluateDesign({
              instrumentIds: payload,
              power: power.id,
              battery: battery.id,
              propulsion: propulsion.id,
              communications: communications.id,
            })
            if (!result.isValid) continue
            // Every valid design respects each hard limit on its own.
            assert.ok(result.massKg <= design.MASS_LIMIT)
            assert.ok(result.costK <= design.BUDGET_LIMIT)
            assert.ok(result.generationW > 0)
            assert.ok(result.generationW >= result.loadW)
            const key = `${power.id}+${battery.id}`
            counts[key] ??= { valid: 0, eclipseSafe: 0 }
            counts[key].valid += 1
            if (result.advisories.length === 0) counts[key].eclipseSafe += 1
          }
        }
      }
    }
  }
  assert.equal(total, 28 * 2 * 2 * 3 * 3)
  for (const key of ['solar+none', 'solar+high-density', 'rtg+none', 'rtg+high-density']) {
    assert.ok(counts[key]?.valid > 0, `${key} must have at least one valid design`)
  }
  // Solar alone can never be eclipse-safe; the other three architectures each can be.
  assert.equal(counts['solar+none'].eclipseSafe, 0)
  assert.ok(counts['solar+high-density'].eclipseSafe > 0)
  assert.ok(counts['rtg+none'].eclipseSafe > 0)
  assert.ok(counts['rtg+high-density'].eclipseSafe > 0)
  console.log('valid designs by power architecture:', JSON.stringify(counts))
})
