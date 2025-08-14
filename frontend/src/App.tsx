import React, { useState, useEffect } from 'react';
import ConnectionStatus from './components/common/ConnectionStatus';
import TranscriptionDisplay from './components/transcription/TranscriptionDisplay';
import AudioRecorder from './components/audio/AudioRecorder';
import AIResponsePanel from './components/ai/AIResponsePanel';
import websocketService from './services/websocketService';
import type { ConnectionStatus as Status, TranscriptionResult, AIResponse } from './types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

// デバッグパネルコンポーネント（Path A修正3）
interface DebugPanelProps {
  isRecording: boolean;
  audioLevel: number;
  websocketStatus: Status;
  transcripts: TranscriptionResult[];
  chunksProcessed?: number;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ 
  isRecording, 
  audioLevel, 
  websocketStatus, 
  transcripts,
  chunksProcessed = 0
}) => {
  const [currentTime, setCurrentTime] = useState(new Date().toISOString());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toISOString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const lastTranscript = transcripts[transcripts.length - 1];
  
  return (
    <div className="fixed bottom-0 right-0 bg-black bg-opacity-90 text-green-400 p-4 font-mono text-xs z-50 border border-green-600 rounded-tl-lg max-w-md">
      <div className="mb-2 text-green-300 font-bold">🔧 DEBUG PANEL (Path A)</div>
      <div>🎙️ Recording: <span className={isRecording ? 'text-red-400' : 'text-gray-400'}>{isRecording ? 'ON' : 'OFF'}</span></div>
      <div>📊 Audio Level: <span className="text-yellow-400">{(audioLevel * 100).toFixed(0)}%</span></div>
      <div>🔌 WebSocket: <span className={websocketStatus === 'connected' ? 'text-green-400' : 'text-red-400'}>{websocketStatus}</span></div>
      <div>📦 Chunks Processed: <span className="text-cyan-400">{chunksProcessed}</span></div>
      <div>📝 Last Transcript: <span className="text-white text-xs">{lastTranscript?.transcriptText || 'None'}</span></div>
      <div>⏰ Time: <span className="text-gray-400">{currentTime}</span></div>
      <div className="mt-2 text-yellow-500 text-xs">
        {isRecording && audioLevel === 0 && '⚠️ No audio input detected'}
        {isRecording && chunksProcessed === 0 && ' ⚠️ No chunks processed'}
      </div>
    </div>
  );
};

function App() {
  const [connectionStatus, setConnectionStatus] = useState<Status>('connecting');
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [chunksProcessed, setChunksProcessed] = useState(0);

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
    
    // Track chunks processed for debugging
    const unsubscribeChunks = websocketService.on('chunksProcessed', (chunks: number) => {
      setChunksProcessed(chunks);
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      unsubscribeTranscription();
      unsubscribeAiResponse();
      unsubscribeChunks();
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
          <AudioRecorder 
            onRecordingChange={setIsRecording}
            onAudioLevelChange={setAudioLevel}
            onChunksProcessedChange={setChunksProcessed}
          />
        </div>
      </main>
      
      <footer className="mt-8 bg-gray-900 border-t border-gray-800 p-4">
        <div className="container mx-auto text-center text-sm text-gray-500">
          © 2024 Maritime VTS AI System - Powered by AWS Transcribe & Amazon Bedrock
        </div>
      </footer>
      
      {/* デバッグパネル (Path A修正3) */}
      <DebugPanel
        isRecording={isRecording}
        audioLevel={audioLevel}
        websocketStatus={connectionStatus}
        transcripts={transcriptions}
        chunksProcessed={chunksProcessed}
      />
    </div>
  );
}

export default App;