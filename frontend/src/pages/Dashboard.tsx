import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Phone,
  CreditCard,
  Activity,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Bot,
  PhoneCall,
  ChevronRight,
} from 'lucide-react';
import MetricCard from '../components/dashboard/MetricCard';
import clsx from 'clsx';

const Dashboard: React.FC = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');

  // Mock data for charts
  const volumeTrendData = [
    { date: 'Jan 1', outbound: 120, inbound: 80, web: 45 },
    { date: 'Jan 7', outbound: 145, inbound: 95, web: 52 },
    { date: 'Jan 14', outbound: 160, inbound: 110, web: 58 },
    { date: 'Jan 21', outbound: 135, inbound: 102, web: 48 },
    { date: 'Jan 28', outbound: 180, inbound: 125, web: 65 },
    { date: 'Feb 4', outbound: 195, inbound: 140, web: 72 },
    { date: 'Feb 11', outbound: 210, inbound: 155, web: 78 },
  ];

  const outcomeData = [
    { name: 'Answered', value: 68, color: '#8b5cf6' },
    { name: 'Missed', value: 15, color: '#3b82f6' },
    { name: 'Failed', value: 10, color: '#ef4444' },
    { name: 'Voicemail', value: 7, color: '#10b981' },
  ];

  const setupSteps = [
    { id: 1, title: 'Connect your phone number', completed: true },
    { id: 2, title: 'Configure AI agents', completed: true },
    { id: 3, title: 'Set up webhooks', completed: false },
    { id: 4, title: 'Test voice calls', completed: false },
    { id: 5, title: 'Enable analytics', completed: false },
  ];

  const recentActivities = [
    { id: 1, type: 'call', description: 'Inbound call handled by AI', time: '5 minutes ago', status: 'success' },
    { id: 2, type: 'order', description: 'New order #1234 received', time: '15 minutes ago', status: 'success' },
    { id: 3, type: 'credit', description: '1,000 credits purchased', time: '1 hour ago', status: 'info' },
    { id: 4, type: 'agent', description: 'AI agent "Support Bot" updated', time: '2 hours ago', status: 'info' },
    { id: 5, type: 'call', description: 'Call failed - no agent available', time: '3 hours ago', status: 'error' },
  ];

  const completedSteps = setupSteps.filter((step) => step.completed).length;
  const setupProgress = (completedSteps / setupSteps.length) * 100;

  // Fetch metrics data
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      // Mock API response
      return {
        activeSessions: 3,
        creditsUsed: 550,
        totalCalls: 150,
        successRate: 94,
        revenue: 2450,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call':
        return PhoneCall;
      case 'order':
        return DollarSign;
      case 'credit':
        return CreditCard;
      case 'agent':
        return Bot;
      default:
        return Activity;
    }
  };

  const getActivityColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'info':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor your voice intelligence platform performance</p>
      </div>

      {/* Active Sessions Alert */}
      {metrics?.activeSessions && metrics.activeSessions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-900">{metrics.activeSessions} Active Voice Sessions</span>
          </div>
          <button className="text-sm text-green-700 hover:text-green-800 font-medium">View Details →</button>
        </motion.div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Active Sessions"
          value={metrics?.activeSessions || 0}
          subtitle="Live now"
          icon={Phone}
          iconColor="text-green-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Credits Used"
          value={metrics?.creditsUsed || 0}
          subtitle="This month"
          change={{ value: 12, type: 'increase' }}
          icon={CreditCard}
          iconColor="text-blue-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Total Calls"
          value={metrics?.totalCalls || 0}
          subtitle="Last 30 days"
          change={{ value: 5, type: 'increase' }}
          icon={PhoneCall}
          iconColor="text-purple-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics?.successRate || 0}%`}
          subtitle="Completion rate"
          change={{ value: 2, type: 'increase' }}
          icon={TrendingUp}
          iconColor="text-green-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Revenue"
          value={`$${metrics?.revenue || 0}`}
          subtitle="This month"
          change={{ value: 18, type: 'increase' }}
          icon={DollarSign}
          iconColor="text-yellow-600"
          loading={metricsLoading}
        />
      </div>

      {/* Charts and Progress Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voice Volume Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white rounded-xl shadow-md p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Voice Volume Trends</h2>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={volumeTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" />
              <Line
                type="monotone"
                dataKey="outbound"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ fill: '#8b5cf6', r: 3 }}
                activeDot={{ r: 5 }}
                name="Outbound"
              />
              <Line
                type="monotone"
                dataKey="inbound"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5 }}
                name="Inbound"
              />
              <Line
                type="monotone"
                dataKey="web"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ fill: '#06b6d4', r: 3 }}
                activeDot={{ r: 5 }}
                name="Web"
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Setup Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-md p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Setup Progress</h2>
            <span className="text-2xl font-bold text-primary-600">{Math.round(setupProgress)}%</span>
          </div>

          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${setupProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {setupSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-3">
                {step.completed ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full flex-shrink-0" />
                )}
                <span className={clsx('text-sm', step.completed ? 'text-gray-700' : 'text-gray-400')}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>

          <button className="w-full mt-6 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium">
            Complete Setup →
          </button>
        </motion.div>
      </div>

      {/* Second Row: Pie Chart and Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voice Outcome Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-md p-6 border border-gray-200"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Call Outcomes</h2>

          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={outcomeData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {outcomeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-2">
            {outcomeData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-gray-600">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-white rounded-xl shadow-md p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activities</h2>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">View all →</button>
          </div>

          <div className="space-y-4">
            {recentActivities.map((activity) => {
              const Icon = getActivityIcon(activity.type);
              const colorClass = getActivityColor(activity.status);

              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div
                    className={clsx('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Credits Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-6 border border-primary-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <CreditCard className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">2,400 credits remaining</p>
              <p className="text-sm text-gray-600">Approximately 24 hours of voice calls</p>
            </div>
          </div>
          <button className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-lg hover:shadow-xl">
            Buy More Credits
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
