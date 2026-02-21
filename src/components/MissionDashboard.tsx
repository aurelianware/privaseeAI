import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Battery, Cpu, Gauge,
  MapPin, Navigation, PauseCircle, Radio, RefreshCw, RotateCcw,
  Thermometer, TriangleAlert, Zap,
} from 'lucide-react';
import HlsVideoPlayer from './HlsVideoPlayer';
import './MissionDashboard.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Telemetry {
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  battery: number;
  gpsFix: 'none' | '2d' | '3d';
  distanceFromHome: number;
}

export interface MissionProgress {
  missionName?: string;
  currentWaypoint: number;
  totalWaypoints: number;
  etaSeconds?: number;
  status: 'idle' | 'preflight' | 'planning' | 'launching' | 'flying' | 'returning' | 'landing' | 'complete' | 'error';
}

export interface ThreatAlert {
  id: string;
  label: string;
  confidence: number;
  timestamp: string;
}

export interface MissionEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface MissionDashboardProps {
  missionId: string;
  websocketUrl?: string;
  initialTelemetry?: Telemetry;
  initialProgress?: MissionProgress;
  initialAlerts?: ThreatAlert[];
  initialEvents?: MissionEvent[];
  visualStreamUrl?: string | null;
  thermalStreamUrl?: string | null;
  onPause?: () => void;
  onReturnHome?: () => void;
  onEmergencyLand?: () => void;
  onMissionEnd?: () => void;
}

interface WsPayload {
  type: 'telemetry' | 'progress' | 'alert' | 'event' | 'position';
  data: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = {
  m: (v: number) => `${v.toFixed(0)} m`,
  speed: (v: number) => `${v.toFixed(1)} m/s`,
  pct: (v: number) => `${v.toFixed(0)}%`,
  time: (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
};

type StatusVariant = 'idle' | 'warning' | 'active' | 'complete' | 'error';

function statusVariant(status?: MissionProgress['status']): { variant: StatusVariant; pulse: boolean } {
  if (!status || status === 'idle') return { variant: 'idle', pulse: false };
  if (status === 'preflight' || status === 'planning') return { variant: 'warning', pulse: true };
  if (status === 'complete') return { variant: 'complete', pulse: false };
  if (status === 'error') return { variant: 'error', pulse: true };
  return { variant: 'active', pulse: true };
}

type BatteryVariant = 'green' | 'yellow' | 'red';

function batteryVariant(pct: number): BatteryVariant {
  if (pct < 20) return 'red';
  if (pct < 40) return 'yellow';
  return 'green';
}

// ─── MissionDashboard ─────────────────────────────────────────────────────────

const MissionDashboard: React.FC<MissionDashboardProps> = ({
  missionId: _missionId,
  websocketUrl,
  initialTelemetry,
  initialProgress,
  initialAlerts,
  initialEvents,
  visualStreamUrl,
  thermalStreamUrl,
  onPause,
  onReturnHome,
  onEmergencyLand,
  onMissionEnd,
}) => {
  const [telemetry, setTelemetry] = useState<Telemetry | undefined>(initialTelemetry);
  const [progress, setProgress] = useState<MissionProgress | undefined>(initialProgress);
  const [alerts, setAlerts] = useState<ThreatAlert[]>(initialAlerts ?? []);
  const [events, setEvents] = useState<MissionEvent[]>(initialEvents ?? []);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    initialTelemetry ? { lat: initialTelemetry.lat, lng: initialTelemetry.lng } : null,
  );
  const [path, setPath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [showVisual, setShowVisual] = useState(true);
  const [showThermal, setShowThermal] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!websocketUrl) return;
    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data) as WsPayload;
        switch (payload.type) {
          case 'telemetry':
            setTelemetry(payload.data);
            setPosition({ lat: payload.data.lat, lng: payload.data.lng });
            setPath(prev => [...prev.slice(-199), { lat: payload.data.lat, lng: payload.data.lng }]);
            break;
          case 'progress':
            setProgress(payload.data);
            break;
          case 'alert':
            setAlerts(prev => [{ ...payload.data, id: payload.data.id || crypto.randomUUID() }, ...prev].slice(0, 20));
            break;
          case 'event':
            setEvents(prev => [{ ...payload.data, id: payload.data.id || crypto.randomUUID() }, ...prev].slice(0, 50));
            break;
          case 'position':
            setPosition(payload.data);
            setPath(prev => [...prev.slice(-199), payload.data]);
            break;
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    ws.onerror = (e) => console.error('[mission ws] error', e);
    return () => { ws.close(); wsRef.current = null; };
  }, [websocketUrl]);

  const eta = useMemo(() => {
    if (!progress?.etaSeconds) return '—';
    const mins = Math.floor(progress.etaSeconds / 60);
    const secs = progress.etaSeconds % 60;
    return `${mins}m ${secs}s`;
  }, [progress]);

  const { variant: sVariant, pulse: sPulse } = statusVariant(progress?.status);
  const progressPct = progress
    ? (progress.currentWaypoint / Math.max(progress.totalWaypoints, 1)) * 100
    : 0;
  const missionDone = progress?.status === 'complete' || progress?.status === 'error';

  return (
    <div>
      {/* ── Top bar ── */}
      <div className="md-topbar">
        <div className="md-topbar-title">
          <Radio className="h-4 w-4" />
          LIVE MISSION — {(progress?.missionName ?? 'EVO LITE 640T').toUpperCase()}
        </div>
        <div className={`md-status-badge md-status-badge--${sVariant}`}>
          <span className={`md-status-dot md-status-dot--${sVariant}${sPulse ? ' animate-pulse' : ''}`} />
          {progress?.status ?? 'idle'}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="md-grid">

        {/* Map */}
        <div className="md-card">
          <p className="md-card-header"><MapPin className="inline h-3 w-3 mr-1" />Flight Map</p>
          <MiniMap position={position} path={path} target={null} />
          {position && (
            <p className="md-map-coords">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>
          )}
        </div>

        {/* Camera feeds */}
        <div className="md-card">
          <div className="md-card-header-row">
            <p className="md-card-header"><Cpu className="inline h-3 w-3 mr-1" />Camera Feeds</p>
            <div className="md-feed-toggles">
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={showVisual} onChange={e => setShowVisual(e.target.checked)} className="accent-cyan-400" />
                Visual
              </label>
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={showThermal} onChange={e => setShowThermal(e.target.checked)} className="accent-cyan-400" />
                Thermal
              </label>
            </div>
          </div>
          <div className={`md-feeds-grid ${showVisual && showThermal ? 'md-feeds-grid--dual' : 'md-feeds-grid--single'}`}>
            {showVisual && (
              <FeedSlot label="Visual" streamUrl={visualStreamUrl ?? null} icon={<Cpu className="h-4 w-4" />} />
            )}
            {showThermal && (
              <FeedSlot label="Thermal" streamUrl={thermalStreamUrl ?? null} icon={<Thermometer className="h-4 w-4" />} />
            )}
          </div>
        </div>

        {/* Telemetry */}
        <div className="md-card">
          <p className="md-card-header"><Activity className="inline h-3 w-3 mr-1" />Telemetry</p>
          <div className="space-y-2">
            <TelRow icon={<Navigation className="h-3.5 w-3.5" />} label="Altitude" value={telemetry ? fmt.m(telemetry.altitude) : '—'} />
            <TelRow icon={<Gauge className="h-3.5 w-3.5" />} label="Speed" value={telemetry ? fmt.speed(telemetry.speed) : '—'} />
            <TelRow
              icon={<Battery className="h-3.5 w-3.5" />}
              label="Battery"
              value={telemetry ? fmt.pct(telemetry.battery) : '—'}
              valueVariant={telemetry ? batteryVariant(telemetry.battery) : undefined}
            />
            <TelRow icon={<MapPin className="h-3.5 w-3.5" />} label="GPS" value={telemetry?.gpsFix ?? '—'} />
            <TelRow icon={<Navigation className="h-3.5 w-3.5" />} label="Distance" value={telemetry ? fmt.m(telemetry.distanceFromHome) : '—'} />
          </div>
        </div>

        {/* Mission progress */}
        <div className="md-card">
          <p className="md-card-header"><Zap className="inline h-3 w-3 mr-1" />Mission Progress</p>
          <div className="space-y-3">
            <div className="md-progress-info">
              <span>Waypoint</span>
              <span>{progress ? `${progress.currentWaypoint} / ${progress.totalWaypoints}` : '— / —'}</span>
            </div>
            <div className="md-progress-info">
              <span>ETA</span>
              <span>{eta}</span>
            </div>
            <div className="md-progress-track">
              <div
                className={`md-progress-fill ${missionDone && progress?.status === 'error' ? 'md-progress-fill--error' : ''}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="md-progress-pct">{progressPct.toFixed(0)}% complete</p>
          </div>
        </div>

        {/* Threat alerts */}
        <div className="md-card">
          <p className="md-card-header"><TriangleAlert className="inline h-3 w-3 mr-1" />Threat Alerts</p>
          <div className="md-alerts-list">
            {alerts.length === 0 && <p className="md-alert-empty">No alerts</p>}
            {alerts.map(a => (
              <div key={a.id} className="md-alert-item">
                <div className="md-alert-left">
                  <AlertTriangle className="h-3 w-3 md-alert-icon" />
                  {a.label}
                </div>
                <div className="md-alert-meta">
                  <span>{(a.confidence * 100).toFixed(0)}%</span>
                  <span>{fmt.time(a.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="md-card">
          <p className="md-card-header"><RefreshCw className="inline h-3 w-3 mr-1" />Manual Override</p>
          <div className="md-ctrl-list">
            <button type="button" className="md-ctrl-btn md-ctrl-btn--cyan" onClick={onPause}>
              <PauseCircle className="h-4 w-4" /> Pause Mission
            </button>
            <button type="button" className="md-ctrl-btn md-ctrl-btn--yellow" onClick={onReturnHome}>
              <RotateCcw className="h-4 w-4" /> Return to Home
            </button>
            <button type="button" className="md-ctrl-btn md-ctrl-btn--red" onClick={onEmergencyLand}>
              <AlertTriangle className="h-4 w-4" /> Emergency Land
            </button>
            {missionDone && onMissionEnd && (
              <button type="button" className="md-ctrl-btn md-ctrl-btn--green" onClick={onMissionEnd}>
                <ArrowLeft className="h-4 w-4" /> New Mission
              </button>
            )}
          </div>
        </div>

        {/* Events log */}
        <div className="md-card md-card--full">
          <p className="md-card-header"><Radio className="inline h-3 w-3 mr-1" />Event Log</p>
          <div className="md-events-list">
            {events.length === 0 && <p className="md-events-empty">No events</p>}
            {events.map(ev => (
              <div key={ev.id} className="md-event-row">
                <span className="md-event-time">{fmt.time(ev.timestamp)}</span>
                <span className="md-event-type">{ev.type}</span>
                <span className="md-event-msg">{ev.message}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const TelRow: React.FC<{ icon: React.ReactNode; label: string; value: string; valueVariant?: BatteryVariant }> = ({
  icon, label, value, valueVariant,
}) => (
  <div className="md-tel-row">
    <div className="md-tel-label">{icon}{label}</div>
    <span className={`md-tel-value${valueVariant ? ` md-tel-value--${valueVariant}` : ''}`}>{value}</span>
  </div>
);

const FeedSlot: React.FC<{ label: string; streamUrl: string | null; icon: React.ReactNode }> = ({
  label, streamUrl, icon,
}) => {
  if (!streamUrl) {
    return (
      <div className="md-feed-empty">
        {icon}
        <span>{label} — no feed</span>
      </div>
    );
  }
  return (
    <div className="md-feed-video">
      <HlsVideoPlayer src={streamUrl} className="w-full" label={`${label} camera feed`} />
    </div>
  );
};

// ─── MiniMap ──────────────────────────────────────────────────────────────────

interface MiniMapProps {
  position: { lat: number; lng: number } | null;
  path: Array<{ lat: number; lng: number }>;
  target: { lat: number; lng: number } | null;
}

const MiniMap: React.FC<MiniMapProps> = ({ position, path, target }) => {
  const bounds = useMemo(() => {
    const pts = [...path];
    if (position) pts.push(position);
    if (target) pts.push(target);
    if (pts.length === 0) return null;
    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    const pad = 0.00005;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [path, position, target]);

  const project = (p: { lat: number; lng: number }) => {
    if (!bounds) return { x: 50, y: 50 };
    const x = ((p.lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 1e-8)) * 96 + 2;
    const y = (1 - (p.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 1e-8)) * 96 + 2;
    return { x, y };
  };

  return (
    <svg
      role="img"
      aria-label="Flight path map"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="md-map-svg"
    >
      {[20, 40, 60, 80].map(n => (
        <React.Fragment key={n}>
          <line x1={n} y1={0} x2={n} y2={100} stroke="rgba(0,255,255,0.06)" strokeWidth="0.4" />
          <line x1={0} y1={n} x2={100} y2={n} stroke="rgba(0,255,255,0.06)" strokeWidth="0.4" />
        </React.Fragment>
      ))}

      {path.length > 1 && (
        <polyline
          points={path.map(p => { const pr = project(p); return `${pr.x},${pr.y}`; }).join(' ')}
          fill="none"
          stroke="rgba(0,255,255,0.5)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}

      {target && (() => {
        const t = project(target);
        return (
          <>
            <circle cx={t.x} cy={t.y} r={4} fill="none" stroke="#ff6600" strokeWidth="1" />
            <circle cx={t.x} cy={t.y} r={1.5} fill="#ff6600" />
          </>
        );
      })()}

      {path.length > 0 && (() => {
        const h = project(path[0]);
        return <rect x={h.x - 2} y={h.y - 2} width={4} height={4} fill="rgba(0,255,136,0.5)" rx={0.5} />;
      })()}

      {position && (() => {
        const c = project(position);
        return (
          <>
            <circle cx={c.x} cy={c.y} r={5} fill="none" stroke="rgba(0,255,136,0.3)" strokeWidth="0.8" />
            <circle cx={c.x} cy={c.y} r={2.5} fill="#00ff88" />
          </>
        );
      })()}

      {!position && path.length === 0 && (
        <text x="50" y="52" textAnchor="middle" fontSize="5" fill="rgba(255,255,255,0.2)">Awaiting telemetry…</text>
      )}
    </svg>
  );
};

export default MissionDashboard;
