import { useState, useEffect } from 'react';
import api from '../services/api';

export type BackendStatus = 'connected' | 'disconnected' | 'checking';

interface BackendHealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [details, setDetails] = useState<BackendHealthResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkBackendHealth = async () => {
    setStatus('checking');
    try {
      // Use the root endpoint instead of /healthz since it's more reliable
      const response = await api.get('/');
      if (response.data.status === 'running') {
        setStatus('connected');
        setDetails({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: 0,
          environment: 'production',
          version: response.data.version || '1.0.0',
        });
        setLastChecked(new Date());
      } else {
        setStatus('disconnected');
      }
    } catch (error) {
      setStatus('disconnected');
      setDetails(null);
    }
  };

  useEffect(() => {
    // Initial check
    checkBackendHealth();

    // Set up polling every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000);

    // Also check on window focus
    const handleFocus = () => checkBackendHealth();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return {
    status,
    details,
    lastChecked,
    refresh: checkBackendHealth,
  };
}
