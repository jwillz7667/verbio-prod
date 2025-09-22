import { tool } from '@openai/agents';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import Logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = Logger;

export class SchedulingTool {
  static checkAvailability = tool({
    name: 'check_availability',
    description: 'Check if the business is available on a specific date and time',
    parameters: z.object({
      date: z.string().describe('Date to check (YYYY-MM-DD format)'),
      time: z.string().optional().describe('Time to check (HH:MM format)'),
      service: z.string().optional().describe('Service to check availability for'),
      duration: z.number().optional().describe('Duration in minutes'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', context.businessId)
          .single();

        if (error) throw error;

        const hours = business.data_json?.hours || {};
        const dayOfWeek = new Date(input.date)
          .toLocaleDateString('en-US', { weekday: 'short' })
          .toLowerCase()
          .slice(0, 3);
        const dayHours = hours[dayOfWeek];

        if (!dayHours) {
          return {
            success: true,
            available: false,
            message: `We're closed on ${dayOfWeek}`,
          };
        }

        if (input.time) {
          const requestedTime = parseInt(input.time.replace(':', ''));
          const openTime = parseInt(dayHours.open.replace(':', ''));
          const closeTime = parseInt(dayHours.close.replace(':', ''));

          const available = requestedTime >= openTime && requestedTime <= closeTime;

          if (input.duration) {
            const endTime = requestedTime + Math.floor(input.duration / 60) * 100 + (input.duration % 60);
            const fitsInSchedule = endTime <= closeTime;
            return {
              success: true,
              available: available && fitsInSchedule,
              message: available && fitsInSchedule
                ? `Available for ${input.duration} minutes starting at ${input.time}`
                : `Not enough time available. We close at ${dayHours.close}`,
              suggestedTime: !fitsInSchedule ? dayHours.open : null,
            };
          }

          return {
            success: true,
            available,
            message: available
              ? `Yes, we're available at ${input.time} on ${input.date}`
              : `We're open from ${dayHours.open} to ${dayHours.close}`,
            hours: dayHours,
          };
        }

        return {
          success: true,
          available: true,
          hours: dayHours,
          message: `We're open from ${dayHours.open} to ${dayHours.close} on ${input.date}`,
        };
      } catch (error) {
        logger.error('Failed to check availability', { error, input });
        return {
          success: false,
          error: 'Failed to check availability',
        };
      }
    },
  });

  static scheduleAppointment = tool({
    name: 'schedule_appointment',
    description: 'Schedule an appointment or reservation',
    parameters: z.object({
      date: z.string().describe('Appointment date (YYYY-MM-DD)'),
      time: z.string().describe('Appointment time (HH:MM)'),
      service: z.string().describe('Service or reason for appointment'),
      duration: z.number().default(30).describe('Duration in minutes'),
      customerName: z.string().describe('Customer name'),
      customerPhone: z.string().optional().describe('Customer phone'),
      customerEmail: z.string().optional().describe('Customer email'),
      notes: z.string().optional().describe('Additional notes'),
    }),
    execute: async (input, context: any) => {
      try {
        const appointmentData = {
          id: uuidv4(),
          business_id: context.businessId,
          customer_phone: input.customerPhone || context.customerId || 'unknown',
          customer_name: input.customerName,
          items: [{
            name: input.service,
            quantity: 1,
            price: 0,
            duration: input.duration,
          }],
          total: 0,
          status: 'confirmed',
          payment_status: 'not_required',
          metadata: {
            type: 'appointment',
            date: input.date,
            time: input.time,
            duration: input.duration,
            customer_email: input.customerEmail,
            source: 'agent_tool',
            session_id: context.sessionId,
            notes: input.notes,
          },
        };

        const { data: appointment, error } = await supabaseAdmin
          .from('orders')
          .insert(appointmentData)
          .select()
          .single();

        if (error) throw error;

        logger.info('Appointment scheduled', {
          appointmentId: appointment.id,
          date: input.date,
          time: input.time,
        });

        return {
          success: true,
          appointmentId: appointment.id,
          confirmationNumber: appointment.id.slice(-6).toUpperCase(),
          message: `Appointment confirmed for ${input.customerName} on ${input.date} at ${input.time}`,
          details: {
            date: input.date,
            time: input.time,
            service: input.service,
            duration: `${input.duration} minutes`,
          },
        };
      } catch (error) {
        logger.error('Failed to schedule appointment', { error, input });
        return {
          success: false,
          error: 'Failed to schedule appointment',
        };
      }
    },
  });

  static rescheduleAppointment = tool({
    name: 'reschedule_appointment',
    description: 'Reschedule an existing appointment',
    parameters: z.object({
      appointmentId: z.string().describe('Appointment ID to reschedule'),
      newDate: z.string().describe('New appointment date (YYYY-MM-DD)'),
      newTime: z.string().describe('New appointment time (HH:MM)'),
      reason: z.string().optional().describe('Reason for rescheduling'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: appointment, error: fetchError } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', input.appointmentId)
          .eq('business_id', context.businessId)
          .eq('metadata->type', 'appointment')
          .single();

        if (fetchError || !appointment) {
          return {
            success: false,
            error: 'Appointment not found',
          };
        }

        const updatedMetadata = {
          ...appointment.metadata,
          date: input.newDate,
          time: input.newTime,
          rescheduled: true,
          rescheduled_at: new Date().toISOString(),
          reschedule_reason: input.reason,
          original_date: appointment.metadata.date,
          original_time: appointment.metadata.time,
        };

        const { data: updated, error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.appointmentId)
          .select()
          .single();

        if (updateError) throw updateError;

        logger.info('Appointment rescheduled', {
          appointmentId: input.appointmentId,
          newDate: input.newDate,
          newTime: input.newTime,
        });

        return {
          success: true,
          appointmentId: updated.id,
          message: `Appointment rescheduled to ${input.newDate} at ${input.newTime}`,
          details: {
            previousDate: appointment.metadata.date,
            previousTime: appointment.metadata.time,
            newDate: input.newDate,
            newTime: input.newTime,
          },
        };
      } catch (error) {
        logger.error('Failed to reschedule appointment', { error, input });
        return {
          success: false,
          error: 'Failed to reschedule appointment',
        };
      }
    },
  });

  static cancelAppointment = tool({
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment',
    parameters: z.object({
      appointmentId: z.string().describe('Appointment ID to cancel'),
      reason: z.string().optional().describe('Cancellation reason'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: appointment, error: fetchError } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', input.appointmentId)
          .eq('business_id', context.businessId)
          .eq('metadata->type', 'appointment')
          .single();

        if (fetchError || !appointment) {
          return {
            success: false,
            error: 'Appointment not found',
          };
        }

        if (appointment.status === 'cancelled') {
          return {
            success: false,
            error: 'Appointment is already cancelled',
          };
        }

        const { data: updated, error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            status: 'cancelled',
            metadata: {
              ...appointment.metadata,
              cancelled: true,
              cancelled_at: new Date().toISOString(),
              cancellation_reason: input.reason,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.appointmentId)
          .select()
          .single();

        if (updateError) throw updateError;

        logger.info('Appointment cancelled', {
          appointmentId: input.appointmentId,
          reason: input.reason,
        });

        return {
          success: true,
          appointmentId: updated.id,
          message: 'Appointment cancelled successfully',
          refundPolicy: 'No charges for cancelled appointments',
        };
      } catch (error) {
        logger.error('Failed to cancel appointment', { error, input });
        return {
          success: false,
          error: 'Failed to cancel appointment',
        };
      }
    },
  });
}