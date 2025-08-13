import React, { useEffect, useRef, useState } from 'react';
import type { TranscriptionResult } from '../../types';

interface TranscriptionDisplayProps {
  transcriptions: TranscriptionResult[];
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ transcriptions }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // 新しい文字起こしが追加されたら自動スクロール
  useEffect(() => {
    if (scrollRef.current && autoScroll) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcriptions, autoScroll]);

  // スクロール位置を監視
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      setAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom && transcriptions.length > 0);
    }
  };

  // 最下部にスクロール
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setAutoScroll(true);
    }
  };

  // スピーカーラベルの色を取得
  const getSpeakerColor = (label?: string) => {
    if (!label) return 'bg-gray-600';
    
    const colors = {
      'VTS': 'bg-blue-600',
      'VESSEL': 'bg-green-600',
      'PILOT': 'bg-purple-600',
      'PORT': 'bg-orange-600'
    };
    
    return colors[label as keyof typeof colors] || 'bg-gray-600';
  };

  // 信頼度に基づく色を取得
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 h-96 relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white flex items-center">
          <span className="mr-2">📝</span>
          音声文字起こし
        </h2>
        <div className="flex items-center space-x-2">
          {transcriptions.length > 0 && (
            <span className="text-xs text-gray-500">
              {transcriptions.length} 件の記録
            </span>
          )}
          {autoScroll && (
            <span className="text-xs bg-green-600 px-2 py-1 rounded text-white">
              自動スクロール
            </span>
          )}
        </div>
      </div>
      
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-80 overflow-y-auto space-y-2 pr-2 custom-scrollbar"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#4B5563 #1F2937'
        }}
      >
        {transcriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-center">
              音声の文字起こしがここに表示されます
            </p>
            <p className="text-xs mt-2">
              録音を開始してお話しください
            </p>
          </div>
        ) : (
          <>
            {transcriptions.map((transcript, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg transition-all duration-300 ${
                  transcript.isPartial
                    ? 'bg-gray-800 border border-gray-700 opacity-80'
                    : 'bg-gray-800 border border-blue-600 hover:border-blue-500'
                }`}
              >
                {/* ヘッダー */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      {new Date(transcript.timestamp).toLocaleTimeString('ja-JP', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    {transcript.speakerLabel && (
                      <span className={`text-xs px-2 py-1 rounded text-white ${getSpeakerColor(transcript.speakerLabel)}`}>
                        {transcript.speakerLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs ${getConfidenceColor(transcript.confidence)}`}>
                      {(transcript.confidence * 100).toFixed(0)}%
                    </span>
                    {transcript.isPartial && (
                      <span className="flex items-center text-xs text-yellow-500">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full mr-1 animate-pulse" />
                        認識中
                      </span>
                    )}
                  </div>
                </div>
                
                {/* 文字起こしテキスト */}
                <p className={`text-white leading-relaxed ${
                  transcript.isPartial ? 'italic opacity-90' : ''
                }`}>
                  {transcript.transcriptText}
                </p>
              </div>
            ))}
            
            {/* 自動スクロールインジケーター */}
            {autoScroll && transcriptions.length > 0 && (
              <div className="text-center py-2">
                <span className="text-xs text-gray-600">
                  ▼ 最新の文字起こし ▼
                </span>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 最下部へスクロールボタン */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-lg transition-all duration-300 hover:scale-110"
          title="最新の文字起こしへ"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default TranscriptionDisplay;