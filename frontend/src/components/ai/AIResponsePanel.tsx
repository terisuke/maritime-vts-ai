import React, { useEffect, useState } from 'react';
import type { AIResponse } from '../../types';

interface AIResponsePanelProps {
  response: AIResponse | null;
}

const AIResponsePanel: React.FC<AIResponsePanelProps> = ({ response }) => {
  // デフォルトをOFFに変更（エコー問題防止のため）
  const [isAutoSpeak, setIsAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // グローバル録音状態の管理
  useEffect(() => {
    // 音声出力状態をグローバルに公開
    (window as any).isSpeaking = isSpeaking;
  }, [isSpeaking]);

  // 音声合成関数
  const speak = (text: string) => {
    // 録音中なら一時停止を通知
    if ((window as any).isRecording) {
      console.log('音声出力開始のため録音を一時停止');
      (window as any).pauseRecording?.();
    }
    
    // 既存の音声を停止
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.1; // 少し速めに
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    
    // 日本語音声を選択
    const voices = window.speechSynthesis.getVoices();
    const japaneseVoice = voices.find(voice => voice.lang === 'ja-JP');
    if (japaneseVoice) {
      utterance.voice = japaneseVoice;
    }
    
    utterance.onstart = () => {
      setIsSpeaking(true);
      // エコー防止フラグ
      (window as any).blockRecording = true;
    };
    
    utterance.onend = () => {
      setIsSpeaking(false);
      // エコー防止フラグ解除
      (window as any).blockRecording = false;
      // 録音再開を通知
      (window as any).resumeRecording?.();
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
      (window as any).blockRecording = false;
    };
    
    window.speechSynthesis.speak(utterance);
  };
  
  const stop = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };
  
  // 新しい応答を自動読み上げ
  useEffect(() => {
    if (response?.suggestedResponse && isAutoSpeak) {
      // 音声が利用可能になるまで少し待つ
      const timer = setTimeout(() => {
        speak(response.suggestedResponse);
      }, 100);
      return () => clearTimeout(timer);
    }
    
    return () => {
      stop(); // クリーンアップ
    };
  }, [response?.suggestedResponse, isAutoSpeak]);
  
  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case 'GREEN':
        return 'bg-green-600';
      case 'AMBER':
        return 'bg-amber-600';
      case 'RED':
        return 'bg-red-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getClassificationText = (classification: string) => {
    switch (classification) {
      case 'GREEN':
        return '安全';
      case 'AMBER':
        return '注意';
      case 'RED':
        return '危険';
      default:
        return '不明';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 h-96">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center">
          <span className="mr-2">🤖</span>
          AI支援応答
        </h2>
        {/* 音声出力コントロールを常に表示 */}
        <div className="flex items-center space-x-2">
          {/* 音声再生ボタン - responseがある時のみ有効化 */}
          <button
            onClick={() => response && speak(response.suggestedResponse)}
            disabled={!response}
            className={`px-3 py-1 rounded text-white text-sm transition-all ${
              !response 
                ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                : isSpeaking 
                  ? 'bg-green-600 animate-pulse' 
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={!response ? "応答待機中" : "応答を読み上げ"}
          >
            {isSpeaking ? '🔊 再生中...' : '🔊 再生'}
          </button>
          
          {/* 停止ボタン - 再生中のみ有効化 */}
          <button
            onClick={stop}
            disabled={!isSpeaking}
            className={`px-3 py-1 rounded text-white text-sm transition-all ${
              !isSpeaking
                ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                : 'bg-gray-600 hover:bg-gray-700'
            }`}
            title="読み上げを停止"
          >
            ⏹️ 停止
          </button>
          
          {/* 自動読み上げ設定 - 常に表示・操作可能 */}
          <label className="flex items-center text-white text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoSpeak}
              onChange={(e) => setIsAutoSpeak(e.target.checked)}
              className="mr-1"
            />
            自動読み上げ
          </label>
        </div>
      </div>
      
      {!response ? (
        <div className="text-gray-500 text-center py-8">
          AI分析結果がここに表示されます
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-400">リスクレベル:</span>
              <span
                className={`px-3 py-1 rounded-full text-white font-bold ${getClassificationColor(
                  response.classification
                )}`}
              >
                {getClassificationText(response.classification)}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(response.timestamp).toLocaleTimeString('ja-JP')}
            </span>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              推奨応答
            </h3>
            <p className="text-white whitespace-pre-wrap">
              {response.suggestedResponse}
            </p>
          </div>

          {response.riskFactors && response.riskFactors.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                リスク要因
              </h3>
              <ul className="space-y-1">
                {response.riskFactors.map((factor, index) => (
                  <li key={index} className="text-white text-sm flex items-start">
                    <span className="text-yellow-500 mr-2">⚠️</span>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>確信度: {(response.confidence * 100).toFixed(1)}%</span>
            {isSpeaking && (
              <span className="text-green-400 animate-pulse">
                🔊 音声出力中...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIResponsePanel;