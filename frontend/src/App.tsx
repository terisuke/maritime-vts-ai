import { useState, useEffect } from 'react';
import ConnectionStatus from './components/common/ConnectionStatus';
import TranscriptionDisplay from './components/transcription/TranscriptionDisplay';
import AudioRecorder from './components/audio/AudioRecorder';
import AIResponsePanel from './components/ai/AIResponsePanel';
import websocketService from './services/websocketService';
import type { ConnectionStatus as Status, TranscriptionResult, AIResponse } from './types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

function App() {
  const [connectionStatus, setConnectionStatus] = useState<Status>('connecting');
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);

  useEffect(() => {
    websocketService.connect(WS_URL);
    
    const unsubscribeConnected = websocketService.on('connected', () => {
      setConnectionStatus('connected');
    });
    
    const unsubscribeDisconnected = websocketService.on('disconnected', () => {
      setConnectionStatus('disconnected');
    });
    
    const unsubscribeError = websocketService.on('error', () => {
      setConnectionStatus('error');
    });
    
    const unsubscribeTranscription = websocketService.on('transcription', (data: TranscriptionResult) => {
      setTranscriptions(prev => [...prev, data]);
    });
    
    const unsubscribeAiResponse = websocketService.on('aiResponse', (data: AIResponse) => {
      setAiResponse(data);
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      unsubscribeTranscription();
      unsubscribeAiResponse();
      websocketService.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-vts-navy">
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 p-4 shadow-lg">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white flex items-center">
            <span className="mr-3 text-3xl">🚢</span>
            Maritime VTS AI Assistant
          </h1>
          <div className="text-sm text-blue-200">
            AI海上管制官サポートシステム
          </div>
        </div>
      </header>
      
      <ConnectionStatus status={connectionStatus} />
      
      <main className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TranscriptionDisplay transcriptions={transcriptions} />
          <AIResponsePanel response={aiResponse} />
        </div>
        
        <div className="mt-6 bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              音声入力コントロール
            </h3>
            <div className="text-xs text-gray-400">
              WebSocket: {connectionStatus === 'connected' ? '接続済み' : '未接続'}
            </div>
          </div>
          <AudioRecorder />
        </div>
      </main>
      
      <footer className="mt-8 bg-gray-900 border-t border-gray-800 p-4">
        <div className="container mx-auto text-center text-sm text-gray-500">
          © 2024 Maritime VTS AI System - Powered by AWS Transcribe & Amazon Bedrock
        </div>
      </footer>
    </div>
  );
}

export default App;