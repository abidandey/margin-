/*
 * Real orbit figures for a circular lunar orbit, computed from NASA lunar constants.
 *
 * Source: NASA NSSDCA Moon Fact Sheet (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html)
 *   GM = 0.00490 x 10^6 km^3/s^2, volumetric mean radius = 1737.4 km.
 *
 * These are reference values shown beside the game. The mission simulation itself uses compressed,
 * illustrative timings so a mission fits in 75 seconds.
 */
export const MOON_FACT_SHEET_URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html'
/** Lunar gravitational parameter, km^3/s^2, as published (three significant figures). */
export const MOON_GM_KM3_S2 = 0.0049e6
/** Lunar volumetric mean radius, km. */
export const MOON_RADIUS_KM = 1737.4
/** Altitude of the reference orbit, km: a low polar mapping orbit like the Lunar Reconnaissance Orbiter's. */
export const REFERENCE_ALTITUDE_KM = 50

/** Circular orbit speed, km/s: v = sqrt(GM / r). */
export function circularSpeedKmS(altitudeKm: number) {
  return Math.sqrt(MOON_GM_KM3_S2 / (MOON_RADIUS_KM + altitudeKm))
}

/** Orbital period, minutes: T = 2*pi*sqrt(r^3 / GM) (Kepler's third law). */
export function orbitalPeriodMinutes(altitudeKm: number) {
  const radiusKm = MOON_RADIUS_KM + altitudeKm
  return (2 * Math.PI * Math.sqrt(radiusKm ** 3 / MOON_GM_KM3_S2)) / 60
}

/**
 * Longest eclipse per orbit, minutes. With the Sun in the orbit plane and a cylindrical shadow,
 * the shadowed share of a circular orbit is asin(R / r) / pi.
 */
export function maxEclipseMinutes(altitudeKm: number) {
  const radiusKm = MOON_RADIUS_KM + altitudeKm
  return (Math.asin(MOON_RADIUS_KM / radiusKm) / Math.PI) * orbitalPeriodMinutes(altitudeKm)
}

export function referenceOrbit(altitudeKm = REFERENCE_ALTITUDE_KM) {
  const periodMinutes = orbitalPeriodMinutes(altitudeKm)
  const eclipseMinutes = maxEclipseMinutes(altitudeKm)
  return {
    altitudeKm,
    speedKmS: circularSpeedKmS(altitudeKm),
    periodMinutes,
    orbitsPerDay: (24 * 60) / periodMinutes,
    maxEclipseMinutes: eclipseMinutes,
    maxEclipseShare: eclipseMinutes / periodMinutes,
  }
}
