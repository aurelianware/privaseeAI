import React, { useEffect, useRef } from 'react';
import { type PeerInfo } from '../hooks/useSignaling';

interface RemoteVideoGridProps {
  remoteStreams: Map<string, MediaStream>;
  peers: PeerInfo[];
}

function RemoteVideoTile({ stream, peer }: { stream: MediaStream; peer: PeerInfo }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);

  const initials = peer.displayName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="relative rounded-lg overflow-hidden bg-gray-900" style={{ border: '1px solid rgba(0,255,255,0.2)' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="w-full h-full object-cover"
        style={{ minHeight: 120 }}
      />
      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs font-medium"
           style={{ background: 'rgba(0,0,0,0.6)', color: '#00ffff' }}>
        {initials && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full mr-1 text-xs font-bold"
                style={{ background: 'rgba(0,255,255,0.2)', color: '#00ffff' }}>
            {initials}
          </span>
        )}
        {peer.displayName}
      </div>
    </div>
  );
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

const RemoteVideoGrid: React.FC<RemoteVideoGridProps> = ({ remoteStreams, peers }) => {
  const activePeers = peers.filter(p => remoteStreams.has(p.oid));

  if (activePeers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg text-sm"
           style={{ background: 'rgba(0,255,255,0.03)', border: '1px dashed rgba(0,255,255,0.15)', color: 'rgba(0,255,255,0.4)' }}>
        Waiting for others to join…
      </div>
    );
  }

  return (
    <div className={`grid gap-2 ${gridClass(activePeers.length)}`}>
      {activePeers.map(peer => (
        <RemoteVideoTile
          key={peer.oid}
          stream={remoteStreams.get(peer.oid)!}
          peer={peer}
        />
      ))}
    </div>
  );
};

export default RemoteVideoGrid;
