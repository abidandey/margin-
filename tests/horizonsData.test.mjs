import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const cache = JSON.parse(await readFile(new URL('../src/data/horizons2027.json', import.meta.url), 'utf8'))
const expectedObservations = {
  '2027-01-08': { rangeAu: 0.00271707775930, lightTimeMinutes: 0.02259725 },
  '2027-01-22': { rangeAu: 0.00238837541544, lightTimeMinutes: 0.01986351 },
  '2027-02-05': { rangeAu: 0.00270962350854, lightTimeMinutes: 0.02253525 },
}

test('Horizons cache records its source, query and measurement units', () => {
  assert.equal(cache.source.name, 'NASA/JPL Horizons')
  assert.equal(cache.source.apiUrl, 'https://ssd.jpl.nasa.gov/api/horizons.api')
  assert.equal(cache.source.documentationUrl, 'https://ssd-api.jpl.nasa.gov/doc/horizons.html')
  assert.equal(cache.source.attribution, 'Orbital geometry: NASA/JPL Horizons — cached ephemeris data')
  assert.equal(cache.query.format, 'json')
  assert.equal(cache.query.COMMAND, "'301'")
  assert.equal(cache.query.CENTER, "'500@399'")
  assert.equal(cache.query.MAKE_EPHEM, "'YES'")
  assert.equal(cache.query.EPHEM_TYPE, "'OBSERVER'")
  assert.equal(cache.query.START_TIME, "'2027-01-08'")
  assert.equal(cache.query.STOP_TIME, "'2027-02-06'")
  assert.equal(cache.query.STEP_SIZE, "'1 d'")
  assert.equal(cache.query.QUANTITIES, "'20,21'")
  assert.equal(cache.query.CSV_FORMAT, "'YES'")
  assert.equal(cache.query.OBJ_DATA, "'NO'")
  assert.equal(cache.query.TIME_TYPE, "'UT'")
  assert.equal(cache.units.range, 'AU')
  assert.equal(cache.units.distance, 'km')
  assert.equal(cache.units.oneWayDownLegLightTime, 'minutes')
  assert.equal(cache.units.oneWayLightTime, 'seconds')
  assert.equal(cache.units.distanceConversionKmPerAu, 149597870.700)
  assert.equal(cache.units.lightTimeConversionSecondsPerMinute, 60)
  assert.ok(Number.isFinite(Date.parse(cache.retrievedAt)))
})

test('selected launch dates match Horizons records and convert without substituted values', () => {
  assert.equal(cache.observations.length, 30)

  for (const [date, expected] of Object.entries(expectedObservations)) {
    const observation = cache.observations.find((item) => item.date === date)
    assert.ok(observation, `missing Horizons observation for ${date}`)
    assert.equal(observation.rangeAu, expected.rangeAu)
    assert.equal(observation.oneWayDownLegLightTimeMinutes, expected.lightTimeMinutes)
    assert.equal(observation.distanceKm, observation.rangeAu * 149597870.700)
    assert.equal(observation.oneWayLightTimeSeconds, observation.oneWayDownLegLightTimeMinutes * 60)
    assert.ok(observation.distanceKm >= 300_000 && observation.distanceKm <= 450_000)
    assert.ok(observation.oneWayLightTimeSeconds > 0)
  }
})
