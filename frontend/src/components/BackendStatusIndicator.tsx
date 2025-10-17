import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { motion } from 'framer-motion';

export default function BackendStatusIndicator() {
  const { status, details, lastChecked, refresh } = useBackendStatus();

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-400 bg-green-400/10';
      case 'disconnected':
        return 'text-red-400 bg-red-400/10';
      case 'checking':
        return 'text-yellow-400 bg-yellow-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4" />;
      case 'checking':
        return (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <RefreshCw className="w-4 h-4" />
          </motion.div>
        );
      default:
        return <Wifi className="w-4 h-4" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Backend Connected';
      case 'disconnected':
        return 'Backend Disconnected';
      case 'checking':
        return 'Checking Connection...';
      default:
        return 'Unknown Status';
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="relative group">
      <button
        onClick={refresh}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-all ${getStatusColor()}`}
        disabled={status === 'checking'}
      >
        {getStatusIcon()}
        <span className="text-xs font-medium">{getStatusText()}</span>
      </button>

      {/* Tooltip with details */}
      {details && status === 'connected' && (
        <div className="absolute right-0 mt-2 w-64 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3">
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Version:</span>
                <span className="text-gray-200">{details.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Environment:</span>
                <span className="text-gray-200">{details.environment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Uptime:</span>
                <span className="text-gray-200">{formatUptime(details.uptime)}</span>
              </div>
              {lastChecked && (
                <div className="flex justify-between pt-1 border-t border-gray-700">
                  <span className="text-gray-400">Last checked:</span>
                  <span className="text-gray-200">{lastChecked.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Disconnected tooltip */}
      {status === 'disconnected' && (
        <div className="absolute right-0 mt-2 w-64 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg shadow-xl p-3">
            <div className="text-xs space-y-1">
              <p className="text-red-400">Unable to connect to backend service.</p>
              <p className="text-gray-300">Click to retry connection.</p>
              {lastChecked && (
                <p className="text-gray-400 pt-1 border-t border-red-500/20">
                  Last attempt: {lastChecked.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
