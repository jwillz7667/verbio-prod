import { tool } from '@openai/agents';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import Logger from '../../utils/logger';

const logger = Logger;

interface BusinessData {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  return_policy?: string;
  cancellation_policy?: string;
  hours?: Record<string, { open?: string; close?: string; closed?: boolean }>;
  menu?: Array<{ name: string; category?: string; price?: number; description?: string }>;
  services?: Array<{ name: string; type?: string; price?: number }>;
  [key: string]: unknown;
}

interface BusinessResponse {
  name: string;
  data_json: BusinessData;
}

export class BusinessInfoTool {
  static getBusinessInfo = tool({
    name: 'get_business_info',
    description: 'Get general information about the business',
    parameters: z.object({
      infoType: z.enum(['general', 'contact', 'location', 'policies']).nullable().optional(),
    }),
    execute: async (input: { infoType?: string | null }, context: any): Promise<Record<string, unknown>> => {
      try {
        const businessId = context.businessId || context.metadata?.businessId;
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('name, data_json')
          .eq('id', businessId)
          .single();

        if (error) throw error;

        const businessData = (business as BusinessResponse | null)?.data_json || {};
        const info: Record<string, unknown> = {
          name: (business as BusinessResponse | null)?.name,
        };

        switch (input.infoType) {
          case 'contact':
            info.phone = businessData.phone || 'Not available';
            info.email = businessData.email || 'Not available';
            info.website = businessData.website || 'Not available';
            break;
          case 'location':
            info.address = businessData.address || 'Not available';
            info.city = businessData.city || 'Not available';
            info.state = businessData.state || 'Not available';
            info.zip = businessData.zip || 'Not available';
            break;
          case 'policies':
            info.returnPolicy = businessData.return_policy || 'Standard return policy';
            info.cancellationPolicy = businessData.cancellation_policy || 'Standard cancellation policy';
            break;
          default:
            Object.assign(info, businessData);
        }

        return {
          success: true,
          businessInfo: info,
        };
      } catch (error) {
        logger.error('Failed to get business info', { error });
        return {
          success: false,
          error: 'Failed to retrieve business information',
        };
      }
    },
  });

  static getBusinessHours = tool({
    name: 'get_business_hours',
    description: 'Get business operating hours',
    parameters: z.object({
      day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).nullable().optional(),
    }),
    execute: async (input: { day?: string | null }, context: any): Promise<Record<string, unknown>> => {
      try {
        const businessId = context.businessId || context.metadata?.businessId;
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', businessId)
          .single();

        if (error) throw error;

        const hours =
          ((business as BusinessResponse | null)?.data_json?.hours as Record<
            string,
            { open?: string; close?: string; closed?: boolean }
          >) || {};

        if (input.day) {
          const dayHours = hours[input.day];
          if (!dayHours) {
            return {
              success: true,
              day: input.day,
              status: 'closed',
              message: `We're closed on ${input.day}`,
            };
          }
          return {
            success: true,
            day: input.day,
            open: dayHours.open,
            close: dayHours.close,
            message: `Open ${dayHours.open} to ${dayHours.close}`,
          };
        }

        return {
          success: true,
          hours,
          message: 'Business hours retrieved',
        };
      } catch (error) {
        logger.error('Failed to get business hours', { error });
        return {
          success: false,
          error: 'Failed to retrieve business hours',
        };
      }
    },
  });

  static getMenu = tool({
    name: 'get_menu',
    description: 'Get restaurant menu or service list',
    parameters: z.object({
      category: z.string().nullable().optional().describe('Menu category'),
      itemName: z.string().nullable().optional().describe('Search for specific item'),
    }),
    execute: async (
      input: { category?: string | null; itemName?: string | null },
      context: any
    ): Promise<Record<string, unknown>> => {
      try {
        const businessId = context.businessId || context.metadata?.businessId;
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', businessId)
          .single();

        if (error) throw error;

        const menu =
          ((business as BusinessResponse | null)?.data_json?.menu as Array<{
            name: string;
            category?: string;
          }>) || [];

        let filteredMenu = menu;

        if (input.category) {
          filteredMenu = menu.filter((item) =>
            (item.category?.toLowerCase() ?? '').includes((input.category ?? '').toLowerCase())
          );
        }

        if (input.itemName) {
          filteredMenu = filteredMenu.filter((item) =>
            (item.name?.toLowerCase() ?? '').includes((input.itemName ?? '').toLowerCase())
          );
        }

        return {
          success: true,
          menu: filteredMenu,
          totalItems: filteredMenu.length,
          message:
            filteredMenu.length > 0 ? `Found ${filteredMenu.length} items` : 'No items found matching your criteria',
        };
      } catch (error) {
        logger.error('Failed to get menu', { error });
        return {
          success: false,
          error: 'Failed to retrieve menu',
        };
      }
    },
  });

  static getServices = tool({
    name: 'get_services',
    description: 'Get list of services offered by the business',
    parameters: z.object({
      serviceType: z.string().nullable().optional().describe('Type of service'),
    }),
    execute: async (input: { serviceType?: string | null }, context: any): Promise<Record<string, unknown>> => {
      try {
        const businessId = context.businessId || context.metadata?.businessId;
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', businessId)
          .single();

        if (error) throw error;

        const services =
          ((business as BusinessResponse | null)?.data_json?.services as Array<{
            type?: string;
          }>) || [];

        let filteredServices = services;

        if (input.serviceType) {
          filteredServices = services.filter(
            (service) => (service.type?.toLowerCase() ?? '') === (input.serviceType ?? '').toLowerCase()
          );
        }

        return {
          success: true,
          services: filteredServices,
          totalServices: filteredServices.length,
          message: `We offer ${filteredServices.length} services`,
        };
      } catch (error) {
        logger.error('Failed to get services', { error });
        return {
          success: false,
          error: 'Failed to retrieve services',
        };
      }
    },
  });
}
