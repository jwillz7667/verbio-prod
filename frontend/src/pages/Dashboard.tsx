import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
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
import { useIsMobile } from '../hooks/useBreakpoint';

const Dashboard: React.FC = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const isMobile = useIsMobile();

  // Fetch metrics data
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const response = await api.getDashboardMetrics();
      return response.metrics || response;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch trend data
  const { data: trendsData } = useQuery({
    queryKey: ['analytics-trends', selectedTimeRange],
    queryFn: async () => {
      const response = await api.getAnalyticsTrends(selectedTimeRange);
      return response.trendData || response;
    },
  });

  // Fetch call outcomes
  const { data: outcomesData } = useQuery({
    queryKey: ['call-outcomes'],
    queryFn: async () => {
      const response = await api.getCallOutcomes();
      return response.outcomes || response;
    },
  });

  // Fetch recent activities
  const { data: activitiesData } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const response = await api.getRecentActivity();
      return response.activities || response;
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const setupSteps = [
    { id: 1, title: 'Connect your phone number', completed: true },
    { id: 2, title: 'Configure AI agents', completed: true },
    { id: 3, title: 'Set up webhooks', completed: metricsData?.activeAgents > 0 },
    { id: 4, title: 'Test voice calls', completed: metricsData?.totalCalls > 0 },
    { id: 5, title: 'Enable analytics', completed: true },
  ];

  const completedSteps = setupSteps.filter((step) => step.completed).length;
  const setupProgress = (completedSteps / setupSteps.length) * 100;

  const metrics = metricsData || {
    activeSessions: 0,
    creditsUsed: 0,
    creditsRemaining: 0,
    totalCalls: 0,
    todayCalls: 0,
    successRate: 0,
    revenue: 0,
    todayOrders: 0,
  };

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
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header - Mobile Responsive */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-xs sm:text-sm text-gray-500">Monitor your voice intelligence platform performance</p>
      </div>

      {/* Active Sessions Alert */}
      {metrics.activeSessions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs sm:text-sm font-medium text-green-900">
              {metrics.activeSessions} Active Voice Sessions
            </span>
          </div>
          <button className="text-xs sm:text-sm text-green-700 hover:text-green-800 font-medium self-start sm:self-auto">
            View Details →
          </button>
        </motion.div>
      )}

      {/* Metrics Grid - Mobile Responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
        <MetricCard
          title="Active Sessions"
          value={metrics.activeSessions}
          subtitle="Live now"
          icon={Phone}
          iconColor="text-green-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Credits Used"
          value={metrics.creditsUsed}
          subtitle="This month"
          change={{
            value: Math.round((metrics.creditsUsed / (metrics.creditsUsed + metrics.creditsRemaining)) * 100),
            type: metrics.creditsUsed > 0 ? 'increase' : 'neutral',
          }}
          icon={CreditCard}
          iconColor="text-blue-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Total Calls"
          value={metrics.totalCalls}
          subtitle="Last 30 days"
          change={{ value: metrics.todayCalls, type: metrics.todayCalls > 0 ? 'increase' : 'neutral' }}
          icon={PhoneCall}
          iconColor="text-purple-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate}%`}
          subtitle="Completion"
          change={{
            value: metrics.successRate > 90 ? 2 : -1,
            type: metrics.successRate > 90 ? 'increase' : 'decrease',
          }}
          icon={TrendingUp}
          iconColor="text-green-600"
          loading={metricsLoading}
        />
        <MetricCard
          title="Revenue"
          value={`$${metrics.revenue.toFixed(2)}`}
          subtitle="This month"
          change={{ value: metrics.todayOrders, type: metrics.todayOrders > 0 ? 'increase' : 'neutral' }}
          icon={DollarSign}
          iconColor="text-yellow-600"
          loading={metricsLoading}
        />
      </div>

      {/* Charts and Progress Section - Mobile Responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Voice Volume Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Voice Volume Trends</h2>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Chart wrapper with horizontal scroll on mobile */}
          <div className={isMobile ? 'overflow-x-auto -mx-2' : ''}>
            <div className={isMobile ? 'min-w-[400px] px-2' : ''}>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
                <LineChart data={trendsData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: isMobile ? '12px' : '14px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="outbound"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', r: isMobile ? 2 : 3 }}
                    activeDot={{ r: isMobile ? 3 : 5 }}
                    name="Outbound"
                  />
                  <Line
                    type="monotone"
                    dataKey="inbound"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: isMobile ? 2 : 3 }}
                    activeDot={{ r: isMobile ? 3 : 5 }}
                    name="Inbound"
                  />
                  <Line
                    type="monotone"
                    dataKey="web"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ fill: '#06b6d4', r: isMobile ? 2 : 3 }}
                    activeDot={{ r: isMobile ? 3 : 5 }}
                    name="Web"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Setup Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Setup Progress</h2>
            <span className="text-xl sm:text-2xl font-bold text-primary-600">{Math.round(setupProgress)}%</span>
          </div>

          <div className="mb-4 sm:mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${setupProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {setupSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2 sm:gap-3">
                {step.completed ? (
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-gray-300 rounded-full flex-shrink-0" />
                )}
                <span className={clsx('text-xs sm:text-sm', step.completed ? 'text-gray-700' : 'text-gray-400')}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 sm:mt-6 px-3 sm:px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-xs sm:text-sm font-medium">
            Complete Setup
          </button>
        </motion.div>
      </div>

      {/* Bottom Grid Section - Mobile Responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Call Outcomes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200"
        >
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Call Outcomes</h2>
          {outcomesData && outcomesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
              <PieChart>
                <Pie
                  data={outcomesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => (isMobile ? `${percent}%` : `${name} ${percent}%`)}
                  outerRadius={isMobile ? 60 : 80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {outcomesData.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <p className="text-sm">No data available</p>
            </div>
          )}

          {/* Legend for mobile */}
          {isMobile && outcomesData && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {outcomesData.map((entry: any, index: number) => (
                <div key={entry.name} className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full`}
                    style={{ backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 4] }}
                  />
                  <span className="text-gray-600">{entry.name}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recent Activity</h2>
            <button className="text-xs sm:text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all →
            </button>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {activitiesData && activitiesData.length > 0 ? (
              activitiesData.slice(0, 5).map((activity: any, index: number) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <motion.div
                    key={activity.id || index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="flex items-center gap-3"
                  >
                    <div className={`p-1.5 sm:p-2 rounded-lg ${getActivityColor(activity.status)}`}>
                      <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Activity className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs sm:text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
