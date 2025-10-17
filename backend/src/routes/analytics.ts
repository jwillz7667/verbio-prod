/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Router, Response } from 'express';
import { startOfDay, subDays, startOfMonth, endOfMonth, format } from 'date-fns';
import { supabaseAdmin } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

router.get(
  '/voice-agents',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const todayStart = startOfDay(now);

    try {
      const [totalAgentsResult, activeAgentsResult, totalCallsResult, todayCallsResult, callsData] = await Promise.all([
        supabaseAdmin.from('agents').select('id', { count: 'exact', head: true }).eq('business_id', businessId),

        supabaseAdmin
          .from('agents')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true),

        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', thirtyDaysAgo.toISOString()),

        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', todayStart.toISOString()),

        supabaseAdmin
          .from('call_logs')
          .select('status, duration')
          .eq('business_id', businessId)
          .gte('created_at', thirtyDaysAgo.toISOString()),
      ]);

      const successfulCalls = callsData.data?.filter((c) => c.status === 'completed').length || 0;
      const totalCalls = callsData.data?.length || 1;
      const successRate = Math.round((successfulCalls / totalCalls) * 100);

      const avgCallDuration = callsData.data?.length
        ? Math.round(callsData.data.reduce((sum, call) => sum + (call.duration || 0), 0) / callsData.data.length)
        : 0;

      res.json({
        success: true,
        data: {
          totalAgents: totalAgentsResult.count || 0,
          activeAgents: activeAgentsResult.count || 0,
          totalCalls: totalCallsResult.count || 0,
          todayCalls: todayCallsResult.count || 0,
          avgCallDuration,
          successRate,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch voice agent metrics', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch voice agent metrics' });
    }
  })
);

router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    try {
      const [
        totalCalls,
        todayCalls,
        monthCalls,
        totalOrders,
        todayOrders,
        monthRevenue,
        agents,
        recentCalls,
        activeSessions,
      ] = await Promise.all([
        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', thirtyDaysAgo.toISOString()),

        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', todayStart.toISOString()),

        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString()),

        supabaseAdmin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', thirtyDaysAgo.toISOString()),

        supabaseAdmin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', todayStart.toISOString()),

        supabaseAdmin
          .from('orders')
          .select('total')
          .eq('business_id', businessId)
          .eq('payment_status', 'paid')
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString()),

        supabaseAdmin
          .from('agents')
          .select('id, name, type, is_active')
          .eq('business_id', businessId)
          .eq('is_active', true),

        supabaseAdmin
          .from('call_logs')
          .select('id, status, duration')
          .eq('business_id', businessId)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(100),

        supabaseAdmin
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('status', 'in_progress'),
      ]);

      const successfulCalls = recentCalls.data?.filter((c) => c.status === 'completed').length || 0;
      const totalRecentCalls = recentCalls.data?.length || 1;
      const successRate = Math.round((successfulCalls / totalRecentCalls) * 100);

      const monthlyRevenue = monthRevenue.data?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;

      const avgCallDuration = recentCalls.data?.length
        ? Math.round(recentCalls.data.reduce((sum, call) => sum + (call.duration || 0), 0) / recentCalls.data.length)
        : 0;

      const creditsUsed = Math.round((totalCalls.count || 0) * 2.5);
      const creditsRemaining = 10000 - creditsUsed;

      res.json({
        success: true,
        metrics: {
          activeSessions: activeSessions.count || 0,
          creditsUsed,
          creditsRemaining,
          totalCalls: totalCalls.count || 0,
          todayCalls: todayCalls.count || 0,
          monthCalls: monthCalls.count || 0,
          successRate,
          revenue: monthlyRevenue,
          totalOrders: totalOrders.count || 0,
          todayOrders: todayOrders.count || 0,
          activeAgents: agents.data?.length || 0,
          avgCallDuration,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch dashboard metrics', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  })
);

router.get(
  '/trends',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;
    const { range = '7d' } = req.query;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    const now = new Date();
    let startDate: Date;
    let groupBy: string;

    switch (range) {
      case '24h':
        startDate = subDays(now, 1);
        groupBy = 'hour';
        break;
      case '7d':
        startDate = subDays(now, 7);
        groupBy = 'day';
        break;
      case '30d':
        startDate = subDays(now, 30);
        groupBy = 'day';
        break;
      case '90d':
        startDate = subDays(now, 90);
        groupBy = 'week';
        break;
      default:
        startDate = subDays(now, 7);
        groupBy = 'day';
    }

    try {
      const { data: calls } = await supabaseAdmin
        .from('call_logs')
        .select('created_at, status, call_type')
        .eq('business_id', businessId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('created_at, total')
        .eq('business_id', businessId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      const trendData: any[] = [];
      const current = new Date(startDate);

      while (current <= now) {
        const dateKey = format(current, groupBy === 'hour' ? 'MMM d HH:00' : 'MMM d');

        const dayStart = new Date(current);
        const dayEnd = new Date(current);

        if (groupBy === 'hour') {
          dayEnd.setHours(dayEnd.getHours() + 1);
        } else if (groupBy === 'day') {
          dayEnd.setDate(dayEnd.getDate() + 1);
        } else {
          dayEnd.setDate(dayEnd.getDate() + 7);
        }

        const dayCalls =
          calls?.filter((c) => {
            const callDate = new Date(c.created_at);
            return callDate >= dayStart && callDate < dayEnd;
          }) || [];

        const dayOrders =
          orders?.filter((o) => {
            const orderDate = new Date(o.created_at);
            return orderDate >= dayStart && orderDate < dayEnd;
          }) || [];

        trendData.push({
          date: dateKey,
          outbound: dayCalls.filter((c) => c.call_type === 'outbound').length,
          inbound: dayCalls.filter((c) => c.call_type === 'inbound').length,
          web: dayCalls.filter((c) => c.call_type === 'web').length,
          orders: dayOrders.length,
          revenue: dayOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        });

        if (groupBy === 'hour') {
          current.setHours(current.getHours() + 1);
        } else if (groupBy === 'day') {
          current.setDate(current.getDate() + 1);
        } else {
          current.setDate(current.getDate() + 7);
        }
      }

      res.json({
        success: true,
        trendData,
      });
    } catch (error) {
      logger.error('Failed to fetch trend data', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch trends' });
    }
  })
);

router.get(
  '/outcomes',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    const thirtyDaysAgo = subDays(new Date(), 30);

    try {
      const { data: calls } = await supabaseAdmin
        .from('call_logs')
        .select('status')
        .eq('business_id', businessId)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const total = calls?.length || 1;

      const outcomes = [
        {
          name: 'Answered',
          value: Math.round(((calls?.filter((c) => c.status === 'completed').length || 0) / total) * 100),
          color: '#8b5cf6',
        },
        {
          name: 'Missed',
          value: Math.round(((calls?.filter((c) => c.status === 'missed').length || 0) / total) * 100),
          color: '#3b82f6',
        },
        {
          name: 'Failed',
          value: Math.round(((calls?.filter((c) => c.status === 'failed').length || 0) / total) * 100),
          color: '#ef4444',
        },
        {
          name: 'Voicemail',
          value: Math.round(((calls?.filter((c) => c.status === 'voicemail').length || 0) / total) * 100),
          color: '#10b981',
        },
      ];

      res.json({
        success: true,
        outcomes,
      });
    } catch (error) {
      logger.error('Failed to fetch call outcomes', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch outcomes' });
    }
  })
);

router.get(
  '/activity',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    try {
      const [calls, orders, agents] = await Promise.all([
        supabaseAdmin
          .from('call_logs')
          .select('id, created_at, from_number, status, call_type')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(10),

        supabaseAdmin
          .from('orders')
          .select('id, created_at, total, status, customer_phone')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(10),

        supabaseAdmin
          .from('agents')
          .select('id, name, updated_at')
          .eq('business_id', businessId)
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

      const activities: any[] = [];

      calls.data?.forEach((call) => {
        activities.push({
          id: `call-${call.id}`,
          type: 'call',
          description: `${call.call_type === 'inbound' ? 'Inbound' : 'Outbound'} call ${call.status === 'completed' ? 'handled' : call.status} ${call.from_number ? `from ${call.from_number}` : ''}`,
          time: call.created_at,
          status: call.status === 'completed' ? 'success' : call.status === 'failed' ? 'error' : 'info',
        });
      });

      orders.data?.forEach((order) => {
        activities.push({
          id: `order-${order.id}`,
          type: 'order',
          description: `Order #${order.id.slice(0, 8)} for $${order.total} - ${order.status}`,
          time: order.created_at,
          status: order.status === 'completed' ? 'success' : 'info',
        });
      });

      agents.data?.forEach((agent) => {
        activities.push({
          id: `agent-${agent.id}`,
          type: 'agent',
          description: `Agent "${agent.name}" updated`,
          time: agent.updated_at,
          status: 'info',
        });
      });

      activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      const recentActivities = activities.slice(0, 15).map((activity) => {
        const timeAgo = getTimeAgo(new Date(activity.time));
        return {
          ...activity,
          time: timeAgo,
        };
      });

      res.json({
        success: true,
        activities: recentActivities,
      });
    } catch (error) {
      logger.error('Failed to fetch activities', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  })
);

router.get(
  '/performance',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;

    if (!businessId) {
      res.status(400).json({ error: 'Business ID required' });
      return;
    }

    try {
      const { data: agents } = await supabaseAdmin
        .from('agents')
        .select('id, name, type')
        .eq('business_id', businessId);

      const thirtyDaysAgo = subDays(new Date(), 30);

      const agentPerformance = await Promise.all(
        (agents || []).map(async (agent) => {
          const { data: calls } = await supabaseAdmin
            .from('call_logs')
            .select('status, duration')
            .eq('business_id', businessId)
            .eq('agent_id', agent.id)
            .gte('created_at', thirtyDaysAgo.toISOString());

          const totalCalls = calls?.length || 0;
          const successfulCalls = calls?.filter((c) => c.status === 'completed').length || 0;
          const avgDuration =
            totalCalls > 0 ? Math.round(calls!.reduce((sum, c) => sum + (c.duration || 0), 0) / totalCalls) : 0;

          return {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            totalCalls,
            successRate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0,
            avgDuration,
          };
        })
      );

      res.json({
        success: true,
        agentPerformance,
      });
    } catch (error) {
      logger.error('Failed to fetch agent performance', { error, businessId });
      res.status(500).json({ error: 'Failed to fetch performance data' });
    }
  })
);

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return format(date, 'MMM d, yyyy');
}

export default router;
