import { tool } from '@openai/agents';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import Logger from '../../utils/logger';

const logger = Logger;

export class BusinessInfoTool {
  static getBusinessInfo = tool({
    name: 'get_business_info',
    description: 'Get general information about the business',
    parameters: z.object({
      infoType: z.enum(['general', 'contact', 'location', 'policies']).optional(),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('name, data_json')
          .eq('id', context.businessId)
          .single();

        if (error) throw error;

        const businessData = business.data_json || {};
        const info: any = {
          name: business.name,
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
      day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).optional(),
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
      category: z.string().optional().describe('Menu category'),
      itemName: z.string().optional().describe('Search for specific item'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', context.businessId)
          .single();

        if (error) throw error;

        const menu = business.data_json?.menu || [];

        let filteredMenu = menu;

        if (input.category) {
          filteredMenu = menu.filter((item: any) => 
            item.category?.toLowerCase() === input.category?.toLowerCase()
          );
        }

        if (input.itemName) {
          filteredMenu = filteredMenu.filter((item: any) =>
            item.name?.toLowerCase().includes(input.itemName?.toLowerCase())
          );
        }

        return {
          success: true,
          menu: filteredMenu,
          totalItems: filteredMenu.length,
          message: filteredMenu.length > 0 
            ? `Found ${filteredMenu.length} items` 
            : 'No items found matching your criteria',
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
      serviceType: z.string().optional().describe('Type of service'),
    }),
    execute: async (input, context: any) => {
      try {
        const { data: business, error } = await supabaseAdmin
          .from('businesses')
          .select('data_json')
          .eq('id', context.businessId)
          .single();

        if (error) throw error;

        const services = business.data_json?.services || [];

        let filteredServices = services;

        if (input.serviceType) {
          filteredServices = services.filter((service: any) => 
            service.type?.toLowerCase() === input.serviceType?.toLowerCase()
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