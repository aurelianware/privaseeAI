/**
 * useSignaling — WebSocket client for the /ws/signal signaling server.
 *
 * The server is a pure relay: it never touches media.  All SDP offer/answer
 * and ICE candidates pass through here so WebRTC peers can find each other,
 * then media flows P2P (DTLS-SRTP encrypted) after ICE completes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface OnlineUser {
  oid: string;
  displayName: string;
}

export interface IncomingCall {
  fromOid: string;
  displayName: string;
  roomId: string;
  token: string;
}

export interface PeerInfo {
  oid: string;
  displayName: string;
}

type SignalingHandler = (msg: Record<string, unknown>) => void;

interface UseSignalingOptions {
  entraOid: string;
  displayName: string;
}

export function useSignaling({ entraOid, displayName }: UseSignalingOptions) {
  const [isConnected, setIsConnected]     = useState(false);
  const [onlineUsers, setOnlineUsers]     = useState<OnlineUser[]>([]);
  const [roomId, setRoomId]               = useState<string | null>(null);
  const [peers, setPeers]                 = useState<PeerInfo[]>([]);
  const [incomingCall, setIncomingCall]   = useState<IncomingCall | null>(null);

  const wsRef        = useRef<WebSocket | null>(null);
  const handlersRef  = useRef<Map<string, SignalingHandler>>(new Map());
  const retryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay   = useRef(1000);
  const connectRef   = useRef<(() => void) | null>(null);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/signal`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retryDelay.current = 1000;
      // Register identity with the server
      ws.send(JSON.stringify({ type: 'register', entraOid, displayName }));
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Exponential backoff reconnect (cap at 30 s)
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
        connectRef.current?.();
      }, retryDelay.current);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(ev.data as string); } catch { return; }

      const type = msg.type as string;

      switch (type) {
        case 'online_users':
          setOnlineUsers((msg.users as OnlineUser[]) ?? []);
          break;

        case 'room_created':
          setRoomId(msg.roomId as string);
          break;

        case 'room_joined':
          setRoomId(msg.roomId as string);
          setPeers((msg.peers as PeerInfo[]) ?? []);
          break;

        case 'peer_joined':
          setPeers(prev => {
            if (prev.some(p => p.oid === msg.peerOid)) return prev;
            return [...prev, { oid: msg.peerOid as string, displayName: msg.displayName as string }];
          });
          break;

        case 'peer_left':
          setPeers(prev => prev.filter(p => p.oid !== msg.peerOid));
          break;

        case 'call_invite':
          setIncomingCall({
            fromOid:     msg.fromOid as string,
            displayName: msg.displayName as string,
            roomId:      msg.roomId as string,
            token:       msg.token as string,
          });
          break;

        default:
          // Forward offer / answer / ice_candidate to registered handler
          handlersRef.current.get(type)?.(msg);
          break;
      }
    };
  }, [entraOid, displayName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!entraOid) return;
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [entraOid, connect]);

  // ── Public API ──────────────────────────────────────────────────────────────

  const createRoom = useCallback((): Promise<{ roomId: string; token: string }> => {
    return new Promise((resolve) => {
      const once: SignalingHandler = (msg) => {
        handlersRef.current.delete('room_created_cb');
        resolve({ roomId: msg.roomId as string, token: msg.token as string });
      };
      // Override for one-shot response
      const original = wsRef.current?.onmessage;
      if (wsRef.current) {
        const ws = wsRef.current;
        const wrapped = (ev: MessageEvent) => {
          let m: Record<string, unknown>;
          try { m = JSON.parse(ev.data as string); } catch { return; }
          if (m.type === 'room_created') {
            ws.onmessage = original ?? null;
            once(m);
          } else {
            (original as ((ev: MessageEvent) => void) | null)?.(ev);
          }
        };
        ws.onmessage = wrapped;
      }
      send({ type: 'create_room' });
    });
  }, [send]);

  const joinRoom = useCallback((roomIdOrToken: string) => {
    const isUuid = /^[0-9a-f-]{36}$/i.test(roomIdOrToken);
    // Heuristic: both roomId and token are UUIDs; the server differentiates by field name
    send({ type: 'join_room', roomId: isUuid ? roomIdOrToken : undefined, token: isUuid ? undefined : roomIdOrToken });
  }, [send]);

  const leaveRoom = useCallback(() => {
    send({ type: 'leave_room' });
    setRoomId(null);
    setPeers([]);
  }, [send]);

  const invitePeer = useCallback((targetOid: string, roomIdVal: string, token: string) => {
    send({ type: 'call_invite', targetOid, roomId: roomIdVal, token });
  }, [send]);

  const sendOffer = useCallback((targetOid: string, sdp: RTCSessionDescriptionInit) => {
    send({ type: 'offer', targetOid, sdp });
  }, [send]);

  const sendAnswer = useCallback((targetOid: string, sdp: RTCSessionDescriptionInit) => {
    send({ type: 'answer', targetOid, sdp });
  }, [send]);

  const sendIce = useCallback((targetOid: string, candidate: RTCIceCandidateInit) => {
    send({ type: 'ice_candidate', targetOid, candidate });
  }, [send]);

  /** Register a callback for a specific message type (offer / answer / ice_candidate). */
  const on = useCallback((type: string, handler: SignalingHandler) => {
    handlersRef.current.set(type, handler);
  }, []);

  const dismissIncomingCall = useCallback(() => setIncomingCall(null), []);

  return {
    isConnected,
    onlineUsers,
    roomId,
    peers,
    incomingCall,
    createRoom,
    joinRoom,
    leaveRoom,
    invitePeer,
    sendOffer,
    sendAnswer,
    sendIce,
    on,
    dismissIncomingCall,
  };
}
