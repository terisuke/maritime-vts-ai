import React, { useCallback } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import websocketService from '../../services/websocketService';

const AudioRecorder: React.FC = () => {
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

  // 音声レベルインジケーターの色を決定
  const getAudioLevelColor = () => {
    if (audioLevel > 0.7) return 'bg-red-500';
    if (audioLevel > 0.4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // 音声レベルバーの数を計算
  const getAudioBars = () => {
    const barCount = 20;
    const activeBars = Math.ceil(audioLevel * barCount);
    return Array.from({ length: barCount }, (_, i) => i < activeBars);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={handleToggleRecording}
          className={`px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 flex items-center space-x-3 shadow-lg ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-4 h-4 bg-white rounded-full animate-pulse" />
              <span>録音停止</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              <span>録音開始</span>
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
          
          {/* プログレスバー式メーター */}
          <div className="mt-2 w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${getAudioLevelColor()}`}
              style={{ width: `${audioLevel * 100}%` }}
            />
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
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
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