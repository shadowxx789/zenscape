import { useEffect, useState } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import type { ProbeStats } from '../audio/AudioDiagnostics'
import type { RecentEvent } from '../audio/AudioEngine'

export function DiagnosticsPanel() {
  const [expanded, setExpanded] = useState(false)
  const [stats, setStats] = useState<Record<string, ProbeStats>>({})
  const [events, setEvents] = useState<RecentEvent[]>([])
  const [ambientMuted, setAmbientMuted] = useState(() => audioEngine.ambientMuted)
  const [eventsSolo, setEventsSolo] = useState(() => audioEngine.eventsSolo)
  const [currentTime, setCurrentTime] = useState(() => performance.now())

  useEffect(() => {
    if (!expanded) return

    const updateStats = () => {
      if (audioEngine.diagnostics) {
        setStats(audioEngine.diagnostics.getAllStats())
      }
    }

    const updateEvents = () => {
      setEvents(audioEngine.getRecentEvents())
      setAmbientMuted(audioEngine.ambientMuted)
      setEventsSolo(audioEngine.eventsSolo)
      setCurrentTime(performance.now())
    }

    // Run initial updates
    updateStats()
    updateEvents()

    const statsInterval = setInterval(updateStats, 100)
    const eventsInterval = setInterval(updateEvents, 500)

    return () => {
      clearInterval(statsInterval)
      clearInterval(eventsInterval)
    }
  }, [expanded])

  // Only render during development
  if (!import.meta.env.DEV) {
    return null
  }

  const handleTriggerEvent = (type: 'temple_bell' | 'guqin_harmonic') => {
    audioEngine.triggerEvent(type)
    setEvents(audioEngine.getRecentEvents())
    setCurrentTime(performance.now())
  }

  const handleToggleMuteAmbient = () => {
    const nextMuted = !audioEngine.ambientMuted
    audioEngine.muteAmbient(nextMuted)
    setAmbientMuted(nextMuted)
  }

  const handleToggleSoloEvents = () => {
    const nextSolo = !audioEngine.eventsSolo
    audioEngine.soloEvents(nextSolo)
    setEventsSolo(nextSolo)
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: 'rgba(34, 34, 34, 0.9)',
          border: '1px solid #444',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '18px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
        title="Open Diagnostics"
        type="button"
      >
        🎚
      </button>
    )
  }

  const renderProgressBar = (rms: number) => {
    const minDb = -60
    const maxDb = 0
    const percentage = rms === -Infinity ? 0 : Math.max(0, Math.min(100, ((rms - minDb) / (maxDb - minDb)) * 100))

    let barColor = '#6b7280' // gray
    if (rms > -6) {
      barColor = '#ef4444' // red
    } else if (rms > -18) {
      barColor = '#22c55e' // green
    } else if (rms > -40) {
      barColor = '#eab308' // yellow
    }

    return (
      <div
        style={{
          width: '80px',
          height: '8px',
          backgroundColor: '#333',
          borderRadius: '4px',
          overflow: 'hidden',
          display: 'inline-block',
          marginLeft: '8px',
          verticalAlign: 'middle',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: barColor,
            transition: 'width 0.1s ease',
          }}
        />
      </div>
    )
  }

  const formatDb = (val: number) => {
    if (val === -Infinity) return '-inf '
    return `${val.toFixed(1)}`
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        width: '340px',
        maxHeight: '480px',
        backgroundColor: 'rgba(10, 10, 10, 0.95)',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '16px',
        color: '#fff',
        fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: '11px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Title Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #222',
          paddingBottom: '8px',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#10b981' }}>
          Audio Diagnostics
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px 8px',
          }}
          type="button"
        >
          ×
        </button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {!audioEngine.diagnostics ? (
          <div style={{ color: '#ef4444', textAlign: 'center', padding: '10px 0' }}>
            Audio engine not initialized
          </div>
        ) : (
          <>
            {/* Probe Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.keys(stats).map((name) => {
                const s = stats[name] || { rms: -Infinity, peak: -Infinity }
                const rmsStr = formatDb(s.rms).padStart(5, ' ')
                const peakStr = formatDb(s.peak).padStart(5, ' ')
                return (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'pre',
                    }}
                  >
                    <span style={{ width: '70px', color: '#93c5fd', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {name}
                    </span>
                    <span>
                      rms:{rmsStr}dB peak:{peakStr}dB
                    </span>
                    {renderProgressBar(s.rms)}
                  </div>
                )
              })}
            </div>

            {/* Dev Controls */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                borderTop: '1px solid #222',
                borderBottom: '1px solid #222',
                padding: '10px 0',
              }}
            >
              <button
                onClick={() => handleTriggerEvent('temple_bell')}
                style={{
                  flex: '1 1 45%',
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '6px',
                  cursor: 'pointer',
                }}
                type="button"
              >
                Trigger Bell
              </button>
              <button
                onClick={() => handleTriggerEvent('guqin_harmonic')}
                style={{
                  flex: '1 1 45%',
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '6px',
                  cursor: 'pointer',
                }}
                type="button"
              >
                Trigger Guqin
              </button>
              <button
                onClick={handleToggleMuteAmbient}
                style={{
                  flex: '1 1 45%',
                  backgroundColor: ambientMuted ? '#b91c1c' : '#1f2937',
                  border: `1px solid ${ambientMuted ? '#f87171' : '#374151'}`,
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '6px',
                  cursor: 'pointer',
                }}
                type="button"
              >
                {ambientMuted ? 'Unmute Ambient' : 'Mute Ambient'}
              </button>
              <button
                onClick={handleToggleSoloEvents}
                style={{
                  flex: '1 1 45%',
                  backgroundColor: eventsSolo ? '#047857' : '#1f2937',
                  border: `1px solid ${eventsSolo ? '#34d399' : '#374151'}`,
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '6px',
                  cursor: 'pointer',
                }}
                type="button"
              >
                {eventsSolo ? 'Unsolo Events' : 'Solo Events'}
              </button>
            </div>

            {/* Recent Events List */}
            <div>
              <div style={{ fontWeight: 'bold', color: '#f59e0b', marginBottom: '6px' }}>
                Recent events:
              </div>
              {events.length === 0 ? (
                <div style={{ color: '#666', fontStyle: 'italic' }}>No events triggered yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                  {events.slice(0, 10).map((ev, idx) => {
                    const elapsedSec = (currentTime - ev.time) / 1000
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#ccc',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <span style={{ color: '#999' }}>-{elapsedSec.toFixed(1)}s</span>
                        <span style={{ color: ev.type === 'temple_bell' ? '#fbbf24' : '#67e8f9' }}>
                          {ev.type}
                        </span>
                        <span style={{ color: '#888' }}>vol={ev.volume.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
