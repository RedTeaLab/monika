/**
 * Connection Status Component for Socket.io.
 *
 * Displays the current WebSocket connection status with visual indicators.
 *
 * @example
 * ```tsx
 * <ConnectionStatus
 *   isConnected={isConnected}
 *   isConnecting={isConnecting}
 *   error={error}
 * />
 * ```
 */
import React from 'react';
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

export interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting?: boolean;
  error?: Error | null;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isConnecting = false,
  error = null,
  className = '',
}) => {
  if (isConnecting) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-sm text-destructive ${className}`}>
        <AlertCircle className="h-4 w-4" />
        <span>Connection Error</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={`flex items-center gap-2 text-sm text-green-600 ${className}`}>
        <Wifi className="h-4 w-4" />
        <span>Connected</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <WifiOff className="h-4 w-4" />
      <span>Disconnected</span>
    </div>
  );
};

/**
 * Compact dot indicator for connection status.
 */
export interface ConnectionDotProps {
  isConnected: boolean;
  isConnecting?: boolean;
  className?: string;
}

export const ConnectionDot: React.FC<ConnectionDotProps> = ({
  isConnected,
  isConnecting = false,
  className = '',
}) => {
  const statusColor = isConnecting
    ? 'bg-yellow-500 animate-pulse'
    : isConnected
    ? 'bg-green-500'
    : 'bg-red-500';

  return (
    <div
      className={`h-2 w-2 rounded-full ${statusColor} ${className}`}
      title={isConnected ? 'Connected' : 'Disconnected'}
    />
  );
};

export default ConnectionStatus;
