import React from 'react';
import type { ConnectionStatus as Status } from '../../types';

interface ConnectionStatusProps {
  status: Status;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'disconnected':
        return 'bg-red-500';
      case 'error':
        return 'bg-red-700';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return '接続中';
      case 'connecting':
        return '接続中...';
      case 'disconnected':
        return '切断';
      case 'error':
        return 'エラー';
      default:
        return '不明';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-gray-800 rounded-lg px-4 py-2 shadow-lg">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
      <span className="text-sm font-medium text-white">
        {getStatusText()}
      </span>
    </div>
  );
};

export default ConnectionStatus;