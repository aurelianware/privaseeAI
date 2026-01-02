import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface Telemetry {
  lat: number;
  lng: number;
  altitude: number; // meters
  speed: number; // m/s
  battery: number; // 0-100
  gpsFix: 'none' | '2d' | '3d';
  distanceFromHome: number; // meters
}

export interface MissionProgress {
  missionName?: string;
  currentWaypoint: number;
  totalWaypoints: number;
  etaSeconds?: number;
  status: 'idle' | 'preflight' | 'launching' | 'flying' | 'returning' | 'landing' | 'complete' | 'error';
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
  websocketUrl?: string; // e.g., ws://host/ws/mission
  initialTelemetry?: Telemetry;
  initialProgress?: MissionProgress;
  initialAlerts?: ThreatAlert[];
  initialEvents?: MissionEvent[];
  visualStreamUrl?: string; // HLS/MP4/WS relay
  thermalStreamUrl?: string;
  onPause?: () => void;
  onReturnHome?: () => void;
  onEmergencyLand?: () => void;
}

interface WsPayload {
  type: 'telemetry' | 'progress' | 'alert' | 'event' | 'position';
  data: any;
}

const formatMeters = (m: number) => `${m.toFixed(0)} m`;
const formatSpeed = (s: number) => `${s.toFixed(1)} m/s`;
const formatPercent = (p: number) => `${p.toFixed(0)}%`;

const MissionDashboard: React.FC<MissionDashboardProps> = ({
  missionId,
  websocketUrl,
  initialTelemetry,
  initialProgress,
  initialAlerts,
  initialEvents,
  visualStreamUrl,
  thermalStreamUrl,
  onPause,
  onReturnHome,
  onEmergencyLand
}) => {
  const [telemetry, setTelemetry] = useState<Telemetry | undefined>(initialTelemetry);
  const [progress, setProgress] = useState<MissionProgress | undefined>(initialProgress);
  const [alerts, setAlerts] = useState<ThreatAlert[]>(initialAlerts ?? []);
  const [events, setEvents] = useState<MissionEvent[]>(initialEvents ?? []);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(initialTelemetry ? { lat: initialTelemetry.lat, lng: initialTelemetry.lng } : null);
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
          default:
            break;
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    ws.onerror = (e) => console.error('WS error', e);
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [websocketUrl]);

  const eta = useMemo(() => {
    if (!progress?.etaSeconds) return '—';
    const mins = Math.floor(progress.etaSeconds / 60);
    const secs = progress.etaSeconds % 60;
    return `${mins}m ${secs}s`;
  }, [progress]);

  return (
    <div className="mission-dashboard" aria-label="Drone mission dashboard">
      <div className="grid" role="main">
        <section className="card map" aria-label="Map and path">
          <header className="card-header">Mission Map</header>
          <MiniMap position={position} path={path} target={null} />
        </section>

        <section className="card feeds" aria-label="Camera feeds">
          <header className="card-header">Camera Feeds</header>
          <div className="feed-toggles" role="group" aria-label="Camera toggles">
            <label><input type="checkbox" checked={showVisual} onChange={(e) => setShowVisual(e.target.checked)} /> Visual</label>
            <label><input type="checkbox" checked={showThermal} onChange={(e) => setShowThermal(e.target.checked)} /> Thermal</label>
          </div>
          <div className="feeds-body">
            {showVisual && visualStreamUrl ? (
              <video className="feed" src={visualStreamUrl} autoPlay muted playsInline aria-label="Visual camera feed" />
            ) : (
              <div className="feed placeholder" aria-label="Visual feed unavailable">Visual feed off</div>
            )}
            {showThermal && thermalStreamUrl ? (
              <video className="feed" src={thermalStreamUrl} autoPlay muted playsInline aria-label="Thermal camera feed" />
            ) : (
              <div className="feed placeholder" aria-label="Thermal feed unavailable">Thermal feed off</div>
            )}
          </div>
        </section>

        <section className="card telemetry" aria-label="Telemetry">
          <header className="card-header">Telemetry</header>
          <ul>
            <li><strong>Altitude:</strong> {telemetry ? formatMeters(telemetry.altitude) : '—'}</li>
            <li><strong>Speed:</strong> {telemetry ? formatSpeed(telemetry.speed) : '—'}</li>
            <li><strong>Battery:</strong> {telemetry ? formatPercent(telemetry.battery) : '—'}</li>
            <li><strong>GPS:</strong> {telemetry ? telemetry.gpsFix : '—'}</li>
            <li><strong>Distance Home:</strong> {telemetry ? formatMeters(telemetry.distanceFromHome) : '—'}</li>
          </ul>
        </section>

        <section className="card progress" aria-label="Mission progress">
          <header className="card-header">Mission Progress</header>
          <div className="progress-row">
            <div><strong>Status:</strong> {progress?.status ?? '—'}</div>
            <div><strong>Waypoint:</strong> {progress ? `${progress.currentWaypoint}/${progress.totalWaypoints}` : '—'}</div>
            <div><strong>ETA:</strong> {eta}</div>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress?.totalWaypoints ?? 1} aria-valuenow={progress?.currentWaypoint ?? 0}>
            <div className="bar-fill" style={{ width: progress ? `${(progress.currentWaypoint / Math.max(progress.totalWaypoints, 1)) * 100}%` : '0%' }} />
          </div>
        </section>

        <section className="card alerts" aria-label="Threat alerts">
          <header className="card-header">Threat Alerts</header>
          <ul>
            {alerts.length === 0 && <li>No alerts</li>}
            {alerts.map((a) => (
              <li key={a.id}>
                <div className="alert-top">
                  <span className="alert-label">{a.label}</span>
                  <span className="alert-score">{(a.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="alert-time">{new Date(a.timestamp).toLocaleTimeString()}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card controls" aria-label="Manual controls">
          <header className="card-header">Manual Override</header>
          <div className="controls-row" role="group" aria-label="Manual overrides">
            <button onClick={onPause} aria-label="Pause mission">Pause</button>
            <button onClick={onReturnHome} aria-label="Return to home">Return Home</button>
            <button onClick={onEmergencyLand} className="danger" aria-label="Emergency land">Emergency Land</button>
          </div>
        </section>

        <section className="card history" aria-label="Flight history">
          <header className="card-header">Events</header>
          <ul>
            {events.length === 0 && <li>No events</li>}
            {events.map(ev => (
              <li key={ev.id}>
                <div className="event-top">
                  <span className="event-type">{ev.type}</span>
                  <span className="event-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="event-msg">{ev.message}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <style jsx>{`
        .mission-dashboard { display: grid; gap: 16px; padding: 16px; }
        .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
        .card { background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.2); }
        .card-header { font-weight: 600; margin-bottom: 8px; }
        .feeds-body { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
        .feed { width: 100%; border-radius: 8px; background: #111827; }
        .feed.placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; min-height: 140px; border: 1px dashed #334155; }
        .feed-toggles { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
        .telemetry ul, .alerts ul, .history ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
        .progress .bar { background: #1f2937; border-radius: 6px; height: 10px; margin-top: 8px; }
        .bar-fill { background: linear-gradient(90deg, #22c55e, #10b981); height: 100%; border-radius: 6px; transition: width 0.2s ease; }
        .alert-top, .event-top { display: flex; justify-content: space-between; font-weight: 600; }
        .controls-row { display: flex; gap: 8px; flex-wrap: wrap; }
        button { padding: 8px 12px; border-radius: 6px; border: 1px solid #1f2937; background: #1e293b; color: #e2e8f0; cursor: pointer; }
        button:focus { outline: 2px solid #38bdf8; outline-offset: 2px; }
        button.danger { background: #7f1d1d; border-color: #b91c1c; }
        .map-svg { width: 100%; height: 220px; background: #0b1220; border-radius: 8px; }
        @media (max-width: 640px) {
          .feeds-body { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

interface MiniMapProps {
  position: { lat: number; lng: number } | null;
  path: Array<{ lat: number; lng: number }>;
  target: { lat: number; lng: number } | null;
}

const MiniMap: React.FC<MiniMapProps> = ({ position, path, target }) => {
  // Simple normalized map using min/max of path for relative plotting
  const bounds = useMemo(() => {
    const pts = [...path];
    if (position) pts.push(position);
    if (target) pts.push(target);
    if (pts.length === 0) return null;
    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs)
    };
  }, [path, position, target]);

  const project = (p: { lat: number; lng: number }) => {
    if (!bounds) return { x: 50, y: 50 };
    const x = ((p.lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 1e-6)) * 100;
    const y = (1 - (p.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 1e-6)) * 100;
    return { x, y };
  };

  return (
    <svg className="map-svg" role="img" aria-label="Flight path map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="100" height="100" fill="#0b1220" />
      {/* Path */}
      {path.length > 1 && (
        <polyline
          points={path.map(p => { const pr = project(p); return `${pr.x},${pr.y}`; }).join(' ')}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.5"
        />
      )}
      {/* Target */}
      {target && (() => { const t = project(target); return <circle cx={t.x} cy={t.y} r={2} fill="#f97316" aria-label="Target" />; })()}
      {/* Current position */}
      {position && (() => { const c = project(position); return <circle cx={c.x} cy={c.y} r={2.5} fill="#22c55e" aria-label="Drone position" />; })()}
    </svg>
  );
};

export default MissionDashboard;
