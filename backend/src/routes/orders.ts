import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errorHandler';

const router = Router();

router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('User not authenticated', 401, 'AUTH_ERROR');
  }

  const { page = 1, limit = 20, status, payment_status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabaseAdmin
    .from('orders')
    .select(`
      *,
      businesses!inner(
        id,
        name,
        user_id
      ),
      payments(
        id,
        amount,
        status,
        payment_method,
        stripe_payment_intent_id,
        created_at
      )
    `)
    .eq('businesses.user_id', req.user.userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (payment_status) {
    query = query.eq('payment_status', payment_status);
  }

  const { data: orders, error, count } = await query;

  if (error) {
    logger.error('Failed to fetch orders', { error, userId: req.user.userId });
    throw new CustomError('Failed to fetch orders', 500, 'ORDERS_FETCH_ERROR');
  }

  const { count: totalCount } = await supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', req.user.businessId);

  logger.info('Orders fetched successfully', {
    userId: req.user.userId,
    count: orders?.length || 0,
    page,
    limit
  });

  res.json({
    success: true,
    orders: orders || [],
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: totalCount || 0,
      totalPages: Math.ceil((totalCount || 0) / Number(limit))
    }
  });
}));

router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('User not authenticated', 401, 'AUTH_ERROR');
  }

  const { id } = req.params;

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      businesses!inner(
        id,
        name,
        user_id
      ),
      payments(
        id,
        amount,
        status,
        payment_method,
        stripe_payment_intent_id,
        stripe_charge_id,
        error_message,
        created_at,
        updated_at
      )
    `)
    .eq('id', id)
    .eq('businesses.user_id', req.user.userId)
    .single();

  if (error || !order) {
    logger.warn('Order not found or access denied', { orderId: id, userId: req.user.userId });
    throw new CustomError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  logger.info('Order fetched successfully', { orderId: id, userId: req.user.userId });

  res.json({
    success: true,
    order
  });
}));

router.put('/:id/status', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('User not authenticated', 401, 'AUTH_ERROR');
  }

  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new CustomError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400, 'INVALID_STATUS');
  }

  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select(`
      businesses!inner(
        user_id
      )
    `)
    .eq('id', id)
    .eq('businesses.user_id', req.user.userId)
    .single();

  if (!existingOrder) {
    throw new CustomError('Order not found or access denied', 404, 'ORDER_NOT_FOUND');
  }

  const { data: updatedOrder, error } = await supabaseAdmin
    .from('orders')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update order status', { error, orderId: id });
    throw new CustomError('Failed to update order status', 500, 'ORDER_UPDATE_ERROR');
  }

  logger.info('Order status updated', { orderId: id, status, userId: req.user.userId });

  res.json({
    success: true,
    order: updatedOrder
  });
}));

export default router;