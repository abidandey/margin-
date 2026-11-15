import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const DISTANCE_KM_PER_AU = 149597870.700
const SECONDS_PER_MINUTE = 60
const REQUIRED_DATES = ['2027-01-08', '2027-01-22', '2027-02-05']
const MONTHS = new Map([
  ['Jan', '01'],
  ['Feb', '02'],
  ['Mar', '03'],
  ['Apr', '04'],
  ['May', '05'],
  ['Jun', '06'],
  ['Jul', '07'],
  ['Aug', '08'],
  ['Sep', '09'],
  ['Oct', '10'],
  ['Nov', '11'],
  ['Dec', '12'],
])

const query = {
  format: 'json',
  COMMAND: "'301'",
  CENTER: "'500@399'",
  MAKE_EPHEM: "'YES'",
  EPHEM_TYPE: "'OBSERVER'",
  START_TIME: "'2027-01-08'",
  STOP_TIME: "'2027-02-06'",
  STEP_SIZE: "'1 d'",
  QUANTITIES: "'20,21'",
  CSV_FORMAT: "'YES'",
  OBJ_DATA: "'NO'",
  TIME_TYPE: "'UT'",
}

function parseCsvLine(line) {
  const fields = []
  let field = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && insideQuotes) {
      field += '"'
      index += 1
    } else if (character === '"') {
      insideQuotes = !insideQuotes
    } else if (character === ',' && !insideQuotes) {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }

  if (insideQuotes) throw new Error('Malformed CSV: unterminated quoted field')
  fields.push(field)
  return fields
}

function parseDate(value) {
  const match = value.trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2})\s+\d{2}:\d{2}$/)
  if (!match) throw new Error(`Unrecognized Horizons date: ${value}`)
  const month = MONTHS.get(match[2])
  if (!month) throw new Error(`Unrecognized Horizons month: ${match[2]}`)
  return `${match[1]}-${month}-${match[3]}`
}

function findColumnIndex(header, predicate, name) {
  const index = header.findIndex((column) => predicate(column.trim().toLowerCase().replace(/[^a-z0-9]/g, '')))
  if (index < 0) throw new Error(`Horizons CSV is missing the ${name} column`)
  return index
}

function parseObservations(result) {
  const startMarker = result.indexOf('$$SOE')
  const endMarker = result.indexOf('$$EOE')
  if (startMarker < 0 || endMarker < startMarker) {
    throw new Error('Horizons response is missing a valid $$SOE/$$EOE data block')
  }

  const headerLines = result.slice(0, startMarker).trimEnd().split(/\r?\n/)
  const headerLine = [...headerLines].reverse().find((line) => (
    line.toLowerCase().includes('delta') && line.toLowerCase().includes('1-way_down_lt')
  ))
  if (!headerLine) throw new Error('Horizons response is missing the observer CSV header')

  const header = parseCsvLine(headerLine)
  const dateIndex = findColumnIndex(header, (column) => column.startsWith('date'), 'date')
  const rangeIndex = findColumnIndex(header, (column) => column === 'delta', 'delta range')
  const lightTimeIndex = findColumnIndex(header, (column) => column.includes('1waydownlt'), 'one-way down-leg light-time')
  const rows = result.slice(startMarker + '$$SOE'.length, endMarker)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const observations = rows.map((line) => {
    const fields = parseCsvLine(line)
    const date = parseDate(fields[dateIndex] ?? '')
    const rangeAu = Number(fields[rangeIndex])
    const oneWayDownLegLightTimeMinutes = Number(fields[lightTimeIndex])
    if (!Number.isFinite(rangeAu) || !Number.isFinite(oneWayDownLegLightTimeMinutes)) {
      throw new Error(`Horizons returned invalid measurements for ${date}`)
    }

    return {
      date,
      rangeAu,
      oneWayDownLegLightTimeMinutes,
      distanceKm: rangeAu * DISTANCE_KM_PER_AU,
      oneWayLightTimeSeconds: oneWayDownLegLightTimeMinutes * SECONDS_PER_MINUTE,
    }
  })

  if (observations.length !== 30) {
    throw new Error(`Expected 30 daily Horizons observations, received ${observations.length}`)
  }

  const dates = new Set(observations.map((observation) => observation.date))
  for (const date of REQUIRED_DATES) {
    if (!dates.has(date)) throw new Error(`Horizons response is missing required date ${date}`)
  }

  for (const observation of observations) {
    if (observation.distanceKm < 300_000 || observation.distanceKm > 450_000) {
      throw new Error(`Implausible Earth-Moon distance for ${observation.date}: ${observation.distanceKm} km`)
    }
    if (observation.oneWayDownLegLightTimeMinutes <= 0) {
      throw new Error(`Invalid one-way light-time for ${observation.date}`)
    }
  }

  return observations
}

const params = new URLSearchParams(query)
const response = await fetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(60_000) })
if (!response.ok) throw new Error(`Horizons API returned HTTP ${response.status}`)

const payload = await response.json()
if (payload.error) throw new Error(`Horizons API error: ${payload.error}`)
if (typeof payload.result !== 'string') throw new Error('Horizons API response did not contain ephemeris text')

const observations = parseObservations(payload.result)
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/horizons2027.json')
const cache = {
  source: {
    name: 'NASA/JPL Horizons',
    apiUrl: API_URL,
    documentationUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    attribution: 'Orbital geometry: NASA/JPL Horizons — cached ephemeris data',
    geometry: 'Earth-center-to-Moon-center observer geometry; an approximation, not identical to spacecraft communication distance and delay.',
  },
  retrievedAt: new Date().toISOString(),
  query,
  units: {
    range: 'AU',
    distance: 'km',
    oneWayDownLegLightTime: 'minutes',
    oneWayLightTime: 'seconds',
    distanceConversionKmPerAu: DISTANCE_KM_PER_AU,
    lightTimeConversionSecondsPerMinute: SECONDS_PER_MINUTE,
  },
  observations,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
console.log(`Cached ${observations.length} NASA/JPL Horizons observations in ${outputPath}`)
for (const date of REQUIRED_DATES) {
  const observation = observations.find((item) => item.date === date)
  console.log(`${date}: ${observation.distanceKm.toFixed(3)} km; ${observation.oneWayLightTimeSeconds.toFixed(6)} s`)
}
