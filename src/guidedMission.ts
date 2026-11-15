import type { MissionDebrief } from './missionSimulation'

export function getRetryFocus(debrief: MissionDebrief): { category: 'instrument' | 'power' | 'battery' | 'propulsion' | 'communications'; title: string; text: string } {
  const eclipse = debrief.eventResults.find(event => event.type === 'eclipse')
  const category = !debrief.telemetry.orbitAchieved ? 'propulsion'
    : eclipse && eclipse.healthDelta < 0 ? debrief.design.batteryName ? 'power' : 'battery'
    : debrief.telemetry.dataCollectedPoints > 0 && debrief.telemetry.dataReturnedPoints / debrief.telemetry.dataCollectedPoints < 0.6 ? 'communications' : 'instrument'
  const takeaway = getReviewTakeaway(debrief)
  return { category, title: 'Your next experiment', text: `${takeaway.cause} ${takeaway.recommendation}` }
}

export function compareMissionRuns(before: MissionDebrief, after: MissionDebrief) {
  const rank = { Failure: 0, 'Partial Success': 1, Success: 2 }
  const changes = [rank[after.result] - rank[before.result], after.telemetry.health - before.telemetry.health,
    after.telemetry.scienceProgress - before.telemetry.scienceProgress, after.telemetry.dataReturnedPoints - before.telemetry.dataReturnedPoints]
  const up = changes.some(value => value > 0)
  const down = changes.some(value => value < 0)
  return up && down ? 'Mixed results' : up ? 'Improved' : down ? 'Worse' : 'Unchanged'
}

export function getReviewTakeaway(debrief: MissionDebrief) {
  const insertion = debrief.eventResults.find(event => event.type === 'insertion')
  const eclipse = debrief.eventResults.find(event => event.type === 'eclipse')
  const communications = debrief.eventResults.find(event => event.type === 'communications')
  if (!debrief.telemetry.orbitAchieved && insertion) return {
    cause: `Your engine reserve and burn choice left ${Math.round(insertion.deltaVShortfallMps)} m/s missing, preventing lunar orbit.`,
    recommendation: 'Choose the higher-reserve bipropellant engine; check the mass and budget limits.',
  }
  if (eclipse && eclipse.healthDelta < 0) return {
    cause: `Generation, battery discharge and your eclipse response left ${Math.round(eclipse.eclipsePowerFlow?.shortfallW ?? 0)} W unmet in shadow.`,
    recommendation: debrief.design.batteryName ? eclipse.choiceId !== 'hibernate' ? 'Keep this design and try hibernating the instruments during eclipse.' : 'Compare steady eclipse generation; check the power and budget limits before retrying.' : 'Add the high-density battery, then check its discharge limit against eclipse demand.',
  }
  if (communications && debrief.telemetry.dataCollectedPoints > debrief.telemetry.dataReturnedPoints && !debrief.objectives.bonus[1].complete) return {
    cause: `Your selected link and response returned ${Math.round(debrief.telemetry.dataReturnedPoints)} of ${Math.round(debrief.telemetry.dataCollectedPoints)} collected points.`,
    recommendation: communications.choiceId !== 'buffer' ? 'Keep the hardware and try “Store & forward” at the Earth-link interruption.' : 'Compare a communications link with a higher buffer return fraction.',
  }
  return {
    cause: debrief.objectives.primary.complete ? 'Your payload and observation response collected enough complementary evidence to meet the primary goal.' : 'Your payload, available power and observation response did not meet the primary evidence threshold.',
    recommendation: debrief.objectives.primary.complete ? 'Keep your payload and try mapping the crater rim to explore the terrain tradeoff.' : 'Pair a hydrogen instrument with a thermal instrument and choose “Investigate ice clues”.',
  }
}
