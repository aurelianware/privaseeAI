import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface LaunchApprovalProps {
  requestId: string;
  threatType: string;
  locationLabel: string;
  snapshotUrl?: string;
  estimatedDurationMin: number;
  estimatedBatteryPct: number;
  weatherSummary?: string;
  falsePositiveRate?: number; // 0-1
  autoCancelMs?: number;
  onApprove: (requestId: string) => Promise<void> | void;
  onCancel: (requestId: string, reason: string) => Promise<void> | void;
  onTimeout?: (requestId: string) => Promise<void> | void;
  requestBiometric?: () => Promise<boolean>; // hook to native/WebAuthn
  offline?: boolean;
}

const cancelReasons = [
  'Low confidence',
  'Known friendly',
  'Weather risk',
  'Airspace restriction',
  'Other'
];

export const LaunchApprovalCard: React.FC<LaunchApprovalProps> = ({
  requestId,
  threatType,
  locationLabel,
  snapshotUrl,
  estimatedDurationMin,
  estimatedBatteryPct,
  weatherSummary,
  falsePositiveRate,
  autoCancelMs = 30_000,
  onApprove,
  onCancel,
  onTimeout,
  requestBiometric,
  offline
}) => {
  const [countdown, setCountdown] = useState(autoCancelMs);
  const [selectedReason, setSelectedReason] = useState(cancelReasons[0]);
  const [pending, setPending] = useState(false);
  const [queued, setQueued] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        const next = Math.max(prev - 1000, 0);
        if (next === 0) {
          timerRef.current && clearInterval(timerRef.current);
          onTimeout?.(requestId);
        }
        return next;
      });
    }, 1000);
    return () => {
      timerRef.current && clearInterval(timerRef.current);
    };
  }, [autoCancelMs, onTimeout, requestId]);

  const minutesSeconds = useMemo(() => {
    const sec = Math.floor(countdown / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [countdown]);

  const handleApprove = async () => {
    setPending(true);
    try {
      if (requestBiometric) {
        const ok = await requestBiometric();
        if (!ok) {
          setPending(false);
          return;
        }
      }
      if (offline) {
        queueRequest({ type: 'approve', requestId });
        setQueued(true);
      } else {
        await onApprove(requestId);
      }
    } finally {
      setPending(false);
    }
  };

  const handleCancel = async () => {
    setPending(true);
    try {
      if (offline) {
        queueRequest({ type: 'cancel', requestId, reason: selectedReason });
        setQueued(true);
      } else {
        await onCancel(requestId, selectedReason);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="launch-card" role="dialog" aria-label="Launch approval" aria-live="polite">
      <div className="header">
        <div>
          <div className="pill">Launch Request</div>
          <h2>{threatType}</h2>
          <p className="location" aria-label="Location">{locationLabel}</p>
        </div>
        <div className="countdown" aria-label={`Auto cancel in ${minutesSeconds}`}>{minutesSeconds}</div>
      </div>

      <div className="snapshot" aria-label="Camera snapshot">
        {snapshotUrl ? <img src={snapshotUrl} alt="Threat snapshot" /> : <div className="placeholder">No snapshot</div>}
      </div>

      <div className="stats" role="list">
        <Stat label="Est. Duration" value={`${estimatedDurationMin} min`} />
        <Stat label="Est. Battery" value={`${estimatedBatteryPct}%`} />
        <Stat label="Weather" value={weatherSummary ?? '—'} />
        <Stat label="False Positive" value={falsePositiveRate != null ? `${(falsePositiveRate * 100).toFixed(1)}%` : '—'} />
      </div>

      <div className="actions" role="group" aria-label="Approval actions">
        <button className="approve" onClick={handleApprove} disabled={pending} aria-label="Approve launch with biometric confirmation">
          {queued ? 'Queued (offline)' : pending ? 'Approving…' : 'Approve Launch'}
        </button>
        <div className="cancel-row">
          <select value={selectedReason} onChange={(e) => setSelectedReason(e.target.value)} aria-label="Cancel reason">
            {cancelReasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="cancel" onClick={handleCancel} disabled={pending} aria-label="Cancel launch">Cancel</button>
        </div>
      </div>

      <p className="hint" aria-label="Offline status">{offline ? 'Offline: request will be queued' : 'Online approval'}</p>

      <style jsx>{`
        .launch-card { max-width: 420px; width: 100%; background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 12px; }
        .header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .pill { background: #1d4ed8; color: #e0f2fe; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
        h2 { margin: 4px 0 0 0; font-size: 18px; }
        .location { margin: 2px 0 0 0; color: #94a3b8; font-size: 14px; }
        .countdown { font-weight: 700; font-size: 20px; color: #f97316; }
        .snapshot { width: 100%; aspect-ratio: 16/9; background: #111827; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .snapshot img { width: 100%; height: 100%; object-fit: cover; }
        .placeholder { color: #64748b; }
        .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .stat { background: #111827; padding: 8px; border-radius: 8px; }
        .stat-label { color: #94a3b8; font-size: 12px; }
        .stat-value { font-weight: 600; }
        .actions { display: flex; flex-direction: column; gap: 8px; }
        button { border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; }
        .approve { background: linear-gradient(90deg, #22c55e, #16a34a); color: #0b1220; }
        .approve:disabled, .cancel:disabled { opacity: 0.6; cursor: not-allowed; }
        .cancel-row { display: flex; gap: 8px; align-items: center; }
        select { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #1f2937; background: #0b1220; color: #e2e8f0; }
        .cancel { background: #1f2937; color: #e2e8f0; padding: 12px 16px; }
        .hint { font-size: 12px; color: #94a3b8; margin: 0; }
        @media (max-width: 540px) {
          .launch-card { padding: 14px; }
          .header { flex-direction: column; align-items: flex-start; }
          .stats { grid-template-columns: 1fr; }
          .cancel-row { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="stat" role="listitem">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
  </div>
);

// Basic offline queue using localStorage; replace with IndexedDB for durability
function queueRequest(entry: { type: 'approve' | 'cancel'; requestId: string; reason?: string }) {
  try {
    const key = 'launch-queue';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...entry, queuedAt: Date.now() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.warn('Queue persist failed', e);
  }
}

export default LaunchApprovalCard;
