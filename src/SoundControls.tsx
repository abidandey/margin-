import { isAudioSupported, playSound, setAudioSettings, useAudioSettings } from './missionAudio'

/** Sound on/off and volume. The setting is shared by every screen. */
export function SoundControls({ compact = false }: { compact?: boolean }) {
  const { muted, volume } = useAudioSettings()
  const supported = isAudioSupported()

  return (
    <div className={`mission-audio-controls${compact ? ' is-compact' : ''}`} role="group" aria-label="Sound settings">
      <button
        type="button"
        className="sound-toggle"
        aria-pressed={!muted}
        disabled={!supported}
        onClick={() => {
          setAudioSettings({ muted: !muted })
          // Confirms the change audibly when switching sound on.
          if (muted) playSound('confirm')
        }}
      >
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>
      {!compact && (
        <label>
          VOLUME
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Sound volume"
            disabled={!supported}
            onChange={(event) => setAudioSettings({ volume: Number(event.currentTarget.value) })}
            onPointerUp={() => playSound('selection')}
          />
        </label>
      )}
    </div>
  )
}
