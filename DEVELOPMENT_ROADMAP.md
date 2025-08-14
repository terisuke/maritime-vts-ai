# 🚢 AI Maritime Control System - 開発ロードマップ＆リファクタリング指示書

作成日: 2025年8月14日  
作成者: プロダクトマネージャー  
**実際の開発時間: 約20時間16分**（2025年8月13日 18:50 〜 8月14日 15:06）

## 📋 目次
1. [現在の技術的課題と改善指示](#現在の技術的課題と改善指示)
2. [リファクタリング箇所](#リファクタリング箇所)
3. [開発ロードマップ](#開発ロードマップ)
4. [MVPから製品版への移行計画](#mvpから製品版への移行計画)

---

## 🔍 現在の技術的課題と改善指示

### 1. AIシステムの回答タイミングが遅い（優先度: 高）

**問題の詳細:**
- 現在: Transcribe → Bedrock → 音声合成の処理が直列実行
- 応答時間: 約3-5秒（目標: 1.5秒以下）

**改善指示:**
```javascript
// backend/lambda/websocket-handler/message-router.js の改善点

// 現在の実装（問題あり）
async handleTranscriptionResult(connectionId, result) {
  // 1. DynamoDB保存を待つ（不要な待機）
  await dynamodbClient.putItem(...);
  
  // 2. Bedrock処理を待つ
  const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(...);
  
  // 3. さらに詳細分析を待つ
  const detailedResponse = await this.bedrockProcessor.processVTSCommunication(...);
}

// 改善案（並列処理）
async handleTranscriptionResult(connectionId, result) {
  // 非同期で並列実行
  const promises = [
    // DynamoDB保存は非同期で
    dynamodbClient.putItem(...).catch(console.error),
    
    // 緊急判定は即座に
    this.bedrockProcessor.generateEmergencyResponse(...)
  ];
  
  // 緊急応答のみ待つ
  const [_, emergencyResponse] = await Promise.allSettled(promises);
  
  // 即座に応答
  await this.sendToConnection(connectionId, emergencyResponse);
  
  // 詳細分析は後で非同期実行
  setImmediate(() => {
    this.bedrockProcessor.processVTSCommunication(...);
  });
}
```

### 2. 緊急事態時にJSONがそのまま出力される（優先度: 緊急）

**問題の詳細:**
- エラー時にparseAIResponse()が失敗し、生のJSONが表示される
- ユーザー体験を著しく損なう

**改善指示:**
```javascript
// backend/lambda/websocket-handler/shared/bedrock-processor.js の修正

parseAIResponse(responseText) {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // バリデーション強化
      return {
        classification: this.validateClassification(parsed.classification),
        suggestedResponse: this.sanitizeResponse(parsed.suggestedResponse),
        confidence: this.clampConfidence(parsed.confidence),
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
        recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
        timestamp: new Date().toISOString(),
        // JSONを絶対に出力しない
        rawResponse: null  // ← 削除または隠蔽
      };
    }
  } catch (error) {
    this.logger.error('AI response parse error', error);
  }
  
  // フォールバック（JSONではなく自然な日本語）
  return {
    classification: 'AMBER',
    suggestedResponse: '通信を確認しています。もう一度お願いします。',
    confidence: 0.6,
    riskFactors: ['応答処理中'],
    recommendedActions: ['再送信をお待ちください'],
    timestamp: new Date().toISOString()
  };
}

// ヘルパーメソッド追加
validateClassification(classification) {
  const valid = ['GREEN', 'AMBER', 'RED'];
  return valid.includes(classification) ? classification : 'AMBER';
}

sanitizeResponse(response) {
  // JSONパターンを除去
  if (!response || typeof response !== 'string') {
    return 'ただいま処理中です。';
  }
  
  // JSON記号を除去
  return response
    .replace(/[\{\}\[\]"]/g, '')
    .replace(/,/g, '、')
    .trim() || 'ただいま処理中です。';
}

clampConfidence(confidence) {
  const val = parseFloat(confidence);
  return isNaN(val) ? 0.5 : Math.max(0, Math.min(1, val));
}
```

### 3. PTTボタン使用時に認識中で止まる（優先度: 高）

**問題の詳細:**
- ボタンを離した後もTranscribeセッションが継続
- stopTranscriptionメッセージが正しく処理されない

**改善指示:**
```javascript
// frontend/src/hooks/useWebSocket.ts の修正

export function useWebSocket() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionSessionId, setTranscriptionSessionId] = useState<string | null>(null);
  
  // PTTボタンハンドラー改善
  const handlePTTPress = () => {
    if (!isRecording) {
      const sessionId = `trans-${Date.now()}`;
      setTranscriptionSessionId(sessionId);
      
      ws.send(JSON.stringify({
        action: 'startTranscription',
        payload: {
          sessionId,
          languageCode: 'ja-JP',
          mode: 'ptt'  // PTTモード明示
        }
      }));
      
      setIsRecording(true);
    }
  };
  
  const handlePTTRelease = () => {
    if (isRecording && transcriptionSessionId) {
      // 即座に停止信号を送信
      ws.send(JSON.stringify({
        action: 'stopTranscription',
        payload: {
          sessionId: transcriptionSessionId,
          immediate: true  // 即座停止フラグ
        }
      }));
      
      // UIを即座に更新
      setIsRecording(false);
      setTranscriptionSessionId(null);
      
      // タイムアウト設定（保険）
      setTimeout(() => {
        if (isRecording) {
          console.error('Force stopping transcription');
          setIsRecording(false);
        }
      }, 1000);
    }
  };
  
  return {
    handlePTTPress,
    handlePTTRelease,
    isRecording
  };
}

// backend/lambda/websocket-handler/message-router.js の修正

async handleStopTranscription(connectionId, payload) {
  const { sessionId, immediate } = payload;
  
  if (immediate) {
    // 即座にセッション終了
    this.transcribeProcessor.forceStopSession(connectionId);
    
    // クライアントに即座に確認送信
    await this.sendToConnection(connectionId, {
      type: 'status',
      message: 'Transcription stopped',
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    // 後処理は非同期で
    setImmediate(() => {
      this.cleanupTranscriptionResources(sessionId);
    });
  } else {
    // 通常の停止処理
    this.transcribeProcessor.stopSession(connectionId);
  }
  
  return { statusCode: 200, body: 'Stopped' };
}
```

---

## 🔧 リファクタリング箇所

### 優先度1: エラーハンドリングの統一化

**対象ファイル:**
- `backend/lambda/websocket-handler/message-router.js`
- `backend/lambda/websocket-handler/shared/bedrock-processor.js`
- `backend/lambda/websocket-handler/shared/transcribe-processor.js`

**リファクタリング内容:**
```javascript
// shared/error-handler.js（新規作成）
class ErrorHandler {
  static async handleError(error, context) {
    const errorResponse = {
      type: 'error',
      code: error.code || 'UNKNOWN_ERROR',
      message: this.getUserFriendlyMessage(error),
      timestamp: new Date().toISOString(),
      context
    };
    
    // ログ記録
    console.error('Error occurred:', {
      ...errorResponse,
      stack: error.stack,
      originalError: error.message
    });
    
    return errorResponse;
  }
  
  static getUserFriendlyMessage(error) {
    const errorMap = {
      'ThrottlingException': 'システムが混雑しています。少々お待ちください。',
      'ResourceNotFoundException': 'リソースが見つかりません。',
      'ValidationException': '入力データに問題があります。',
      'ServiceUnavailableException': 'サービスが一時的に利用できません。',
      'NetworkingError': 'ネットワーク接続を確認してください。'
    };
    
    return errorMap[error.name] || 'エラーが発生しました。もう一度お試しください。';
  }
}

module.exports = ErrorHandler;
```

### 優先度2: 設定の外部化

**対象ファイル:**
- 全Lambda関数

**リファクタリング内容:**
```javascript
// shared/config.js（新規作成）
module.exports = {
  // Transcribe設定
  transcribe: {
    languageCode: process.env.TRANSCRIBE_LANGUAGE || 'ja-JP',
    vocabularyName: process.env.VOCABULARY_NAME || 'maritime-vts-vocabulary-ja',
    sampleRate: 16000,
    encoding: 'pcm'
  },
  
  // Bedrock設定
  bedrock: {
    modelId: process.env.BEDROCK_MODEL_ID || 'apac.anthropic.claude-sonnet-4-20250514-v1:0',
    maxTokens: 300,
    temperature: 0.3,
    region: 'ap-northeast-1'
  },
  
  // タイムアウト設定
  timeouts: {
    transcription: 30000,  // 30秒
    aiResponse: 5000,      // 5秒
    websocket: 60000       // 60秒
  },
  
  // パフォーマンス設定
  performance: {
    enableParallelProcessing: true,
    cacheResponses: true,
    maxConcurrentRequests: 10
  }
};
```

### 優先度3: テストカバレッジの向上

**必要なテスト追加:**
```javascript
// backend/tests/integration/e2e-flow.test.js（新規作成）
describe('E2E音声処理フロー', () => {
  test('PTTボタンの押下から応答までの完全フロー', async () => {
    // 1. WebSocket接続
    const ws = await connectWebSocket();
    
    // 2. PTTボタン押下シミュレーション
    await ws.send({
      action: 'startTranscription',
      payload: { mode: 'ptt' }
    });
    
    // 3. 音声データ送信
    await ws.send({
      action: 'audioData',
      payload: { audio: mockAudioData }
    });
    
    // 4. PTTボタン離すシミュレーション
    await ws.send({
      action: 'stopTranscription',
      payload: { immediate: true }
    });
    
    // 5. AI応答受信確認
    const response = await waitForMessage(ws, 'aiResponse');
    
    expect(response).toHaveProperty('suggestedResponse');
    expect(response.suggestedResponse).not.toContain('{');
    expect(response.suggestedResponse).not.toContain('}');
  });
});
```

---

## 📅 開発ロードマップ

### Phase 1: 緊急修正（〜2025年8月16日）
- [x] JSONそのまま出力問題の修正 ✅ **完了済み（2025年8月14日）**
- [ ] PTTボタン動作の修正
- [ ] エラーハンドリング統一

### Phase 2: パフォーマンス改善（〜2025年8月23日）
- [ ] 応答時間を1.5秒以下に短縮
- [ ] 並列処理の実装
- [ ] キャッシュ機構の導入

### Phase 3: 機能拡張（〜2025年8月30日）
- [ ] 複数言語対応（英語・中国語・韓国語）
- [ ] 船舶データベース連携
- [ ] AIS（Automatic Identification System）統合

### Phase 4: UI/UX改善（〜2025年9月6日）
- [ ] レスポンシブデザイン対応
- [ ] ダークモード実装
- [ ] 音声フィードバック改善

### Phase 5: エンタープライズ機能（〜2025年9月13日）
- [ ] マルチテナント対応
- [ ] 監査ログ機能
- [ ] レポート生成機能

---

## 🚀 MVPから製品版への移行計画

### 現在（MVP）と目標（製品版）の比較

| 機能 | MVP（現在） | 製品版（目標） |
|------|------------|---------------|
| **応答速度** | 3-5秒 | 1秒以下 |
| **認識精度** | 85% | 95%以上 |
| **同時接続数** | 10 | 1000+ |
| **言語対応** | 日本語のみ | 5言語 |
| **稼働率** | 95% | 99.9% |
| **船舶DB連携** | なし | リアルタイム連携 |
| **コスト** | $500/月 | $2000/月（1000ユーザー） |

### アーキテクチャ移行計画

#### Step 1: マイクロサービス化
```
現在: モノリシックLambda
目標: 機能別マイクロサービス
  - 音声処理サービス
  - AI判定サービス
  - データ管理サービス
  - 通知サービス
```

#### Step 2: スケーラビリティ対応
```
現在: 単一リージョン
目標: マルチリージョン展開
  - 東京リージョン（プライマリ）
  - 大阪リージョン（バックアップ）
  - CDNによるグローバル配信
```

#### Step 3: セキュリティ強化
```
現在: 基本的な認証
目標: エンタープライズセキュリティ
  - OAuth2.0/SAML認証
  - エンドツーエンド暗号化
  - 監査ログ完備
  - SOC2準拠
```

---

## 📊 KPI目標

### 技術KPI
- **応答速度**: 95パーセンタイルで1.5秒以下
- **可用性**: 月間99.9%以上
- **エラー率**: 0.1%以下
- **同時接続数**: 1000セッション

### ビジネスKPI
- **ユーザー満足度**: NPS 50以上
- **導入港湾数**: 10港以上
- **月間アクティブユーザー**: 5000人
- **コスト効率**: ユーザーあたり$2以下

---

## 🔔 重要な注意事項

1. **すべての修正はテスト駆動で実装すること**
2. **コードレビューを必須とする**
3. **本番デプロイ前にステージング環境で検証**
4. **パフォーマンステストを定期実施**
5. **セキュリティ監査を月次で実施**

---

## 📞 問い合わせ先

技術的な質問: company@cor-jp.com  
ビジネス関連: company@cor-jp.com  
緊急対応: company@cor-jp.com

最終更新: 2025年8月14日
