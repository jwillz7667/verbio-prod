import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';

const supabaseUrl = config.get('SUPABASE_URL');
const supabaseAnonKey = config.get('SUPABASE_ANON_KEY');
const supabaseServiceKey = config.get('SUPABASE_SERVICE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Public Supabase client for auth operations
 * Uses anon key with RLS policies enforced
 */
export const supabasePublic: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-application-name': 'verbio-backend',
      },
    },
  }
);

/**
 * Admin Supabase client for server-side operations
 * Uses service key to bypass RLS policies
 */
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-application-name': 'verbio-backend-admin',
      },
    },
  }
);

/**
 * Get a Supabase client with user's JWT token
 * Used for operations that should respect RLS policies
 */
export const getSupabaseClient = (jwtToken?: string): SupabaseClient => {
  if (!jwtToken) {
    return supabasePublic;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-application-name': 'verbio-backend-user',
      },
    },
  });
};

/**
 * Database types for TypeScript
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      businesses: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          data_json: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          data_json?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          data_json?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          type: 'service' | 'order' | 'payment';
          prompt: string;
          voice_config: Record<string, any>;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          type: 'service' | 'order' | 'payment';
          prompt: string;
          voice_config?: Record<string, any>;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          type?: 'service' | 'order' | 'payment';
          prompt?: string;
          voice_config?: Record<string, any>;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      phone_mappings: {
        Row: {
          id: string;
          business_id: string;
          twilio_number: string;
          agent_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          twilio_number: string;
          agent_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          twilio_number?: string;
          agent_id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          business_id: string;
          customer_phone: string;
          items: Record<string, any>;
          total: number;
          status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_status: 'pending' | 'paid' | 'refunded';
          call_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_phone: string;
          items: Record<string, any>;
          total: number;
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_status?: 'pending' | 'paid' | 'refunded';
          call_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_phone?: string;
          items?: Record<string, any>;
          total?: number;
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_status?: 'pending' | 'paid' | 'refunded';
          call_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          business_id: string;
          amount: number;
          stripe_charge_id: string | null;
          status: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          business_id: string;
          amount: number;
          stripe_charge_id?: string | null;
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          business_id?: string;
          amount?: number;
          stripe_charge_id?: string | null;
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      call_logs: {
        Row: {
          id: string;
          business_id: string;
          agent_id: string;
          call_sid: string;
          from_number: string;
          to_number: string;
          duration: number | null;
          status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
          recording_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          agent_id: string;
          call_sid: string;
          from_number: string;
          to_number: string;
          duration?: number | null;
          status?: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
          recording_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          agent_id?: string;
          call_sid?: string;
          from_number?: string;
          to_number?: string;
          duration?: number | null;
          status?: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
          recording_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      transcripts: {
        Row: {
          id: string;
          call_id: string;
          business_id: string;
          speaker: 'agent' | 'customer';
          text: string;
          timestamp: number;
          metadata: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_id: string;
          business_id: string;
          speaker: 'agent' | 'customer';
          text: string;
          timestamp: number;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_id?: string;
          business_id?: string;
          speaker?: 'agent' | 'customer';
          text?: string;
          timestamp?: number;
          metadata?: Record<string, any>;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      agent_type: 'service' | 'order' | 'payment';
      order_status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
      payment_status: 'pending' | 'paid' | 'refunded';
      payment_result_status: 'pending' | 'succeeded' | 'failed' | 'refunded';
      call_status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
      speaker_type: 'agent' | 'customer';
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export default {
  supabasePublic,
  supabaseAdmin,
  getSupabaseClient,
};