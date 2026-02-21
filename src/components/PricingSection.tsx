import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMsal } from '@azure/msal-react';
import { Check, Zap, Shield, Users, Cloud, Star } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../lib/stripe';

interface PricingCardProps {
  plan: typeof SUBSCRIPTION_PLANS[keyof typeof SUBSCRIPTION_PLANS];
  planKey: string;
  isPopular?: boolean;
  onSelectPlan: (planKey: string) => void;
  isLoading?: boolean;
}

const PricingCard = ({ 
  plan, 
  planKey, 
  isPopular, 
  onSelectPlan, 
  isLoading 
}: PricingCardProps) => {
  const getPlanIcon = (planName: string) => {
    switch (planName) {
      case 'Free': return <Shield className="h-8 w-8 text-blue-400" />;
      case 'Pro': return <Zap className="h-8 w-8 text-purple-400" />;
      case 'Enterprise': return <Users className="h-8 w-8 text-gold-400" />;
      default: return <Shield className="h-8 w-8 text-blue-400" />;
    }
  };

  return (
    <div className={`relative bg-gray-800 rounded-xl p-6 ${
      isPopular ? 'ring-2 ring-purple-500 ring-opacity-50' : 'border border-gray-700'
    } transition-all duration-300 hover:bg-gray-750`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1 rounded-full text-sm font-medium flex items-center">
            <Star className="h-4 w-4 mr-1" />
            Most Popular
          </span>
        </div>
      )}
      
      <div className="text-center">
        <div className="flex justify-center mb-4">
          {getPlanIcon(plan.name)}
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
        
        <div className="mb-6">
          <span className="text-4xl font-bold text-white">${plan.price}</span>
          {plan.price > 0 && <span className="text-gray-400">/month</span>}
        </div>
        
        <button
          onClick={() => onSelectPlan(planKey)}
          disabled={isLoading}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
            isPopular
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
              : plan.name === 'Free'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isLoading ? 'Processing...' : 
           plan.name === 'Free' ? 'Get Started' : `Choose ${plan.name}`}
        </button>
      </div>
      
      <div className="mt-8">
        <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
          Features Included
        </h4>
        <ul className="space-y-3">
          {plan.features.map((feature: string, index: number) => (
            <li key={index} className="flex items-start">
              <Check className="h-5 w-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
              <span className="text-gray-300 text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      
      {plan.name !== 'Free' && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <div className="flex items-center text-sm text-gray-400">
            <Cloud className="h-4 w-4 mr-2" />
            <span>Cloud sync & backup included</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const PricingSection = () => {
  const { isAuthenticated } = useAuth();
  const { accounts } = useMsal();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const getAuthHeader = (): Record<string, string> => {
    const token = (accounts[0] as any)?.idToken ?? null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleSelectPlan = async (planKey: string) => {
    if (!isAuthenticated) {
      window.location.href = '/';
      return;
    }

    setIsLoading(true);
    setSelectedPlan(planKey);

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ planType: planKey }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          alert('Free plan activated successfully!');
          window.location.reload();
        }
      } else {
        throw new Error(data.message || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to process subscription. Please try again.');
    } finally {
      setIsLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Choose Your Security Plan
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Protect your home and business with AI-powered security monitoring. 
            Choose the plan that fits your needs and scale as you grow.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
            <PricingCard
              key={key}
              plan={plan}
              planKey={key}
              isPopular={key === 'PRO'}
              onSelectPlan={handleSelectPlan}
              isLoading={isLoading && selectedPlan === key}
            />
          ))}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-bold text-white mb-8">
            Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I change plans later?
              </h3>
              <p className="text-gray-300">
                Yes! You can upgrade or downgrade your plan at any time. 
                Changes take effect immediately.
              </p>
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-white mb-2">
                What happens to my data?
              </h3>
              <p className="text-gray-300">
                Your security events and recordings are always yours. 
                We provide secure cloud backup for paid plans.
              </p>
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-white mb-2">
                Do you offer refunds?
              </h3>
              <p className="text-gray-300">
                We offer a 30-day money-back guarantee for all paid plans. 
                No questions asked.
              </p>
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-white mb-2">
                Is my payment secure?
              </h3>
              <p className="text-gray-300">
                Absolutely. We use Stripe for payment processing, 
                ensuring bank-level security for all transactions.
              </p>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 text-sm mb-4">Trusted by security professionals worldwide</p>
          <div className="flex justify-center items-center space-x-8 opacity-60">
            <div className="text-gray-500">🔒 SSL Encrypted</div>
            <div className="text-gray-500">💳 Stripe Secured</div>
            <div className="text-gray-500">🛡️ SOC 2 Compliant</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingSection;