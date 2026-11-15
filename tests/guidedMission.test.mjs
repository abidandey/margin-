import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'

const result = await build({ configFile: false, logLevel: 'silent', build: {
  lib: { entry: 'src/guidedMission.ts', formats: ['es'], fileName: 'guided' }, target: 'esnext', write: false,
} })
const outputs = Array.isArray(result) ? result[0].output : result.output
const bundle = outputs.find(item => item.type === 'chunk')
const { compareMissionRuns, getReviewTakeaway, getRetryFocus } = await import(`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`)
const baseline = { result: 'Success', telemetry: { health: 78, scienceProgress: 65, dataReturnedPoints: 55 } }
test('replay distinguishes improvement, no change, regression and mixed tradeoffs', () => {
  const changed = telemetry => ({ ...baseline, telemetry: { ...baseline.telemetry, ...telemetry } })
  assert.equal(compareMissionRuns(baseline, changed({ health: 82 })), 'Improved')
  assert.equal(compareMissionRuns(baseline, changed({})), 'Unchanged')
  assert.equal(compareMissionRuns(baseline, changed({ health: 70 })), 'Worse')
  assert.equal(compareMissionRuns(baseline, changed({ health: 82, scienceProgress: 50 })), 'Mixed results')
  assert.equal(compareMissionRuns(baseline, { ...changed({}), result: 'Failure' }), 'Worse')
})
test('eclipse retry explains combined causes and suggests a response before replacing an installed battery', () => {
  const debrief = { telemetry: { orbitAchieved: true }, design: { batteryName: 'High-density battery' }, eventResults: [
    { type: 'eclipse', choiceId: 'full-science', healthDelta: -22, eclipsePowerFlow: { shortfallW: 221 } },
  ] }
  assert.match(getReviewTakeaway(debrief).cause, /221 W/)
  assert.match(getReviewTakeaway(debrief).recommendation, /hibernating/)
  assert.equal(getRetryFocus(debrief).category, 'power')
})
