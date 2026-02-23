import React, { useState } from 'react';
import { SUBSCRIPTION_PLANS } from '../lib/stripe';

interface OnboardingWizardProps {
  subscriptionTier?: string;    // 'FREE' | 'PRO' | 'ENTERPRISE'
  onComplete: () => void;
  onGoToBilling: () => void;
  onGoToSettings: () => void;
}

const TOTAL_STEPS = 3;

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  subscriptionTier,
  onComplete,
  onGoToBilling,
  onGoToSettings,
}) => {
  const [step, setStep] = useState(1);

  const tier = (subscriptionTier ?? 'FREE').toUpperCase() as 'FREE' | 'PRO' | 'ENTERPRISE';
  const isPaid = tier === 'PRO' || tier === 'ENTERPRISE';
  const plan = SUBSCRIPTION_PLANS[tier] ?? SUBSCRIPTION_PLANS.FREE;

  const tierColor: Record<string, string> = {
    FREE: '#888',
    PRO: '#00ffff',
    ENTERPRISE: '#a855f7',
  };
  const badgeColor = tierColor[tier] ?? '#888';

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const prev = () => setStep(s => Math.max(s - 1, 1));

  // ── Step content ──────────────────────────────────────────────────────────

  const Step1 = () => (
    <div>
      <div className="text-5xl mb-4 text-center">🛡️</div>
      <h2 className="text-xl font-bold text-center mb-1" style={{ color: '#00ffff' }}>
        Welcome to PrivaseeAI
      </h2>
      <p className="text-sm text-center mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Let's get you set up in three quick steps.
      </p>

      {/* Tier badge */}
      <div className="flex justify-center mb-5">
        <span
          className="px-4 py-1 rounded-full text-xs font-bold tracking-widest"
          style={{ background: badgeColor + '22', border: `1px solid ${badgeColor}`, color: badgeColor }}
        >
          {plan.name.toUpperCase()} PLAN
        </span>
      </div>

      {/* Feature list */}
      <ul className="space-y-2 mb-6">
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <span style={{ color: badgeColor }}>✓</span> {f}
          </li>
        ))}
      </ul>

      {!isPaid && (
        <button
          onClick={onGoToBilling}
          className="w-full py-2 rounded-lg text-sm font-semibold mb-3"
          style={{ background: 'rgba(0,255,255,0.12)', border: '1px solid rgba(0,255,255,0.4)', color: '#00ffff' }}
        >
          Upgrade to PRO — $9.99/mo →
        </button>
      )}
    </div>
  );

  const Step2 = () => (
    <div>
      <div className="text-5xl mb-4 text-center">📷</div>
      <h2 className="text-xl font-bold text-center mb-1" style={{ color: '#00ffff' }}>
        Connect Your Camera
      </h2>
      <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
        PrivaseeAI runs AI detection directly in your browser — no cloud processing required.
      </p>

      <ol className="space-y-3 mb-6">
        {[
          ['1', 'Click the', 'Live View', 'tab in the top navigation.'],
          ['2', 'Allow', 'camera permission', 'when your browser prompts.'],
          ['3', 'Detection starts', 'automatically', '— no configuration needed.'],
        ].map(([num, pre, highlight, post]) => (
          <li key={num} className="flex gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(0,255,255,0.15)', border: '1px solid rgba(0,255,255,0.3)', color: '#00ffff' }}
            >
              {num}
            </span>
            <span>
              {pre} <span className="font-semibold" style={{ color: '#00ffff' }}>{highlight}</span> {post}
            </span>
          </li>
        ))}
      </ol>

      <div
        className="rounded-lg p-3 text-xs text-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
      >
        Works with your laptop camera, external webcam, or RTSP IP camera
      </div>
    </div>
  );

  const Step3 = () => (
    <div>
      <div className="text-5xl mb-4 text-center">{isPaid ? '☁️' : '🔒'}</div>
      <h2 className="text-xl font-bold text-center mb-1" style={{ color: '#00ffff' }}>
        {isPaid ? 'Cloud Storage' : 'Unlock Cloud Storage'}
      </h2>
      <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {isPaid
          ? 'Connect your Azure Blob container to archive video clips and sync across devices.'
          : 'Upgrade to PRO to archive video clips to Azure Blob and sync across devices.'}
      </p>

      {isPaid ? (
        <>
          <ol className="space-y-3 mb-6">
            {[
              ['1', 'Go to', 'Settings → Cloud Sync', ''],
              ['2', 'Enter your Azure', 'Account Name & Container', ''],
              ['3', 'Paste your', 'SAS Token', 'and click Save.'],
            ].map(([num, pre, highlight, post]) => (
              <li key={num} className="flex gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'rgba(0,255,255,0.15)', border: '1px solid rgba(0,255,255,0.3)', color: '#00ffff' }}
                >
                  {num}
                </span>
                <span>
                  {pre} <span className="font-semibold" style={{ color: '#00ffff' }}>{highlight}</span> {post}
                </span>
              </li>
            ))}
          </ol>

          <button
            onClick={onGoToSettings}
            className="w-full py-2 rounded-lg text-sm font-semibold mb-3"
            style={{ background: 'rgba(0,255,255,0.12)', border: '1px solid rgba(0,255,255,0.4)', color: '#00ffff' }}
          >
            Open Settings →
          </button>
        </>
      ) : (
        <>
          <ul className="space-y-2 mb-6">
            {SUBSCRIPTION_PLANS.PRO.features.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ color: '#00ffff' }}>✓</span> {f}
              </li>
            ))}
          </ul>

          <button
            onClick={onGoToBilling}
            className="w-full py-2 rounded-lg text-sm font-semibold mb-3"
            style={{ background: 'rgba(0,255,255,0.12)', border: '1px solid rgba(0,255,255,0.4)', color: '#00ffff' }}
          >
            Upgrade to PRO — $9.99/mo →
          </button>
        </>
      )}
    </div>
  );

  const steps = [<Step1 key={1} />, <Step2 key={2} />, <Step3 key={3} />];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', zIndex: 60 }}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl p-7"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(0,255,255,0.4)',
          boxShadow: '0 0 40px rgba(0,255,255,0.15)',
        }}
      >
        {/* Skip */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 text-xs"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Skip
        </button>

        {/* Step content */}
        {steps[step - 1]}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={prev}
            disabled={step === 1}
            className="text-sm px-3 py-1 rounded"
            style={{
              color: step === 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
              cursor: step === 1 ? 'default' : 'pointer',
            }}
          >
            ← Back
          </button>

          {/* Step dots */}
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i + 1 === step ? 20 : 8,
                  height: 8,
                  background: i + 1 === step ? '#00ffff' : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>

          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              className="text-sm px-3 py-1 rounded font-semibold"
              style={{ color: '#00ffff' }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="text-sm px-4 py-1.5 rounded-lg font-semibold"
              style={{ background: '#00ffff', color: '#000' }}
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
