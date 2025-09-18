// Core Business Types
export interface Business {
  id: string;
  name: string;
  phone_number?: string;
  data_json?: BusinessData;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessData {
  menu?: MenuItem[];
  hours?: BusinessHours;
  pricing?: Record<string, number>;
  services?: string[];
  [key: string]: unknown;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  available?: boolean;
}

export interface BusinessHours {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

// Agent Types
export type AgentType = 'service' | 'order' | 'payment';

export interface Agent {
  id: string;
  business_id?: string;
  name: string;
  type: AgentType;
  prompt: string;
  voice_config: VoiceConfig;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VoiceConfig {
  voice: string;
  temperature?: number;
  eagerness?: string;
  noise_reduction?: string;
}

// Order Types
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface Order {
  id: string;
  business_id: string;
  customer_phone: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  call_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

// Payment Types
export interface Payment {
  id: string;
  order_id: string;
  business_id: string;
  amount: number;
  stripe_charge_id?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

// Call Log Types
export type CallStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';

export interface CallLog {
  id: string;
  business_id: string;
  agent_id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  duration?: number;
  status: CallStatus;
  recording_url?: string;
  created_at: string;
  updated_at?: string;
}

// Transcript Types
export interface Transcript {
  id: string;
  call_id: string;
  business_id: string;
  speaker: 'agent' | 'customer';
  text: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// User & Auth Types
export interface User {
  id: string;
  email: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  email: string;
  password: string;
  businessName: string;
}

export interface AgentFormData {
  name: string;
  type: AgentType;
  prompt: string;
  voice: string;
  is_active?: boolean;
}

// Error Types
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

// WebSocket Types
export interface WebSocketMessage {
  event: string;
  data?: unknown;
  streamSid?: string;
}

// Dashboard Stats
export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  activeCalls: number;
  completedCalls: number;
  averageCallDuration: number;
}