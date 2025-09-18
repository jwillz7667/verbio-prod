import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          business_id: string;
          customer_phone: string;
          items: any[];
          total: number;
          status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
          payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
          metadata?: any;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          order_id?: string;
          business_id: string;
          amount: number;
          currency: string;
          status: string;
          payment_method: string;
          stripe_payment_id?: string;
          payment_metadata?: any;
          created_at: string;
          updated_at: string;
        };
      };
      call_logs: {
        Row: {
          id: string;
          business_id: string;
          from_number: string;
          to_number?: string;
          agent_id?: string;
          direction: 'inbound' | 'outbound';
          status: string;
          duration?: number;
          recording_url?: string;
          transcript?: any;
          metadata?: any;
          started_at: string;
          ended_at?: string;
          created_at: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};