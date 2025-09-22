import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Zap,
  Check,
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TokenBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  totalBonus: number;
  lastRefillAt: string | null;
  lowBalanceAlert: boolean;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  tokensPerMonth: number;
  features: Record<string, any>;
}

interface CurrentSubscription {
  id: string;
  planId: string;
  plan: {
    name: string;
    displayName: string;
    tokensPerMonth: number;
    priceMonthly: number;
  };
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface TokenPackage {
  id: string;
  name: string;
  displayName: string;
  tokens: number;
  bonusTokens: number;
  totalTokens: number;
  price: number;
  pricePerToken: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

const Billing: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'subscription' | 'packages' | 'history'>('overview');
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [balanceRes, subRes, plansRes, packagesRes, transRes, usageRes] = await Promise.all([
        api.get('/api/billing/balance'),
        api.get('/api/billing/subscription'),
        api.get('/api/billing/plans'),
        api.get('/api/billing/packages'),
        api.get('/api/billing/transactions?limit=10'),
        api.get('/api/billing/usage'),
      ]);

      setBalance(balanceRes.data);
      setSubscription(subRes.data.subscription);
      setPlans(plansRes.data.plans);
      setPackages(packagesRes.data.packages);
      setTransactions(transRes.data.transactions);
      setUsageData(usageRes.data);
    } catch (error) {
      toast.error('Failed to load billing data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      const response = await api.post('/api/billing/subscribe', {
        planId,
        billingPeriod: selectedBillingPeriod,
      });

      if (response.data.success) {
        toast.success('Subscription updated successfully');
        fetchBillingData();
      }
    } catch (error) {
      toast.error('Failed to update subscription');
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) return;

    try {
      const response = await api.delete('/api/billing/subscription');
      if (response.data.success) {
        toast.success(response.data.message);
        fetchBillingData();
      }
    } catch (error) {
      toast.error('Failed to cancel subscription');
    }
  };

  const handlePurchasePackage = async (packageId: string) => {
    setPurchasingPackage(packageId);
    try {
      // This would integrate with Stripe payment modal
      toast('Opening payment form...');
      // Implement Stripe payment flow here
      setTimeout(() => {
        setPurchasingPackage(null);
        toast.success('Tokens purchased successfully!');
        fetchBillingData();
      }, 2000);
    } catch (error) {
      toast.error('Failed to purchase tokens');
      setPurchasingPackage(null);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const chartData = {
    labels: usageData?.dailyUsage?.map((d: any) => new Date(d.date).toLocaleDateString()) || [],
    datasets: [
      {
        label: 'Tokens Used',
        data: usageData?.dailyUsage?.map((d: any) => d.tokens) || [],
        fill: true,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Billing & Tokens</h1>
        <p className="text-gray-600">Manage your subscription and token balance</p>
      </div>

      {/* Token Balance Card */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Current Balance</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-bold text-gray-900">{balance?.balance.toFixed(0)}</h2>
              <span className="text-lg text-gray-600">tokens</span>
            </div>
            {balance?.lowBalanceAlert && (
              <div className="flex items-center gap-2 mt-2 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Low balance - consider purchasing more tokens</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedTab('packages')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Buy Tokens
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Total Purchased</p>
            <p className="text-xl font-semibold">{balance?.totalPurchased.toFixed(0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Total Consumed</p>
            <p className="text-xl font-semibold">{balance?.totalConsumed.toFixed(0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Bonus Tokens</p>
            <p className="text-xl font-semibold">{balance?.totalBonus.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-6">
          {(['overview', 'subscription', 'packages', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`pb-3 px-1 border-b-2 transition-colors ${
                selectedTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {/* Current Subscription */}
          {subscription && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Current Subscription</h3>
                {subscription.status === 'active' && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Active</span>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Plan</span>
                  <span className="font-medium">{subscription.plan.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Tokens</span>
                  <span className="font-medium">{subscription.plan.tokensPerMonth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Next Renewal</span>
                  <span className="font-medium">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
                {subscription.cancelAtPeriodEnd && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      Your subscription will end on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Usage Chart */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-4">Token Usage (Last 30 Days)</h3>
            <div className="h-64">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Usage by Service */}
          {usageData?.byServiceType && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-4">Usage by Service</h3>
              <div className="space-y-3">
                {Object.entries(usageData.byServiceType).map(([service, tokens]: [string, any]) => (
                  <div key={service} className="flex items-center justify-between">
                    <span className="text-gray-600 capitalize">{service.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{tokens.toFixed(0)} tokens</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'subscription' && (
        <div className="space-y-6">
          {/* Billing Period Toggle */}
          <div className="flex justify-center mb-6">
            <div className="bg-gray-100 rounded-lg p-1 inline-flex">
              <button
                onClick={() => setSelectedBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  selectedBillingPeriod === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setSelectedBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  selectedBillingPeriod === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Yearly (Save 20%)
              </button>
            </div>
          </div>

          {/* Subscription Plans */}
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrentPlan = subscription?.planId === plan.id;
              const price = selectedBillingPeriod === 'yearly' ? plan.priceYearly : plan.priceMonthly;

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border-2 p-6 ${
                    isCurrentPlan ? 'border-blue-500 shadow-lg' : 'border-gray-200'
                  }`}
                >
                  {isCurrentPlan && (
                    <div className="bg-blue-500 text-white text-sm px-3 py-1 rounded-full inline-block mb-4">
                      Current Plan
                    </div>
                  )}
                  <h3 className="text-xl font-bold mb-2">{plan.displayName}</h3>
                  <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold">${price}</span>
                    <span className="text-gray-600">/{selectedBillingPeriod === 'yearly' ? 'year' : 'month'}</span>
                  </div>
                  <div className="mb-6">
                    <p className="text-lg font-semibold text-blue-600">{plan.tokensPerMonth} tokens/month</p>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {Object.entries(plan.features).slice(0, 5).map(([key]) => (
                      <li key={key} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => !isCurrentPlan && handleSubscribe(plan.id)}
                    disabled={isCurrentPlan}
                    className={`w-full py-2 rounded-lg transition-colors ${
                      isCurrentPlan
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* Cancel Subscription */}
          {subscription && !subscription.cancelAtPeriodEnd && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-2">Cancel Subscription</h3>
              <p className="text-gray-600 mb-4">
                Cancel your subscription at any time. You'll continue to have access until the end of your current
                billing period.
              </p>
              <button
                onClick={handleCancelSubscription}
                className="px-4 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'packages' && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">One-Time Token Packages</h2>
            <p className="text-gray-600">Purchase additional tokens anytime</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {packages.map((pkg) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl border p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-bold mb-2">{pkg.displayName}</h3>
                <div className="mb-4">
                  <p className="text-2xl font-bold text-blue-600">{pkg.totalTokens}</p>
                  <p className="text-sm text-gray-600">tokens</p>
                  {pkg.bonusTokens > 0 && (
                    <p className="text-sm text-green-600 mt-1">+{pkg.bonusTokens} bonus tokens</p>
                  )}
                </div>
                <div className="mb-4">
                  <p className="text-2xl font-bold">${pkg.price}</p>
                  <p className="text-sm text-gray-600">${pkg.pricePerToken.toFixed(3)} per token</p>
                </div>
                <button
                  onClick={() => handlePurchasePackage(pkg.id)}
                  disabled={purchasingPackage === pkg.id}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {purchasingPackage === pkg.id ? 'Processing...' : 'Purchase'}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Transaction History</h3>
          </div>
          <div className="divide-y">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{tx.description}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(tx.createdAt).toLocaleDateString()} at{' '}
                      {new Date(tx.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(0)} tokens
                    </p>
                    <p className="text-sm text-gray-600">Balance: {tx.balanceAfter.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All Transactions →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;