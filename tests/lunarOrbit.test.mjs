// Checks the real-orbit reference figures against hand calculations from the NASA Moon Fact Sheet values.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'vite'

const result = await build({
  configFile: false,
  logLevel: 'silent',
  build: { lib: { entry: 'src/lunarOrbit.ts', formats: ['es'], fileName: 'bundle' }, target: 'esnext', write: false },
})
const outputs = Array.isArray(result) ? result[0].output : result.output
const orbit = await import(`data:text/javascript;base64,${Buffer.from(outputs.find((item) => item.type === 'chunk').code).toString('base64')}`)

const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

test('uses the NASA Moon Fact Sheet constants', () => {
  assert.equal(orbit.MOON_GM_KM3_S2, 4900)
  assert.equal(orbit.MOON_RADIUS_KM, 1737.4)
})

test('50 km circular lunar orbit: speed, period and longest eclipse', () => {
  const reference = orbit.referenceOrbit(50)
  near(reference.speedKmS, 1.656, 0.001) // sqrt(4900 / 1787.4)
  near(reference.periodMinutes, 113.0, 0.2) // 2*pi*sqrt(1787.4^3 / 4900) / 60
  near(reference.maxEclipseMinutes, 48.0, 0.2) // asin(1737.4 / 1787.4) / pi * period
  near(reference.orbitsPerDay, 12.74, 0.03)
})

test('a higher orbit is slower, takes longer, and spends a smaller share in shadow', () => {
  const low = orbit.referenceOrbit(50)
  const high = orbit.referenceOrbit(200)
  assert.ok(high.speedKmS < low.speedKmS)
  assert.ok(high.periodMinutes > low.periodMinutes)
  assert.ok(high.maxEclipseShare < low.maxEclipseShare)
})
