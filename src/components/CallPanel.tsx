/**
 * CallPanel — floating side panel for peer-to-peer group video calls.
 *
 * Features:
 *  • Online teammates list (same org, shown in real-time)
 *  • User search by email / name
 *  • One-click invite + invite link (copy to clipboard)
 *  • Camera source selector (webcam / HLS cameras / drone)
 *  • Active call view with remote video grid and local preview
 *  • Mute and end-call controls
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Phone, PhoneOff, Video, VideoOff, Copy, Check,
  Search, X, Users, ChevronDown,
} from 'lucide-react';
import { useSignaling, type OnlineUser } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { useCameraCapture } from '../hooks/useCameraCapture';
import RemoteVideoGrid from './RemoteVideoGrid';
import CallIncomingModal from './CallIncomingModal';

interface StreamInfo { id: string; name: string; hlsUrl: string | null }

interface CallPanelProps {
  entraOid: string;
  displayName: string;
  webcamStream: MediaStream | null;
  hlsStreams: StreamInfo[];
  /** Map kept by App.tsx: streamId → <video> element from HlsVideoPlayer */
  hlsVideoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  droneCanvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

const CallPanel: React.FC<CallPanelProps> = ({
  entraOid,
  displayName,
  webcamStream,
  hlsStreams,
  hlsVideoRefs,
  droneCanvasRef,
}) => {
  const [isOpen, setIsOpen]             = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<(OnlineUser & { email?: string; online: boolean })[]>([]);
  const [searching, setSearching]       = useState(false);
  const [isMuted, setIsMuted]           = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteToken, setInviteToken]   = useState<string | null>(null);
  const searchTimeout                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPreviewRef                 = useRef<HTMLVideoElement>(null);

  // ── Signaling ──────────────────────────────────────────────────────────────
  const signaling = useSignaling({ entraOid, displayName });

  // ── Camera source ──────────────────────────────────────────────────────────
  const { availableSources, selectedSource, setSelectedSource, getCapturedStream } =
    useCameraCapture({ webcamStream, hlsStreams, hlsVideoRefs, droneCanvasRef });

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const { remoteStreams, setLocalStream } = useWebRTC({
    myOid: entraOid,
    signaling,
    peers: signaling.peers,
  });

  const inCall = !!signaling.roomId;

  // Sync local stream whenever source or webcam stream changes
  useEffect(() => {
    if (!inCall) return;
    setLocalStream(getCapturedStream());
  }, [inCall, selectedSource, webcamStream, getCapturedStream, setLocalStream]);

  // Local preview
  useEffect(() => {
    const stream = getCapturedStream();
    if (localPreviewRef.current && stream) {
      localPreviewRef.current.srcObject = stream;
      localPreviewRef.current.play().catch(() => {});
    }
    return () => {
      if (localPreviewRef.current) localPreviewRef.current.srcObject = null;
    };
  }, [getCapturedStream, selectedSource, webcamStream]);

  // ── Start a call ───────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetOid?: string) => {
    const { roomId, token } = await signaling.createRoom();
    setInviteToken(token);
    // Join our own room
    signaling.joinRoom(roomId);
    // Invite the specific user if provided
    if (targetOid) {
      signaling.invitePeer(targetOid, roomId, token);
    }
    setLocalStream(getCapturedStream());
  }, [signaling, getCapturedStream, setLocalStream]);

  const endCall = useCallback(() => {
    signaling.leaveRoom();
    setLocalStream(null);
    setInviteToken(null);
  }, [signaling, setLocalStream]);

  // ── Accept incoming call ───────────────────────────────────────────────────
  const acceptCall = useCallback(() => {
    if (!signaling.incomingCall) return;
    signaling.joinRoom(signaling.incomingCall.roomId);
    setLocalStream(getCapturedStream());
    signaling.dismissIncomingCall();
  }, [signaling, getCapturedStream, setLocalStream]);

  const declineCall = useCallback(() => {
    signaling.dismissIncomingCall();
  }, [signaling]);

  // ── Mute toggle ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = getCapturedStream();
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  }, [getCapturedStream, isMuted]);

  // ── User search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/signal/users/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
      } catch { /* ignore */ } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery]);

  // ── Copy invite link ───────────────────────────────────────────────────────
  const copyInviteLink = useCallback(() => {
    if (!inviteToken) return;
    const url = `${window.location.origin}/?join=${inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }, [inviteToken]);

  // ── Handle invite token in URL (deep link) ─────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('join');
    if (token && !inCall && entraOid) {
      // Auto-open and join
      setIsOpen(true);
      signaling.joinRoom(token);
      setLocalStream(getCapturedStream());
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [entraOid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online users (filter out self) ────────────────────────────────────────
  const onlineOthers = signaling.onlineUsers.filter(u => u.oid !== entraOid);

  return (
    <>
      {/* Incoming call modal */}
      {signaling.incomingCall && (
        <CallIncomingModal
          call={signaling.incomingCall}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

      {/* Floating action button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all hover:scale-110"
        style={{
          background: inCall ? '#00cc66' : '#00ffff',
          color: '#000',
          boxShadow: inCall
            ? '0 0 20px rgba(0,204,102,0.5)'
            : '0 0 16px rgba(0,255,255,0.4)',
        }}
        aria-label="Open call panel"
      >
        <Users className="w-6 h-6" />
        {inCall && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse border-2 border-black" />
        )}
        {/* Online count badge */}
        {!inCall && onlineOthers.length > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: '#ff4444', color: '#fff' }}
          >
            {onlineOthers.length}
          </span>
        )}
      </button>

      {/* Side panel */}
      {isOpen && (
        <div
          className="fixed right-0 top-0 h-full z-40 flex flex-col overflow-hidden shadow-2xl"
          style={{
            width: 340,
            background: '#0a0a0a',
            borderLeft: '1px solid rgba(0,255,255,0.2)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderBottom: '1px solid rgba(0,255,255,0.15)' }}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: '#00ffff' }} />
              <span className="font-semibold text-sm" style={{ color: '#00ffff' }}>
                {inCall ? `In call · ${signaling.peers.length + 1} people` : 'Team & Calls'}
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── In-call view ── */}
            {inCall && (
              <section>
                {/* Remote video grid */}
                <RemoteVideoGrid remoteStreams={remoteStreams} peers={signaling.peers} />

                {/* Local preview */}
                <div className="mt-3 relative rounded-lg overflow-hidden"
                     style={{ height: 80, background: '#111', border: '1px solid rgba(0,255,255,0.15)' }}>
                  <video
                    ref={localPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 left-2 text-xs" style={{ color: 'rgba(0,255,255,0.7)' }}>
                    You
                  </span>
                </div>

                {/* Camera source selector */}
                <div className="mt-2 relative">
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Sharing:
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSource}
                      onChange={e => setSelectedSource(e.target.value as typeof selectedSource)}
                      className="w-full appearance-none rounded px-3 py-2 text-sm pr-8"
                      style={{
                        background: '#111',
                        border: '1px solid rgba(0,255,255,0.2)',
                        color: '#fff',
                      }}
                    >
                      {availableSources.map(src => (
                        <option key={src.id} value={src.id}>{src.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 pointer-events-none"
                                 style={{ color: 'rgba(0,255,255,0.6)' }} />
                  </div>
                </div>

                {/* Invite link */}
                {inviteToken && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/?join=${inviteToken}`}
                      className="flex-1 rounded px-2 py-1 text-xs truncate"
                      style={{ background: '#111', border: '1px solid rgba(0,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
                    />
                    <button
                      onClick={copyInviteLink}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                      style={{ background: 'rgba(0,255,255,0.1)', color: '#00ffff', border: '1px solid rgba(0,255,255,0.2)' }}
                    >
                      {inviteCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {inviteCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {/* Call controls */}
                <div className="mt-3 flex gap-3 justify-center">
                  <button
                    onClick={toggleMute}
                    className="flex items-center justify-center w-10 h-10 rounded-full transition-all hover:scale-110"
                    style={{ background: isMuted ? '#555' : 'rgba(0,255,255,0.15)', border: '1px solid rgba(0,255,255,0.3)' }}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted
                      ? <VideoOff className="w-4 h-4 text-gray-400" />
                      : <Video className="w-4 h-4" style={{ color: '#00ffff' }} />}
                  </button>
                  <button
                    onClick={endCall}
                    className="flex items-center justify-center w-10 h-10 rounded-full transition-all hover:scale-110"
                    style={{ background: '#ff4444' }}
                    title="End call"
                  >
                    <PhoneOff className="w-4 h-4 text-white" />
                  </button>
                </div>
              </section>
            )}

            {/* ── Online teammates ── */}
            {!inCall && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'rgba(0,255,255,0.5)' }}>
                  Online now ({onlineOthers.length})
                </h3>
                {onlineOthers.length === 0 ? (
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No teammates online right now.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {onlineOthers.map(user => (
                      <li key={user.oid}
                          className="flex items-center justify-between rounded-lg px-3 py-2"
                          style={{ background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(0,255,255,0.08)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-sm text-white">{user.displayName}</span>
                        </div>
                        <button
                          onClick={() => startCall(user.oid)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                          style={{ background: '#00ffff', color: '#000' }}
                        >
                          <Phone className="w-3 h-3" />
                          Call
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── Search ── */}
            {!inCall && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'rgba(0,255,255,0.5)' }}>
                  Find by email / name
                </h3>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5"
                          style={{ color: 'rgba(0,255,255,0.4)' }} />
                  <input
                    type="text"
                    placeholder="Search users…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded pl-8 pr-3 py-2 text-sm"
                    style={{
                      background: '#111',
                      border: '1px solid rgba(0,255,255,0.2)',
                      color: '#fff',
                    }}
                  />
                </div>
                {searching && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Searching…</p>
                )}
                {searchResults.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {searchResults.map(user => (
                      <li key={user.oid}
                          className="flex items-center justify-between rounded px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <p className="text-sm text-white">{user.displayName}</p>
                          {user.email && (
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {user.online && <span className="w-2 h-2 rounded-full bg-green-400" title="Online" />}
                          <button
                            onClick={() => startCall(user.oid)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                            style={{ background: '#00ffff', color: '#000' }}
                          >
                            <Phone className="w-3 h-3" /> Call
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── Start a call with invite link ── */}
            {!inCall && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'rgba(0,255,255,0.5)' }}>
                  Invite via link
                </h3>
                <button
                  onClick={() => startCall()}
                  className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'rgba(0,255,255,0.1)', color: '#00ffff', border: '1px solid rgba(0,255,255,0.3)' }}
                >
                  <Copy className="w-4 h-4" />
                  Create room &amp; copy invite link
                </button>
                {inviteToken && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/?join=${inviteToken}`}
                      className="flex-1 rounded px-2 py-1 text-xs truncate"
                      style={{ background: '#111', border: '1px solid rgba(0,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
                    />
                    <button
                      onClick={copyInviteLink}
                      className="px-2 py-1 rounded text-xs"
                      style={{ background: 'rgba(0,255,255,0.1)', color: '#00ffff' }}
                    >
                      {inviteCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </section>
            )}

          </div>

          {/* Connection status footer */}
          <div className="px-4 py-2 text-xs flex items-center gap-1"
               style={{ borderTop: '1px solid rgba(0,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${signaling.isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
            {signaling.isConnected ? 'Signaling connected' : 'Reconnecting…'}
          </div>
        </div>
      )}
    </>
  );
};

export default CallPanel;
