export type MissionSound = 'selection' | 'telemetry' | 'alert' | 'outcome'

const soundProfiles: Record<MissionSound, { frequency: number; endFrequency: number; duration: number; wave: OscillatorType }> = {
  selection: { frequency: 660, endFrequency: 840, duration: 0.075, wave: 'sine' },
  telemetry: { frequency: 420, endFrequency: 470, duration: 0.11, wave: 'sine' },
  alert: { frequency: 360, endFrequency: 520, duration: 0.19, wave: 'triangle' },
  outcome: { frequency: 510, endFrequency: 760, duration: 0.24, wave: 'sine' },
}

let audioContext: AudioContext | null = null

export function playMissionSound(sound: MissionSound, volume: number) {
  if (typeof window === 'undefined' || !window.AudioContext) return
  audioContext ??= new window.AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()

  const profile = soundProfiles[sound]
  const oscillator = audioContext.createOscillator()
  const envelope = audioContext.createGain()
  const start = audioContext.currentTime
  const peak = Math.min(0.045, Math.max(0.0001, volume * 0.12))

  oscillator.type = profile.wave
  oscillator.frequency.setValueAtTime(profile.frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, start + profile.duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration)
  oscillator.connect(envelope)
  envelope.connect(audioContext.destination)
  oscillator.start(start)
  oscillator.stop(start + profile.duration)
}
