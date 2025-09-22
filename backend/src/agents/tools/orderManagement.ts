import { tool } from '@openai/agents';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import Logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = Logger;

const OrderItemSchema = z.object({
  name: z.string().describe('Item name'),
  quantity: z.number().min(1).describe('Quantity ordered'),
  price: z.number().min(0).describe('Price per item'),
  notes: z.string().optional().describe('Special instructions'),
});

export class OrderManagementTool {
  static createOrder = tool({
    name: 'create_order',
    description: 'Create a new customer order with items and calculate total',
    parameters: z.object({
      items: z.array(OrderItemSchema).describe('List of items in the order'),
      customerName: z.string().optional().describe('Customer name'),
      customerPhone: z.string().optional().describe('Customer phone number'),
      deliveryAddress: z.string().optional().describe('Delivery address'),
      orderType: z.enum(['dine-in', 'takeout', 'delivery']).default('takeout'),
      scheduledTime: z.string().optional().describe('Scheduled pickup/delivery time'),
      notes: z.string().optional().describe('Order notes or special instructions'),
    }),
    execute: async (input, context: any) => {
      try {
        const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const orderData = {
          id: uuidv4(),
          business_id: context.businessId,
          customer_phone: input.customerPhone || context.customerId || 'walk-in',
          customer_name: input.customerName || 'Customer',
          items: input.items,
          total,
          status: 'pending',
          payment_status: 'pending',
          metadata: {
            source: 'agent_tool',
            order_type: input.orderType,
            delivery_address: input.deliveryAddress,
            scheduled_time: input.scheduledTime,
            notes: input.notes,
            session_id: context.sessionId,
          },
        };

        const { data: order, error } = await supabaseAdmin
          .from('orders')
          .insert(orderData)
          .select()
          .single();

        if (error) throw error;

        logger.info('Order created', {
          orderId: order.id,
          businessId: context.businessId,
          total,
        });

        return {
          success: true,
          orderId: order.id,
          total,
          estimatedTime: input.orderType === 'delivery' ? '45-60 minutes' : '15-20 minutes',
          message: `Order #${order.id.slice(-6)} created successfully. Total: $${total.toFixed(2)}`,
        };
      } catch (error) {
        logger.error('Failed to create order', { error, input });
        return {
          success: false,
          error: 'Failed to create order. Please try again.',
        };
      }
    },
  });

  static updateOrder = tool({
    name: 'update_order',
    description: 'Update an existing order (add/remove items, change details)',
    parameters: z.object({
      orderId: z.string().describe('Order ID to update'),
      items: z.array(OrderItemSchema).optional().describe('Updated items list'),
      status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']).optional(),
      notes: z.string().optional().describe('Additional notes'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: existingOrder, error: fetchError } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', input.orderId)
          .eq('business_id', context.businessId)
          .single();

        if (fetchError || !existingOrder) {
          return {
            success: false,
            error: 'Order not found',
          };
        }

        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        if (input.items) {
          const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          updateData.items = input.items;
          updateData.total = total;
        }

        if (input.status) {
          updateData.status = input.status;
        }

        if (input.notes) {
          updateData.metadata = {
            ...existingOrder.metadata,
            additional_notes: input.notes,
          };
        }

        const { data: updatedOrder, error: updateError } = await supabaseAdmin
          .from('orders')
          .update(updateData)
          .eq('id', input.orderId)
          .select()
          .single();

        if (updateError) throw updateError;

        logger.info('Order updated', {
          orderId: input.orderId,
          updates: Object.keys(updateData),
        });

        return {
          success: true,
          orderId: updatedOrder.id,
          status: updatedOrder.status,
          total: updatedOrder.total,
          message: `Order #${input.orderId.slice(-6)} updated successfully`,
        };
      } catch (error) {
        logger.error('Failed to update order', { error, input });
        return {
          success: false,
          error: 'Failed to update order',
        };
      }
    },
  });

  static cancelOrder = tool({
    name: 'cancel_order',
    description: 'Cancel an existing order',
    parameters: z.object({
      orderId: z.string().describe('Order ID to cancel'),
      reason: z.string().optional().describe('Cancellation reason'),
      refund: z.boolean().default(false).describe('Whether to process refund'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: order, error: fetchError } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', input.orderId)
          .eq('business_id', context.businessId)
          .single();

        if (fetchError || !order) {
          return {
            success: false,
            error: 'Order not found',
          };
        }

        if (order.status === 'delivered' || order.status === 'cancelled') {
          return {
            success: false,
            error: `Cannot cancel order with status: ${order.status}`,
          };
        }

        const { data: updatedOrder, error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            status: 'cancelled',
            metadata: {
              ...order.metadata,
              cancellation_reason: input.reason,
              cancelled_at: new Date().toISOString(),
              cancelled_by: 'agent',
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.orderId)
          .select()
          .single();

        if (updateError) throw updateError;

        logger.info('Order cancelled', {
          orderId: input.orderId,
          reason: input.reason,
          refund: input.refund,
        });

        return {
          success: true,
          orderId: updatedOrder.id,
          status: 'cancelled',
          refundInitiated: input.refund,
          message: `Order #${input.orderId.slice(-6)} has been cancelled`,
        };
      } catch (error) {
        logger.error('Failed to cancel order', { error, input });
        return {
          success: false,
          error: 'Failed to cancel order',
        };
      }
    },
  });

  static getOrderStatus = tool({
    name: 'get_order_status',
    description: 'Get the current status and details of an order',
    parameters: z.object({
      orderId: z.string().describe('Order ID to check'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: order, error } = await supabaseAdmin
          .from('orders')
          .select(`
            *,
            payments (
              id,
              amount,
              status,
              created_at
            )
          `)
          .eq('id', input.orderId)
          .eq('business_id', context.businessId)
          .single();

        if (error || !order) {
          return {
            success: false,
            error: 'Order not found',
          };
        }

        const estimatedTime = order.metadata?.scheduled_time ||
          (order.status === 'preparing' ? '10-15 minutes' :
           order.status === 'ready' ? 'Ready for pickup' :
           order.status === 'delivered' ? 'Delivered' :
           '20-30 minutes');

        logger.info('Order status retrieved', {
          orderId: input.orderId,
          status: order.status,
        });

        return {
          success: true,
          orderId: order.id,
          status: order.status,
          paymentStatus: order.payment_status,
          total: order.total,
          items: order.items,
          customerName: order.customer_name,
          orderType: order.metadata?.order_type || 'takeout',
          estimatedTime,
          createdAt: order.created_at,
          message: `Order #${input.orderId.slice(-6)} is ${order.status}`,
        };
      } catch (error) {
        logger.error('Failed to get order status', { error, input });
        return {
          success: false,
          error: 'Failed to retrieve order status',
        };
      }
    },
  });
}