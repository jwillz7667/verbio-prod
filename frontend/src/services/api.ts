import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import type { User, Business, Agent, Order, Payment, CallLog } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : `${window.location.protocol}//${window.location.host}`);

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BACKEND_URL,
      withCredentials: true,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('auth_token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const csrfToken = this.getCsrfToken();
        if (csrfToken && config.headers) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (!this.refreshPromise) {
            this.refreshPromise = this.refreshToken();
          }

          try {
            await this.refreshPromise;
            this.refreshPromise = null;
            return this.client(originalRequest);
          } catch (refreshError) {
            this.refreshPromise = null;
            this.handleAuthError();
            return Promise.reject(refreshError);
          }
        }

        if (error.response?.status === 403) {
          toast.error('You do not have permission to perform this action');
        } else if (error.response?.status === 404) {
          console.error('Resource not found:', error.config?.url);
        } else if (error.response?.status === 500) {
          toast.error('Server error. Please try again later.');
        } else if (error.code === 'ECONNABORTED') {
          toast.error('Request timeout. Please check your connection.');
        } else if (!error.response) {
          toast.error('Network error. Please check your connection.');
        }

        return Promise.reject(error);
      }
    );
  }

  private getCsrfToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf-token') {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  private async refreshToken(): Promise<void> {
    const response = await this.client.post('/api/auth/refresh');
    const { token } = response.data;
    if (token) {
      localStorage.setItem('auth_token', token);
    }
  }

  private handleAuthError(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');

    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
      toast.error('Session expired. Please login again.');
    }
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const response = await this.client.post('/api/auth/login', { email, password });
    const { token, user } = response.data;

    if (token) {
      localStorage.setItem('auth_token', token);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return response.data;
  }

  async register(email: string, password: string, businessName: string): Promise<{ user: User; token: string }> {
    const response = await this.client.post('/api/auth/register', {
      email,
      password,
      businessName,
    });

    const { token, user } = response.data;

    if (token) {
      localStorage.setItem('auth_token', token);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/api/auth/logout');
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }

  async getProfile(): Promise<{ user: User }> {
    const response = await this.client.get('/api/auth/profile');
    return response.data;
  }

  async updateProfile(data: Partial<User>): Promise<{ user: User }> {
    const response = await this.client.put('/api/auth/profile', data);
    return response.data;
  }

  async getBusiness(): Promise<{ business: Business }> {
    const response = await this.client.get('/api/business');
    return response.data;
  }

  async updateBusiness(data: Partial<Business>): Promise<{ business: Business }> {
    const response = await this.client.put('/api/business', data);
    return response.data;
  }

  async uploadBusinessData(data: Record<string, unknown>): Promise<{ success: boolean }> {
    const response = await this.client.post('/api/business/data', data);
    return response.data;
  }

  async mapPhoneNumber(phoneNumber: string): Promise<any> {
    const response = await this.client.post('/api/business/phone', { phoneNumber });
    return response.data;
  }

  async getAgents(): Promise<{ agents: Agent[] }> {
    const response = await this.client.get('/api/business/agents');
    return response.data;
  }

  async createAgent(data: Partial<Agent>): Promise<{ agent: Agent }> {
    const response = await this.client.post('/api/business/agents', data);
    return response.data;
  }

  async updateAgent(agentId: string, data: Partial<Agent>): Promise<{ agent: Agent }> {
    const response = await this.client.put(`/api/business/agents/${agentId}`, data);
    return response.data;
  }

  async deleteAgent(agentId: string): Promise<any> {
    const response = await this.client.delete(`/api/business/agents/${agentId}`);
    return response.data;
  }

  async getOrders(params?: Record<string, unknown>): Promise<{ orders: Order[] }> {
    const response = await this.client.get('/api/orders', { params });
    return response.data;
  }

  async getOrder(orderId: string): Promise<any> {
    const response = await this.client.get(`/api/orders/${orderId}`);
    return response.data;
  }

  async updateOrderStatus(orderId: string, status: string): Promise<{ order: Order }> {
    const response = await this.client.put(`/api/orders/${orderId}/status`, { status });
    return response.data;
  }

  async getCallLogs(params?: Record<string, unknown>): Promise<{ callLogs: CallLog[] }> {
    const response = await this.client.get('/api/business/calls', { params });
    return response.data;
  }

  async getCallTranscript(callId: string): Promise<any> {
    const response = await this.client.get(`/api/business/calls/${callId}/transcript`);
    return response.data;
  }

  async getAnalytics(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.client.get('/api/business/analytics', { params });
    return response.data;
  }

  async getDashboardMetrics(): Promise<any> {
    const response = await this.client.get('/api/analytics/dashboard');
    return response.data;
  }

  async getAnalyticsTrends(range?: string): Promise<any> {
    const response = await this.client.get('/api/analytics/trends', { params: { range } });
    return response.data;
  }

  async getCallOutcomes(): Promise<any> {
    const response = await this.client.get('/api/analytics/outcomes');
    return response.data;
  }

  async getRecentActivity(): Promise<any> {
    const response = await this.client.get('/api/analytics/activity');
    return response.data;
  }

  async getAgentPerformance(): Promise<any> {
    const response = await this.client.get('/api/analytics/performance');
    return response.data;
  }

  async getPayments(params?: Record<string, unknown>): Promise<{ payments: Payment[] }> {
    const response = await this.client.get('/api/business/payments', { params });
    return response.data;
  }

  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    const response = await this.client.post(`/api/stripe/refund/${paymentId}`, { amount });
    return response.data;
  }

  async testWebhook(event: string): Promise<any> {
    const response = await this.client.post('/api/twilio/test', { event });
    return response.data;
  }

  async getCsrfTokenFromServer(): Promise<string> {
    const response = await this.client.get('/api/csrf-token');
    return response.data.csrfToken;
  }

  async oauthCallback(accessToken: string, refreshToken: string, user: any): Promise<{ user: User; token: string }> {
    const response = await this.client.post('/api/auth/oauth/callback', {
      access_token: accessToken,
      refresh_token: refreshToken,
      user
    });

    const { token, user: userData } = response.data;

    if (token) {
      localStorage.setItem('auth_token', token);
    }
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }

    return response.data;
  }

  async linkOAuthAccount(provider: string, providerId: string, email: string, password: string): Promise<any> {
    const response = await this.client.post('/api/auth/oauth/link', {
      provider,
      providerId,
      email,
      password
    });
    return response.data;
  }

  async unlinkOAuthAccount(userId: string, provider: string): Promise<any> {
    const response = await this.client.post('/api/auth/oauth/unlink', {
      userId,
      provider
    });
    return response.data;
  }

  getAxiosInstance(): AxiosInstance {
    return this.client;
  }

  // Generic HTTP methods for custom endpoints
  async get(url: string, config?: any) {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: any) {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: any, config?: any) {
    return this.client.put(url, data, config);
  }

  async delete(url: string, config?: any) {
    return this.client.delete(url, config);
  }
}

export const api = new ApiClient();
export default api;