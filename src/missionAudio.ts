/*
 * Mission sound effects.
 *
 * Every sound is synthesized in the browser with the Web Audio API: there are no audio files and
 * no recorded or AI-generated audio. One shared setting (on/off and volume) applies to every screen
 * and is remembered between visits.
 */
import { useSyncExternalStore } from 'react'

export type MissionSound =
  | 'selection'
  | 'confirm'
  | 'telemetry'
  | 'alert'
  | 'alert-insertion'
  | 'alert-eclipse'
  | 'alert-communications'
  | 'alert-science'
  | 'outcome'
  | 'outcome-good'
  | 'outcome-bad'
  | 'mission-success'
  | 'mission-partial'
  | 'mission-failure'

export type AudioSettings = { muted: boolean; volume: number }

const STORAGE_KEY = 'margin.audio.v1'
const DEFAULT_SETTINGS: AudioSettings = { muted: false, volume: 0.5 }

function loadSettings(): AudioSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (stored && typeof stored.muted === 'boolean' && typeof stored.volume === 'number') {
      return { muted: stored.muted, volume: Math.min(1, Math.max(0, stored.volume)) }
    }
  } catch {
    // Storage can be blocked (private windows); the defaults still work.
  }
  return DEFAULT_SETTINGS
}

let settings: AudioSettings = typeof window === 'undefined' ? DEFAULT_SETTINGS : loadSettings()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getAudioSettings() {
  return settings
}

export function setAudioSettings(changes: Partial<AudioSettings>) {
  settings = { ...settings, ...changes }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Not saved; the setting still applies for this visit.
  }
  listeners.forEach((listener) => listener())
}

export function useAudioSettings() {
  return useSyncExternalStore(subscribe, getAudioSettings, () => DEFAULT_SETTINGS)
}

export function isAudioSupported() {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

let audioContext: AudioContext | null = null
let output: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

function getOutput() {
  if (!isAudioSupported()) return null
  if (!audioContext) {
    audioContext = new window.AudioContext()
    // A compressor keeps layered sounds from clipping.
    const compressor = audioContext.createDynamicsCompressor()
    output = audioContext.createGain()
    output.connect(compressor)
    compressor.connect(audioContext.destination)
  }
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext && output ? { context: audioContext, output } : null
}

type Tone = {
  at?: number
  frequency: number
  endFrequency?: number
  duration: number
  wave?: OscillatorType
  gain?: number
}

function tone(context: AudioContext, destination: AudioNode, { at = 0, frequency, endFrequency, duration, wave = 'sine', gain = 0.2 }: Tone) {
  const start = context.currentTime + at
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = wave
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

type Noise = {
  at?: number
  duration: number
  filter?: BiquadFilterType
  frequency: number
  endFrequency?: number
  gain?: number
}

function noise(context: AudioContext, destination: AudioNode, { at = 0, duration, filter = 'lowpass', frequency, endFrequency, gain = 0.2 }: Noise) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const samples = noiseBuffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
  }
  const start = context.currentTime + at
  const source = context.createBufferSource()
  const shape = context.createBiquadFilter()
  const envelope = context.createGain()
  source.buffer = noiseBuffer
  source.loop = true
  shape.type = filter
  shape.frequency.setValueAtTime(frequency, start)
  if (endFrequency) shape.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.08, duration / 3))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(shape)
  shape.connect(envelope)
  envelope.connect(destination)
  source.start(start)
  source.stop(start + duration + 0.02)
}

const NOTE = { C4: 261.63, Eb4: 311.13, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, Ab6: 1661.2, B6: 1975.5 }

const SOUNDS: Record<MissionSound, (context: AudioContext, destination: AudioNode) => void> = {
  // Interface
  selection: (c, d) => tone(c, d, { frequency: 660, endFrequency: 840, duration: 0.07, gain: 0.16 }),
  confirm: (c, d) => {
    tone(c, d, { frequency: NOTE.C5, duration: 0.1, gain: 0.18 })
    tone(c, d, { at: 0.09, frequency: NOTE.G5, duration: 0.16, gain: 0.18 })
  },
  telemetry: (c, d) => {
    tone(c, d, { frequency: 880, duration: 0.05, gain: 0.1 })
    tone(c, d, { at: 0.08, frequency: 1320, duration: 0.07, gain: 0.1 })
  },

  // Event alerts: each event type has its own character.
  alert: (c, d) => tone(c, d, { frequency: 360, endFrequency: 520, duration: 0.2, wave: 'triangle', gain: 0.2 }),
  // Engine burn: a rumble that builds.
  'alert-insertion': (c, d) => {
    tone(c, d, { frequency: 440, duration: 0.09, wave: 'triangle', gain: 0.18 })
    tone(c, d, { at: 0.13, frequency: 440, duration: 0.09, wave: 'triangle', gain: 0.18 })
    noise(c, d, { at: 0.28, duration: 1.1, frequency: 180, endFrequency: 1100, gain: 0.3 })
    tone(c, d, { at: 0.28, frequency: 55, endFrequency: 82, duration: 1.1, wave: 'sawtooth', gain: 0.12 })
  },
  // Entering shadow: power winding down.
  'alert-eclipse': (c, d) => {
    tone(c, d, { frequency: 520, endFrequency: 130, duration: 0.8, wave: 'triangle', gain: 0.22 })
    tone(c, d, { at: 0.1, frequency: 260, endFrequency: 65, duration: 0.9, gain: 0.14 })
  },
  // Lost link: bursts of static, then a carrier tone searching.
  'alert-communications': (c, d) => {
    noise(c, d, { duration: 0.09, filter: 'bandpass', frequency: 2400, gain: 0.22 })
    noise(c, d, { at: 0.14, duration: 0.14, filter: 'bandpass', frequency: 1800, gain: 0.22 })
    noise(c, d, { at: 0.34, duration: 0.07, filter: 'bandpass', frequency: 3000, gain: 0.2 })
    tone(c, d, { at: 0.5, frequency: 1000, duration: 0.08, gain: 0.14 })
    tone(c, d, { at: 0.66, frequency: 1000, duration: 0.08, gain: 0.14 })
  },
  // Science opportunity: a bright rising chime.
  'alert-science': (c, d) => {
    tone(c, d, { frequency: NOTE.E6, duration: 0.28, gain: 0.14 })
    tone(c, d, { at: 0.09, frequency: NOTE.Ab6, duration: 0.28, gain: 0.12 })
    tone(c, d, { at: 0.18, frequency: NOTE.B6, duration: 0.42, gain: 0.11 })
  },

  // Decision outcomes
  outcome: (c, d) => tone(c, d, { frequency: 510, endFrequency: 760, duration: 0.24, gain: 0.18 }),
  'outcome-good': (c, d) => {
    tone(c, d, { frequency: NOTE.C5, duration: 0.14, gain: 0.17 })
    tone(c, d, { at: 0.1, frequency: NOTE.E5, duration: 0.14, gain: 0.17 })
    tone(c, d, { at: 0.2, frequency: NOTE.G5, duration: 0.3, gain: 0.17 })
  },
  'outcome-bad': (c, d) => {
    tone(c, d, { frequency: 196, endFrequency: 98, duration: 0.45, wave: 'sawtooth', gain: 0.13 })
    tone(c, d, { frequency: 207, endFrequency: 104, duration: 0.45, wave: 'sawtooth', gain: 0.11 })
    noise(c, d, { duration: 0.2, frequency: 400, gain: 0.12 })
  },

  // End of mission
  'mission-success': (c, d) => {
    ;[NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency, index) => tone(c, d, { at: index * 0.13, frequency, duration: 0.16, wave: 'triangle', gain: 0.18 }))
    tone(c, d, { at: 0.39, frequency: NOTE.C6, duration: 0.7, wave: 'triangle', gain: 0.2 })
    tone(c, d, { at: 0.39, frequency: NOTE.G5, duration: 0.7, gain: 0.1 })
  },
  'mission-partial': (c, d) => {
    tone(c, d, { frequency: NOTE.C5, duration: 0.18, wave: 'triangle', gain: 0.17 })
    tone(c, d, { at: 0.16, frequency: NOTE.G4, duration: 0.5, wave: 'triangle', gain: 0.17 })
  },
  'mission-failure': (c, d) => {
    ;[NOTE.G4, NOTE.Eb4, NOTE.C4].forEach((frequency, index) => tone(c, d, { at: index * 0.26, frequency, duration: index === 2 ? 0.9 : 0.3, wave: 'triangle', gain: 0.19 }))
    tone(c, d, { at: 0.52, frequency: NOTE.C4 / 2, duration: 0.9, gain: 0.14 })
  },
}

/** Plays a sound at the shared volume, unless sound is switched off. */
export function playSound(sound: MissionSound) {
  if (settings.muted || settings.volume <= 0) return
  const audio = getOutput()
  if (!audio) return
  audio.output.gain.setValueAtTime(settings.volume, audio.context.currentTime)
  SOUNDS[sound](audio.context, audio.output)
}

let lastOnceKey: string | null = null

/** Plays a sound once for a given key, however many times the caller re-renders. */
export function playSoundOnce(key: string, sound: MissionSound) {
  if (lastOnceKey === key) return
  lastOnceKey = key
  playSound(sound)
}
