import React, { useCallback, useEffect, useState } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import websocketService from '../../services/websocketService';

interface AudioRecorderProps {
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onChunksProcessedChange?: (chunks: number) => void;
  mode?: 'ptt' | 'toggle'; // 新規追加
  onModeChange?: (mode: 'ptt' | 'toggle') => void; // 新規追加
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ 
  onRecordingChange, 
  onAudioLevelChange,
  mode: propMode,
  onModeChange
}) => {
  // デフォルトモードの設定（PTTをデフォルトに）
  const [mode, setMode] = useState<'ptt' | 'toggle'>(propMode || 'ptt');
  
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

  useEffect(() => {
    if (propMode && propMode !== mode) {
      setMode(propMode);
    }
  }, [propMode]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // トグルモード用のハンドラー
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

  // PTTイベントハンドラー
  const handlePTTStart = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isRecording && !error) {
      await startRecording();
      websocketService.startTranscription();
    }
  }, [isRecording, error, startRecording]);

  const handlePTTEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isRecording) {
      stopRecording();
      websocketService.stopTranscription();
    }
  }, [isRecording, stopRecording]);

  // スペースキーでPTT操作
  useEffect(() => {
    if (mode !== 'ptt') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // テキスト入力中は無効
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === 'Space' && !isRecording) {
        e.preventDefault();
        startRecording().then(() => {
          websocketService.startTranscription();
        });
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isRecording) {
        e.preventDefault();
        stopRecording();
        websocketService.stopTranscription();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode, isRecording, startRecording, stopRecording]);

  // 音声レベルバーの数を計算
  const getAudioBars = () => {
    const barCount = 20;
    const activeBars = Math.ceil(audioLevel * barCount);
    return Array.from({ length: barCount }, (_, i) => i < activeBars);
  };

  const handleModeChange = (newMode: 'ptt' | 'toggle') => {
    setMode(newMode);
    if (isRecording) {
      stopRecording();
      websocketService.stopTranscription();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      {/* モード切替UI */}
      <div className="flex items-center justify-center space-x-4 mb-2">
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            value="ptt"
            checked={mode === 'ptt'}
            onChange={() => handleModeChange('ptt')}
            className="mr-2"
          />
          <span className="text-white text-sm">
            PTT方式（実際のVHF無線と同じ）
          </span>
        </label>
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            value="toggle"
            checked={mode === 'toggle'}
            onChange={() => handleModeChange('toggle')}
            className="mr-2"
          />
          <span className="text-white text-sm">
            トグル方式（クリックで開始/停止）
          </span>
        </label>
      </div>

      <div className="flex items-center justify-center space-x-4">
        {mode === 'ptt' ? (
          // PTTモード用ボタン
          <button
            onMouseDown={handlePTTStart}
            onMouseUp={handlePTTEnd}
            onMouseLeave={handlePTTEnd} // マウスが外れた時も停止
            onTouchStart={handlePTTStart}
            onTouchEnd={handlePTTEnd}
            onContextMenu={(e) => e.preventDefault()} // 右クリック無効化
            className={`px-8 py-4 rounded-full font-bold text-lg transition-all duration-200 
              select-none cursor-pointer touch-none ${
              isRecording
                ? 'bg-red-600 text-white scale-110 shadow-2xl animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105 shadow-lg'
            }`}
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            {isRecording ? (
              <>
                <span className="inline-block w-3 h-3 bg-white rounded-full animate-pulse mr-2" />
                送信中... (ボタンを離すと停止)
              </>
            ) : (
              <>
                🎙️ 押して送信 (PTT)
              </>
            )}
          </button>
        ) : (
          // トグルモード用ボタン（既存）
          <button
            onClick={handleToggleRecording}
            className={`px-6 py-3 rounded-full font-semibold text-base transition-all duration-300 
              flex items-center space-x-2 shadow-lg ${
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
        )}
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
          <span className="text-gray-300">
            {mode === 'ptt' ? '送信中...' : '録音中...'}
          </span>
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
          {mode === 'ptt' ? (
            <>
              <p>🎙️ ボタンを押し続けている間、送信されます</p>
              <p>💡 ヒント: スペースキーも使用できます</p>
            </>
          ) : (
            <>
              <p>録音ボタンをクリックして音声入力を開始してください</p>
              <p>マイクへのアクセス許可が必要です</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;