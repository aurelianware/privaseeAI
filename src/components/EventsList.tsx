import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Eye, Play, Image, X, ChevronDown, ChevronUp, Shield, Radio, Download } from 'lucide-react';

interface SecurityEvent {
  id: string;
  type: 'detection' | 'anomaly' | 'alert' | 'motion' | 'manual';
  message: string;
  timestamp: Date;
  objects?: any[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detections?: any[];
  confidence?: number;
  imageBlob?: Blob;
  videoBlob?: Blob;
  metadata?: {
    deviceId: string;
    location?: string;
    cameraId: string;
    duration?: number;
  };
}

interface EventsListProps {
  events: SecurityEvent[];
  subscriptionTier?: string;  // 'FREE' | 'PRO' | 'ENTERPRISE'
  idToken?: string;
}

// Sentinel brand colour tokens
const S = {
  black:     '#000000',
  obsidian:  '#0a0a0a',
  surface:   '#0f0f0f',
  cyan:      '#00ffff',
  green:     '#00ff88',
  red:       '#ff0055',
  orange:    '#ffaa00',
  gray:      '#b0b0b0',
  grayDim:   '#808080',
  border:    'rgba(0, 255, 255, 0.18)',
  borderHov: 'rgba(0, 255, 255, 0.45)',
};

const severityMeta: Record<string, { color: string; glow: string; label: string }> = {
  critical: { color: S.red,    glow: 'rgba(255,0,85,0.35)',    label: 'CRITICAL' },
  high:     { color: S.orange, glow: 'rgba(255,170,0,0.35)',   label: 'HIGH'     },
  medium:   { color: S.cyan,   glow: 'rgba(0,255,255,0.25)',   label: 'MEDIUM'   },
  low:      { color: S.green,  glow: 'rgba(0,255,136,0.25)',   label: 'LOW'      },
};

const EventsList: React.FC<EventsListProps> = ({ events, subscriptionTier, idToken }) => {
  const [selectedMedia, setSelectedMedia] = useState<{
    type: 'image' | 'video';
    url: string;
    mimeType: string;
    eventId: string;
  } | null>(null);
  const [expandedEvents, setExpandedEvents]   = useState<Set<string>>(new Set());
  const [mediaError,     setMediaError]        = useState<string | null>(null);
  const [now,            setNow]               = useState(() => Date.now());
  const [exporting,      setExporting]         = useState(false);

  const handleExport = async (format: 'csv' | 'jsonl') => {
    if (subscriptionTier !== 'ENTERPRISE' || !idToken) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/events/export?format=${format}&limit=5000`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const disp = res.headers.get('Content-Disposition') ?? '';
      const match = disp.match(/filename="([^"]+)"/);
      a.href     = url;
      a.download = match?.[1] ?? `privaseeai-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // Live "time ago" ticker
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const timeAgo = (ts: Date) => {
    const sec = Math.floor((now - new Date(ts).getTime()) / 1000);
    if (sec < 60)  return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handleMediaView = (blob: Blob | undefined, type: 'image' | 'video', eventId: string) => {
    if (!blob) return;
    try {
      // Preserve the original MIME type when known, fall back to sensible defaults
      const origType = blob.type;
      let mimeType: string;
      if (type === 'image') {
        mimeType = origType && origType.startsWith('image/') ? origType : 'image/jpeg';
      } else {
        mimeType = origType && origType.startsWith('video/') ? origType : 'video/webm';
      }
      const finalBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
      const url = URL.createObjectURL(finalBlob);
      setMediaError(null);
      setSelectedMedia({ url, type, mimeType, eventId });
    } catch (err) {
      console.error('Media URL creation failed:', err);
      setMediaError(String(err));
    }
  };

  const closeMediaView = () => {
    if (selectedMedia) URL.revokeObjectURL(selectedMedia.url);
    setSelectedMedia(null);
    setMediaError(null);
  };

  const toggleExpansion = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ─── Empty state ─────────────────────────────────────────────────────────── */
  if (events.length === 0) {
    return (
      <div style={{
        background: S.obsidian,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <Shield style={{ width: 48, height: 48, color: S.grayDim, margin: '0 auto 16px' }} />
        <p style={{ color: S.cyan, fontFamily: "'Segoe UI', sans-serif", fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>
          No Events Detected
        </p>
        <p style={{ color: S.grayDim, fontSize: 14, margin: 0 }}>
          Sentinel is watching. Events will appear here when detections occur.
        </p>
      </div>
    );
  }

  /* ─── Main list ───────────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio style={{ color: S.cyan, width: 20, height: 20 }} />
          <h2 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: S.cyan,
            textShadow: '0 0 16px rgba(0,255,255,0.6)',
            letterSpacing: '0.02em',
          }}>
            Security Events
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12,
            color: S.grayDim,
            background: S.obsidian,
            border: `1px solid ${S.border}`,
            borderRadius: 20,
            padding: '4px 12px',
          }}>
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>

          {/* Export button — ENTERPRISE only */}
          {subscriptionTier === 'ENTERPRISE' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['csv', 'jsonl'] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleExport(fmt)}
                  disabled={exporting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6, fontSize: 11,
                    background: `${S.cyan}18`,
                    border: `1px solid ${S.cyan}55`,
                    color: exporting ? S.grayDim : S.cyan,
                    cursor: exporting ? 'wait' : 'pointer',
                    fontWeight: 600, letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    transition: 'background 0.15s',
                  }}
                  title={`Export as ${fmt.toUpperCase()}`}
                >
                  <Download style={{ width: 11, height: 11 }} />
                  {exporting ? '…' : fmt}
                </button>
              ))}
            </div>
          ) : (
            <span
              title="ENTERPRISE plan required for audit log export"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: S.grayDim,
                cursor: 'default', userSelect: 'none',
              }}
            >
              <Download style={{ width: 11, height: 11 }} />
              Export
            </span>
          )}
        </div>
      </div>

      {/* Event cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((event) => {
          const meta       = severityMeta[event.severity] ?? severityMeta.low;
          const isExpanded = expandedEvents.has(event.id);
          const hasMedia   = !!(event.imageBlob || event.videoBlob);

          return (
            <div
              key={event.id}
              style={{
                background: S.obsidian,
                border: `1px solid ${S.border}`,
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: 10,
                padding: '14px 16px',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = S.borderHov;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${meta.glow}`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = S.border;
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              {/* Row 1 – icon, message, badge, controls */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Severity dot */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: `${meta.color}22`,
                  border: `1px solid ${meta.color}66`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 10px ${meta.glow}`,
                }}>
                  {event.type === 'detection' || event.type === 'motion'
                    ? <Eye style={{ width: 16, height: 16, color: meta.color }} />
                    : <AlertTriangle style={{ width: 16, height: 16, color: meta.color }} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#ffffff', lineHeight: 1.4 }}>
                      {event.message}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {/* Severity badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: meta.color,
                        background: `${meta.color}18`,
                        border: `1px solid ${meta.color}55`,
                        borderRadius: 4,
                        padding: '2px 7px',
                        letterSpacing: '0.06em',
                      }}>
                        {meta.label}
                      </span>
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpansion(event.id)}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: S.grayDim, padding: 4,
                          borderRadius: 4,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = S.cyan)}
                        onMouseLeave={e => (e.currentTarget.style.color = S.grayDim)}
                      >
                        {isExpanded
                          ? <ChevronUp  style={{ width: 16, height: 16 }} />
                          : <ChevronDown style={{ width: 16, height: 16 }} />}
                      </button>
                    </div>
                  </div>

                  {/* Timestamp + objects pill row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: S.grayDim, fontSize: 12 }}>
                      <Clock style={{ width: 11, height: 11 }} />
                      <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span style={{ color: '#555' }}>·</span>
                      <span style={{ color: '#555' }}>{timeAgo(event.timestamp)}</span>
                    </div>
                    {event.objects && event.objects.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {event.objects.map((obj, i) => (
                          <span key={i} style={{
                            fontSize: 11, background: `${S.cyan}14`,
                            border: `1px solid ${S.cyan}33`,
                            color: S.cyan, borderRadius: 4, padding: '1px 6px',
                          }}>
                            {obj.class}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Media buttons — always visible when blobs exist */}
                  {hasMedia && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {event.imageBlob && (
                        <button
                          onClick={() => handleMediaView(event.imageBlob, 'image', event.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 12px', borderRadius: 6, fontSize: 12,
                            background: `${S.cyan}18`,
                            border: `1px solid ${S.cyan}55`,
                            color: S.cyan,
                            cursor: 'pointer',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = `${S.cyan}30`;
                            (e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px rgba(0,255,255,0.3)`;
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = `${S.cyan}18`;
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                          }}
                        >
                          <Image style={{ width: 13, height: 13 }} />
                          View Image
                        </button>
                      )}
                      {event.videoBlob && (
                        <button
                          onClick={() => handleMediaView(event.videoBlob, 'video', event.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 12px', borderRadius: 6, fontSize: 12,
                            background: `${S.green}18`,
                            border: `1px solid ${S.green}55`,
                            color: S.green,
                            cursor: 'pointer',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = `${S.green}30`;
                            (e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px rgba(0,255,136,0.3)`;
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = `${S.green}18`;
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                          }}
                        >
                          <Play style={{ width: 13, height: 13 }} />
                          Play Video
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${S.border}`,
                    }}>
                      {/* Detection breakdown */}
                      {event.detections && event.detections.length > 0 && (
                        <div style={{
                          background: S.surface,
                          border: `1px solid ${S.border}`,
                          borderRadius: 8,
                          padding: '10px 14px',
                          marginBottom: 10,
                        }}>
                          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: S.cyan, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Detected Objects &nbsp;({event.detections.length})
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {event.detections.map((d, i) => {
                              const pct   = Math.round((d.score ?? d.confidence ?? 0) * 100);
                              const name  = (d.className ?? d.class ?? 'Unknown') as string;
                              const isPerson  = name.toLowerCase() === 'person';
                              const isVehicle = ['car','truck','motorcycle','bicycle','bus'].includes(name.toLowerCase());
                              const accentColor = isPerson ? S.red : isVehicle ? S.orange : S.green;
                              return (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  fontSize: 12, borderLeft: `2px solid ${accentColor}`, paddingLeft: 8,
                                }}>
                                  <span style={{ fontWeight: 700, color: accentColor, textTransform: 'uppercase' }}>
                                    {name}
                                  </span>
                                  <span style={{
                                    color: pct >= 80 ? S.green : pct >= 60 ? S.orange : S.grayDim,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>
                                    {pct}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      {event.metadata && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: S.grayDim, flexWrap: 'wrap' }}>
                          <span><span style={{ color: '#555' }}>Camera:</span> {event.metadata.cameraId}</span>
                          {event.metadata.duration && <span><span style={{ color: '#555' }}>Duration:</span> {event.metadata.duration}s</span>}
                          {event.metadata.deviceId  && <span><span style={{ color: '#555' }}>Device:</span> {event.metadata.deviceId}</span>}
                        </div>
                      )}

                      {/* No media indicator */}
                      {!hasMedia && (
                        <p style={{ fontSize: 12, color: '#444', margin: '8px 0 0' }}>
                          No media captured for this event.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Media Modal ─────────────────────────────────────────────────────── */}
      {selectedMedia && (
        <div
          onClick={closeMediaView}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: S.obsidian,
              border: `1px solid ${selectedMedia.type === 'video' ? S.green : S.cyan}55`,
              borderRadius: 12,
              overflow: 'hidden',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: selectedMedia.type === 'video'
                ? '0 0 40px rgba(0,255,136,0.2)'
                : '0 0 40px rgba(0,255,255,0.2)',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: `1px solid ${S.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedMedia.type === 'video'
                  ? <Play  style={{ width: 16, height: 16, color: S.green }} />
                  : <Image style={{ width: 16, height: 16, color: S.cyan  }} />}
                <span style={{ fontWeight: 700, fontSize: 15, color: selectedMedia.type === 'video' ? S.green : S.cyan }}>
                  {selectedMedia.type === 'video' ? 'Event Recording' : 'Event Capture'}
                </span>
                <span style={{ fontSize: 11, color: '#444', marginLeft: 4 }}>{selectedMedia.mimeType}</span>
              </div>
              <button
                type="button"
                aria-label="Close media view"
                onClick={closeMediaView}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: S.grayDim, padding: 4, borderRadius: 4,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={e => (e.currentTarget.style.color = S.grayDim)}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Media content */}
            <div style={{ padding: 16, overflowY: 'auto' }}>
              {mediaError && (
                <div style={{
                  background: `${S.red}18`, border: `1px solid ${S.red}55`,
                  color: S.red, borderRadius: 8, padding: '10px 14px', fontSize: 13,
                  marginBottom: 12,
                }}>
                  ⚠ Failed to load media: {mediaError}
                </div>
              )}
              {selectedMedia.type === 'video' ? (
                <video
                  key={selectedMedia.url}
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  muted
                  playsInline
                  style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block' }}
                  onError={e => {
                    const v = e.currentTarget as HTMLVideoElement;
                    console.error('Video error:', v.error);
                    setMediaError(`Video error code ${v.error?.code}: ${v.error?.message}`);
                  }}
                />
              ) : (
                <img
                  src={selectedMedia.url}
                  alt="Event capture"
                  style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', objectFit: 'contain' }}
                  onError={() => setMediaError('Image failed to decode. The capture data may be incomplete.')}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsList;