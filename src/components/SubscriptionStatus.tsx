import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMsal } from '@azure/msal-react';
import { Crown, Zap, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from '../lib/stripe';

interface UserSubscription {
  tier: SubscriptionPlan;
  status: string;
  currentPeriodEnd?: string;
}

export const SubscriptionStatus = () => {
  const { user, isAuthenticated } = useAuth();
  const { accounts } = useMsal();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeader = (): Record<string, string> => {
    const token = (accounts[0] as any)?.idToken ?? null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchSubscriptionStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/stripe/subscription-status', {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-gray-700 rounded w-3/4"></div>
      </div>
    );
  }

  if (!subscription) {
    return null;
  }

  const plan = SUBSCRIPTION_PLANS[subscription.tier];
  
  const getPlanIcon = (tier: SubscriptionPlan) => {
    switch (tier) {
      case 'FREE': return <Shield className="h-5 w-5 text-blue-400" />;
      case 'PRO': return <Zap className="h-5 w-5 text-purple-400" />;
      case 'ENTERPRISE': return <Crown className="h-5 w-5 text-yellow-400" />;
      default: return <Shield className="h-5 w-5 text-blue-400" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'past_due': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'canceled': return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default: return <CheckCircle className="h-4 w-4 text-green-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'past_due': return 'text-yellow-400';
      case 'canceled': return 'text-red-400';
      default: return 'text-green-400';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getPlanIcon(subscription.tier)}
          <h3 className="text-lg font-semibold text-white">{plan.name} Plan</h3>
        </div>
        <div className="flex items-center space-x-1">
          {getStatusIcon(subscription.status)}
          <span className={`text-sm font-medium ${getStatusColor(subscription.status)}`}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="text-sm text-gray-300 mb-3">
        <div className="flex justify-between">
          <span>Monthly Cost:</span>
          <span className="font-medium">${plan.price}</span>
        </div>
        <div className="flex justify-between">
          <span>Device Limit:</span>
          <span className="font-medium">
            {plan.limits.devices === Infinity ? 'Unlimited' : plan.limits.devices}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Storage:</span>
          <span className="font-medium">{plan.limits.storage}</span>
        </div>
      </div>

      {subscription.currentPeriodEnd && (
        <div className="text-xs text-gray-400 mb-3">
          {subscription.status === 'active' ? 'Renews on' : 'Expires on'}{' '}
          {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </div>
      )}

      <div className="space-y-2">
        {subscription.tier !== 'ENTERPRISE' && (
          <button
            onClick={() => window.location.href = '/pricing'}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200"
          >
            Upgrade Plan
          </button>
        )}
        
        {subscription.tier !== 'FREE' && (
          <button
            onClick={() => window.location.href = '/api/stripe/customer-portal'}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200"
          >
            Manage Billing
          </button>
        )}
      </div>
    </div>
  );
};

export default SubscriptionStatus;