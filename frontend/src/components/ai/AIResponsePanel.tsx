import React from 'react';
import type { AIResponse } from '../../types';

interface AIResponsePanelProps {
  response: AIResponse | null;
}

const AIResponsePanel: React.FC<AIResponsePanelProps> = ({ response }) => {
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
      <h2 className="text-xl font-bold mb-4 text-white flex items-center">
        <span className="mr-2">🤖</span>
        AI支援応答
      </h2>
      
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
                    <span className="text-red-500 mr-2">⚠️</span>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>確信度: {(response.confidence * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIResponsePanel;