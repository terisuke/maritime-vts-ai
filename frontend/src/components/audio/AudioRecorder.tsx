import React, { useCallback, useEffect } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import websocketService from '../../services/websocketService';

interface AudioRecorderProps {
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onChunksProcessedChange?: (chunks: number) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ 
  onRecordingChange, 
  onAudioLevelChange
}) => {
  const handleAudioData = useCallback((base64Data: string) => {
    websocketService.send({
      action: 'audioData',
      payload: { audio: base64Data },
      timestamp: new Date().toISOString()
    });
  }, []);

  const { 
    isRecording, 
    audioLevel, 
    startRecording, 
    stopRecording, 
    error 
  } = useAudioRecorder(handleAudioData);

  // Notify parent component of state changes
  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    onAudioLevelChange?.(audioLevel);
  }, [audioLevel, onAudioLevelChange]);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      websocketService.stopTranscription();
    } else {
      await startRecording();
      if (!error) {
        websocketService.startTranscription();
      }
    }
  }, [isRecording, startRecording, stopRecording, error]);


  // 音声レベルバーの数を計算
  const getAudioBars = () => {
    const barCount = 20;
    const activeBars = Math.ceil(audioLevel * barCount);
    return Array.from({ length: barCount }, (_, i) => i < activeBars);
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={handleToggleRecording}
          className={`px-6 py-3 rounded-full font-semibold text-base transition-all duration-300 flex items-center space-x-2 shadow-lg ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span>🔴 録音停止</span>
            </>
          ) : (
            <>
              <span>🎙️ 録音開始</span>
            </>
          )}
        </button>
      </div>
      
      {/* 音声レベルメーター */}
      {isRecording && (
        <div className="w-full max-w-md">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm text-gray-400">音声レベル:</span>
            <span className="text-xs text-gray-500">
              {Math.round(audioLevel * 100)}%
            </span>
          </div>
          
          {/* バー式メーター */}
          <div className="flex space-x-1 h-8">
            {getAudioBars().map((isActive, index) => (
              <div
                key={index}
                className={`flex-1 rounded transition-all duration-100 ${
                  isActive
                    ? index < 10 
                      ? 'bg-green-500' 
                      : index < 15 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                    : 'bg-gray-700'
                }`}
                style={{
                  height: isActive ? '100%' : '30%',
                  opacity: isActive ? 1 : 0.3
                }}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* ステータス表示 */}
      {isRecording && (
        <div className="flex items-center space-x-2 text-sm">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-gray-300">録音中...</span>
        </div>
      )}
      
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-900 bg-opacity-50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm">
          <span>⚠️ {error}</span>
        </div>
      )}
      
      {/* 使用方法のヒント */}
      {!isRecording && !error && (
        <div className="text-xs text-gray-500 text-center">
          <p>録音ボタンをクリックして音声入力を開始してください</p>
          <p>マイクへのアクセス許可が必要です</p>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
