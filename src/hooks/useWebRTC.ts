/**
 * useWebRTC — manages RTCPeerConnections for a full-mesh group call.
 *
 * One RTCPeerConnection is created per remote participant.
 * The caller (peer who joined first) sends the offer; joiners answer.
 * ICE candidates and SDP are exchanged via useSignaling.
 *
 * Media is end-to-end encrypted (DTLS-SRTP) and flows peer-to-peer —
 * the signaling server never sees video content.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { type PeerInfo, type useSignaling } from './useSignaling';

type SignalingHandle = ReturnType<typeof useSignaling>;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Optional TURN — set VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls:       import.meta.env.VITE_TURN_URL as string,
        username:   import.meta.env.VITE_TURN_USERNAME as string,
        credential: import.meta.env.VITE_TURN_CREDENTIAL as string,
      }]
    : []),
];

interface UseWebRTCOptions {
  myOid: string;
  signaling: SignalingHandle;
  /** Peers currently in the room (from signaling). */
  peers: PeerInfo[];
}

export function useWebRTC({ myOid, signaling, peers }: UseWebRTCOptions) {
  // peerConnections: oid → RTCPeerConnection
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // localStream that we are sharing
  const localStreamRef = useRef<MediaStream | null>(null);
  // remote streams: oid → MediaStream
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // ── Helpers ────────────────────────────────────────────────────────────────

  const createPeerConnection = useCallback((remoteOid: string, isOfferer: boolean) => {
    if (pcsRef.current.has(remoteOid)) return pcsRef.current.get(remoteOid)!;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(remoteOid, pc);

    // Add current local tracks to the new connection
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // Receive remote tracks
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      setRemoteStreams(prev => new Map(prev).set(remoteOid, stream));
    };

    // Send ICE candidates via signaling
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        signaling.sendIce(remoteOid, ev.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        pcsRef.current.delete(remoteOid);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(remoteOid);
          return next;
        });
      }
    };

    if (isOfferer) {
      // Create and send offer
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signaling.sendOffer(remoteOid, pc.localDescription!);
        } catch (err) {
          console.error('[WebRTC] offer error', err);
        }
      };
    }

    return pc;
  }, [signaling]);

  // ── Signaling event handlers ────────────────────────────────────────────────

  useEffect(() => {
    signaling.on('offer', async (msg) => {
      const fromOid = msg.fromOid as string;
      const sdp     = msg.sdp as RTCSessionDescriptionInit;
      const pc      = createPeerConnection(fromOid, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.sendAnswer(fromOid, pc.localDescription!);
      } catch (err) {
        console.error('[WebRTC] answer error', err);
      }
    });

    signaling.on('answer', async (msg) => {
      const fromOid = msg.fromOid as string;
      const sdp     = msg.sdp as RTCSessionDescriptionInit;
      const pc      = pcsRef.current.get(fromOid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('[WebRTC] setRemoteDescription(answer) error', err);
      }
    });

    signaling.on('ice_candidate', async (msg) => {
      const fromOid   = msg.fromOid as string;
      const candidate = msg.candidate as RTCIceCandidateInit;
      const pc        = pcsRef.current.get(fromOid);
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] addIceCandidate error', err);
      }
    });
  }, [signaling, createPeerConnection]);

  // ── Peer list changes: open/close connections ───────────────────────────────

  useEffect(() => {
    // Open a connection (as offerer) for any newly joined peer
    for (const peer of peers) {
      if (peer.oid !== myOid && !pcsRef.current.has(peer.oid)) {
        createPeerConnection(peer.oid, true);
      }
    }
    // Close connections for peers who left
    const peerOids = new Set(peers.map(p => p.oid));
    for (const [oid, pc] of pcsRef.current) {
      if (!peerOids.has(oid)) {
        pc.close();
        pcsRef.current.delete(oid);
      }
    }
  }, [peers, myOid, createPeerConnection]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      for (const pc of pcsRef.current.values()) pc.close();
      pcsRef.current.clear();
    };
  }, []);

  // ── Public: switch the local stream being shared ────────────────────────────

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;

    for (const pc of pcsRef.current.values()) {
      const senders = pc.getSenders();
      if (!stream) {
        senders.forEach(s => pc.removeTrack(s));
        return;
      }
      for (const track of stream.getTracks()) {
        const existingSender = senders.find(s => s.track?.kind === track.kind);
        if (existingSender) {
          existingSender.replaceTrack(track).catch(console.error);
        } else {
          pc.addTrack(track, stream);
        }
      }
    }
  }, []);

  return { remoteStreams, setLocalStream };
}
