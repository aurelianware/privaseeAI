import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader, Radio, RefreshCw, RotateCw, Search, Shield, Wifi, XCircle, Zap } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type MissionTemplate = 'patrol' | 'investigate' | 'perimeter';

interface PreflightItem {
  label: string;
  ok: boolean;
  detail: string;
}

interface MissionParams {
  lat: string;
  lng: string;
  altitude: string;
  radius: string;
  speed: string;
}

interface MissionLauncherProps {
  droneConnected: boolean;
  droneStreams: { visual: string | null; thermal: string | null };
  onConnect: () => Promise<void>;
  onMissionLaunched: () => void;
}

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES: Array<{
  id: MissionTemplate;
  label: string;
  description: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  defaults: Partial<MissionParams>;
}> = [
  {
    id: 'patrol',
    label: 'Patrol',
    description: 'Systematic area sweep along a grid pattern',
    icon: RotateCw,
    defaults: { altitude: '60', radius: '100', speed: '8' },
  },
  {
    id: 'investigate',
    label: 'Investigate',
    description: 'Close-range inspection of a specific target point',
    icon: Search,
    defaults: { altitude: '30', radius: '20', speed: '4' },
  },
  {
    id: 'perimeter',
    label: 'Perimeter',
    description: 'Boundary circle surveillance run',
    icon: Shield,
    defaults: { altitude: '50', radius: '50', speed: '6' },
  },
];

// ─── WiFi setup steps ──────────────────────────────────────────────────────────

const WIFI_STEPS = [
  'Power on the Autel EVO Lite 640T — wait for solid LED indicators',
  'On Mac: System Settings → WiFi → select EVO-LITE-DEV network',
  'Enter the password from your drone documentation (or .env DRONE_PASSWORD)',
  'Click Connect below — the server will ping 192.168.0.1 and start live streams',
];

// ─── MissionLauncher ──────────────────────────────────────────────────────────

const MissionLauncher: React.FC<MissionLauncherProps> = ({
  droneConnected,
  onConnect,
  onMissionLaunched,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MissionTemplate>('patrol');
  const [params, setParams] = useState<MissionParams>({
    lat: '',
    lng: '',
    altitude: '60',
    radius: '100',
    speed: '8',
  });
  const [preflight, setPreflight] = useState<PreflightItem[] | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // When template changes, update param defaults
  const selectTemplate = (t: MissionTemplate) => {
    const tpl = TEMPLATES.find(x => x.id === t)!;
    setSelectedTemplate(t);
    setParams(prev => ({ ...prev, ...tpl.defaults }));
  };

  // Run preflight when connected and lat/lng are provided
  const runPreflight = useCallback(async () => {
    if (!droneConnected || !params.lat || !params.lng) return;
    setPreflightLoading(true);
    try {
      const res = await fetch(`/api/drone/preflight?lat=${params.lat}&lng=${params.lng}`);
      const data = await res.json();
      if (data.details && Array.isArray(data.details)) {
        setPreflight(data.details);
      } else if (data.ok !== undefined) {
        // Fallback: synthesise a single item
        setPreflight([{ label: 'System check', ok: data.ok, detail: data.reasons?.join(', ') ?? '' }]);
      }
    } catch {
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }, [droneConnected, params.lat, params.lng]);

  useEffect(() => {
    const id = setTimeout(runPreflight, 600);
    return () => clearTimeout(id);
  }, [runPreflight]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect();
    } finally {
      setConnecting(false);
    }
  };

  const allPreflightOk = preflight != null && preflight.length > 0 && preflight.every(p => p.ok);
  const canLaunch = droneConnected && params.lat && params.lng && !launching;

  const handleLaunch = async () => {
    if (!canLaunch) return;
    setLaunchError(null);
    setLaunching(true);
    try {
      const res = await fetch('/api/drone/mission/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: selectedTemplate,
          lat: parseFloat(params.lat),
          lng: parseFloat(params.lng),
          altitude: parseFloat(params.altitude) || undefined,
          radius: parseFloat(params.radius) || undefined,
          speed: parseFloat(params.speed) || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onMissionLaunched();
    } catch (e: any) {
      setLaunchError(e.message ?? 'Launch failed');
      setLaunching(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#050a0f', border: '1px solid rgba(0,255,255,0.15)', fontFamily: 'inherit' }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(0,255,255,0.1)', background: 'rgba(0,255,255,0.03)' }}
      >
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5" style={{ color: '#00ffff' }} />
          <span className="text-base font-bold tracking-wider" style={{ color: '#00ffff', letterSpacing: '0.1em' }}>
            DRONE OPERATIONS CENTER
          </span>
        </div>
        {/* Connection badge */}
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
          style={droneConnected
            ? { background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }
            : { background: 'rgba(255,255,255,0.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.1)' }
          }
        >
          <span
            className={droneConnected ? 'animate-pulse' : ''}
            style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: droneConnected ? '#00ff88' : '#374151' }}
          />
          {droneConnected ? 'EVO Lite 640T — Connected' : 'Not connected'}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ─── WiFi Setup Guide (shown when disconnected) ─── */}
        {!droneConnected && (
          <div
            className="rounded-xl p-5"
            style={{ background: 'rgba(0,100,120,0.12)', border: '1px solid rgba(0,255,255,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="h-4 w-4" style={{ color: '#00ffff' }} />
              <span className="text-sm font-semibold" style={{ color: '#00ffff' }}>WiFi Setup Required</span>
            </div>
            <ol className="space-y-2 mb-5">
              {WIFI_STEPS.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span
                    className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(0,255,255,0.15)', color: '#00ffff' }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: connecting ? 'rgba(0,255,255,0.1)' : 'rgba(0,255,255,0.15)',
                color: '#00ffff',
                border: '1px solid rgba(0,255,255,0.4)',
                cursor: connecting ? 'not-allowed' : 'pointer',
              }}
            >
              {connecting ? <Loader className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              {connecting ? 'Connecting…' : 'Connect to Drone'}
            </button>
          </div>
        )}

        {/* ─── Mission Template Cards ─── */}
        <div>
          <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(0,255,255,0.5)' }}>
            SELECT MISSION TYPE
          </p>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map(tpl => {
              const Icon = tpl.icon;
              const active = selectedTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl text-left transition-all"
                  style={{
                    background: active ? 'rgba(0,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                    border: active ? '1px solid rgba(0,255,255,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: active ? '0 0 18px rgba(0,255,255,0.1)' : 'none',
                  }}
                >
                  <Icon className="h-6 w-6" style={{ color: active ? '#00ffff' : 'rgba(255,255,255,0.4)' }} />
                  <span className="text-sm font-semibold" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                    {tpl.label}
                  </span>
                  <span className="text-xs text-center leading-snug" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {tpl.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Parameters ─── */}
        <div>
          <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(0,255,255,0.5)' }}>
            TARGET &amp; PARAMETERS
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Latitude" value={params.lat} onChange={v => setParams(p => ({ ...p, lat: v }))} placeholder="e.g. 37.7749" />
            <Field label="Longitude" value={params.lng} onChange={v => setParams(p => ({ ...p, lng: v }))} placeholder="e.g. -122.4194" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Altitude (m)" value={params.altitude} onChange={v => setParams(p => ({ ...p, altitude: v }))} />
            <Field label="Radius (m)" value={params.radius} onChange={v => setParams(p => ({ ...p, radius: v }))} />
            <Field label="Speed (m/s)" value={params.speed} onChange={v => setParams(p => ({ ...p, speed: v }))} />
          </div>
        </div>

        {/* ─── Preflight Checklist ─── */}
        {droneConnected && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold tracking-widest" style={{ color: 'rgba(0,255,255,0.5)' }}>
                PRE-FLIGHT CHECKLIST
              </p>
              <button
                onClick={runPreflight}
                disabled={preflightLoading || !params.lat || !params.lng}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                style={{ color: 'rgba(0,255,255,0.6)', background: 'rgba(0,255,255,0.06)', border: 'none', cursor: 'pointer' }}
              >
                <RefreshCw className={`h-3 w-3 ${preflightLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {preflightLoading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <Loader className="h-4 w-4 animate-spin" />
                Running checks…
              </div>
            )}

            {!preflightLoading && (!params.lat || !params.lng) && (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Enter target coordinates to run preflight checks.</p>
            )}

            {!preflightLoading && preflight && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                {preflight.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                    style={{
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderBottom: i < preflight.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    {item.ok
                      ? <CheckCircle className="h-4 w-4 flex-none" style={{ color: '#00ff88' }} />
                      : <XCircle className="h-4 w-4 flex-none" style={{ color: '#ff4444' }} />
                    }
                    <span style={{ color: item.ok ? 'rgba(255,255,255,0.8)' : '#ff8888' }}>{item.label}</span>
                    {item.detail && (
                      <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.detail}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!preflightLoading && preflight && !allPreflightOk && (
              <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: '#ffaa44' }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Some checks failed — review before launching
              </div>
            )}
          </div>
        )}

        {/* ─── Launch ─── */}
        <div className="space-y-3">
          {launchError && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm" style={{ background: 'rgba(255,68,68,0.1)', color: '#ff8888', border: '1px solid rgba(255,68,68,0.2)' }}>
              <AlertTriangle className="h-4 w-4" />
              {launchError}
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={!canLaunch || launching}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl text-sm font-bold tracking-widest transition-all"
            style={{
              background: canLaunch && !launching
                ? 'linear-gradient(135deg, rgba(0,255,255,0.2) 0%, rgba(0,200,255,0.15) 100%)'
                : 'rgba(255,255,255,0.04)',
              color: canLaunch && !launching ? '#00ffff' : 'rgba(255,255,255,0.2)',
              border: canLaunch && !launching
                ? '1px solid rgba(0,255,255,0.4)'
                : '1px solid rgba(255,255,255,0.08)',
              cursor: canLaunch && !launching ? 'pointer' : 'not-allowed',
              boxShadow: canLaunch && !launching ? '0 0 30px rgba(0,255,255,0.1)' : 'none',
              letterSpacing: '0.15em',
            }}
          >
            {launching
              ? <><Loader className="h-4 w-4 animate-spin" /> LAUNCHING…</>
              : <><Zap className="h-4 w-4" /> LAUNCH MISSION</>
            }
          </button>

          {!droneConnected && (
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Connect to the drone WiFi first
            </p>
          )}
          {droneConnected && (!params.lat || !params.lng) && (
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Enter target coordinates to enable launch
            </p>
          )}
        </div>

      </div>
    </div>
  );
};

// ─── Small field component ────────────────────────────────────────────────────

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs mb-1 font-medium" style={{ color: 'rgba(0,255,255,0.5)' }}>
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-sm"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
        outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = 'rgba(0,255,255,0.4)'; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
    />
  </div>
);

export default MissionLauncher;
