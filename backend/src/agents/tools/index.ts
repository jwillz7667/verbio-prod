import { OrderManagementTool } from './orderManagement';
import { PaymentProcessingTool } from './paymentProcessing';
import { BusinessInfoTool } from './businessInfo';
import { SchedulingTool } from './scheduling';
import { CustomerDataTool } from './customerData';
import { TokenUsageTool } from './tokenUsage';
import { CommunicationTool } from './communication';
import { InventoryTool } from './inventory';

export * from './orderManagement';
export * from './paymentProcessing';
export * from './businessInfo';
export * from './scheduling';
export * from './customerData';
export * from './tokenUsage';
export * from './communication';
export * from './inventory';

// Tool registry for easy access
export const AGENT_TOOLS = {
  // Order Management
  createOrder: OrderManagementTool.createOrder,
  updateOrder: OrderManagementTool.updateOrder,
  cancelOrder: OrderManagementTool.cancelOrder,
  getOrderStatus: OrderManagementTool.getOrderStatus,

  // Payment Processing
  processPayment: PaymentProcessingTool.processPayment,
  refundPayment: PaymentProcessingTool.refundPayment,
  getPaymentStatus: PaymentProcessingTool.getPaymentStatus,

  // Business Information
  getBusinessInfo: BusinessInfoTool.getBusinessInfo,
  getBusinessHours: BusinessInfoTool.getBusinessHours,
  getMenu: BusinessInfoTool.getMenu,
  getServices: BusinessInfoTool.getServices,

  // Scheduling
  checkAvailability: SchedulingTool.checkAvailability,
  scheduleAppointment: SchedulingTool.scheduleAppointment,
  rescheduleAppointment: SchedulingTool.rescheduleAppointment,
  cancelAppointment: SchedulingTool.cancelAppointment,

  // Customer Data
  getCustomerProfile: CustomerDataTool.getCustomerProfile,
  getCustomerOrders: CustomerDataTool.getCustomerOrders,
  getCustomerAppointments: CustomerDataTool.getCustomerAppointments,
  updateCustomerInfo: CustomerDataTool.updateCustomerInfo,

  // Token Usage
  trackTokenUsage: TokenUsageTool.trackTokenUsage,
  getTokenBalance: TokenUsageTool.getTokenBalance,
  checkTokenLimit: TokenUsageTool.checkTokenLimit,

  // Communication
  sendSMS: CommunicationTool.sendSMS,
  sendEmail: CommunicationTool.sendEmail,
  scheduleFollowUp: CommunicationTool.scheduleFollowUp,

  // Inventory
  checkInventory: InventoryTool.checkInventory,
  updateInventory: InventoryTool.updateInventory,
  reserveItem: InventoryTool.reserveItem,
};

// Tool categories for organization
export const TOOL_CATEGORIES = {
  order: ['createOrder', 'updateOrder', 'cancelOrder', 'getOrderStatus'],
  payment: ['processPayment', 'refundPayment', 'getPaymentStatus'],
  business: ['getBusinessInfo', 'getBusinessHours', 'getMenu', 'getServices'],
  scheduling: ['checkAvailability', 'scheduleAppointment', 'rescheduleAppointment', 'cancelAppointment'],
  customer: ['getCustomerProfile', 'getCustomerOrders', 'getCustomerAppointments', 'updateCustomerInfo'],
  billing: ['trackTokenUsage', 'getTokenBalance', 'checkTokenLimit'],
  communication: ['sendSMS', 'sendEmail', 'scheduleFollowUp'],
  inventory: ['checkInventory', 'updateInventory', 'reserveItem'],
};

// Helper function to get tools by category
export function getToolsByCategory(category: keyof typeof TOOL_CATEGORIES): any[] {
  const toolNames = TOOL_CATEGORIES[category];
  return toolNames.map((name) => AGENT_TOOLS[name as keyof typeof AGENT_TOOLS]).filter(Boolean);
}

// Helper function to get tools for a specific agent type
export function getToolsForAgentType(agentType: 'service' | 'order' | 'payment' | 'scheduling'): any[] {
  switch (agentType) {
    case 'service':
      return [
        ...getToolsByCategory('business'),
        ...getToolsByCategory('customer'),
        ...getToolsByCategory('communication'),
        AGENT_TOOLS.checkAvailability,
      ];
    case 'order':
      return [
        ...getToolsByCategory('order'),
        ...getToolsByCategory('inventory'),
        AGENT_TOOLS.getBusinessInfo,
        AGENT_TOOLS.getMenu,
        AGENT_TOOLS.checkInventory,
      ];
    case 'payment':
      return [...getToolsByCategory('payment'), AGENT_TOOLS.getOrderStatus, AGENT_TOOLS.getCustomerProfile];
    case 'scheduling':
      return [
        ...getToolsByCategory('scheduling'),
        AGENT_TOOLS.getBusinessHours,
        AGENT_TOOLS.sendSMS,
        AGENT_TOOLS.sendEmail,
      ];
    default:
      return [];
  }
}
