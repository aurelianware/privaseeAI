import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { type IncomingCall } from '../hooks/useSignaling';

interface CallIncomingModalProps {
  call: IncomingCall;
  onAccept: () => void;
  onDecline: () => void;
}

const TIMEOUT_SECONDS = 30;

const CallIncomingModal: React.FC<CallIncomingModalProps> = ({ call, onAccept, onDecline }) => {
  const [remaining, setRemaining] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { onDecline(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onDecline]);

  const initials = call.displayName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto rounded-2xl p-6 w-72 text-center shadow-2xl"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(0,255,255,0.4)',
          boxShadow: '0 0 40px rgba(0,255,255,0.15)',
        }}
      >
        {/* Avatar */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3"
          style={{ background: 'rgba(0,255,255,0.15)', color: '#00ffff' }}
        >
          {initials || '?'}
        </div>

        <p className="text-xs mb-1" style={{ color: 'rgba(0,255,255,0.5)' }}>Incoming call</p>
        <p className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>{call.displayName}</p>
        <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Auto-declines in {remaining}s
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onDecline}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all hover:scale-110"
            style={{ background: '#ff4444' }}
            aria-label="Decline"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={onAccept}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all hover:scale-110"
            style={{ background: '#00cc66' }}
            aria-label="Accept"
          >
            <Phone className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallIncomingModal;
