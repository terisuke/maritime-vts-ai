# 🚨 開発チーム緊急対応指示書

**作成日時**: 2025年8月14日 16:00  
**優先度**: 🔴 CRITICAL - 即座対応必要  
**対応期限**: 30分以内

## 📊 問題分析結果

### 確認された事実
1. ✅ **音声認識**: 正常動作（「博多港vts入港許可を要請」が認識）
2. ❌ **AI応答**: 全く表示されない
3. ✅ **WebSocket**: 接続済み

### 🔍 根本原因（確定）

#### **Bug 1: 存在しないメソッドの呼び出し**
```javascript
// backend/lambda/websocket-handler/message-router.js:455
// ❌ このメソッドは BedrockProcessor に存在しない！
const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(result.text);
```

#### **Bug 2: メッセージタイプの不一致**
```javascript
// バックエンド送信
type: 'AI_RESPONSE'  // ❌ 間違い

// フロントエンド期待
type: 'aiResponse'   // ✅ 正しい
```

## 🛠️ 修正手順（2つの選択肢）

### **Option A: 簡単な修正（推奨） - 15分**

#### Step 1: message-router.js修正
```javascript
// backend/lambda/websocket-handler/message-router.js
// 455-469行目を以下に置き換え

// 修正前（455-469行）の削除
// const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(result.text);
// if (!aiResponse.isEmergency) { ... }

// 修正後
const aiResponse = await this.bedrockProcessor.processVTSCommunication(
  result.text,
  {
    location: '博多港',
    timestamp: new Date().toISOString(),
    connectionId: connectionId,
    vesselInfo: { type: '未特定' }
  }
);
```

#### Step 2: メッセージタイプ修正
```javascript
// 同じファイルの 471行目
// 修正前
type: 'AI_RESPONSE',

// 修正後  
type: 'aiResponse',
```

#### Step 3: デプロイ
```bash
cd backend/lambda/websocket-handler
zip -r handler.zip .
aws lambda update-function-code \
  --function-name vts-websocket-handler \
  --zip-file fileb://handler.zip
```

### **Option B: 完全な修正（30分）**

#### Step 1: BedrockProcessorに不足メソッド追加
```javascript
// backend/lambda/websocket-handler/shared/bedrock-processor.js
// クラスの最後に追加

/**
 * 緊急応答の生成
 * @param {string} transcriptText - 文字起こしテキスト
 * @returns {Promise<Object>} - AI応答
 */
async generateEmergencyResponse(transcriptText) {
  const response = await this.processVTSCommunication(transcriptText, {
    location: '博多港',
    timestamp: new Date().toISOString(),
    priority: 'URGENT'
  });
  
  // 緊急度判定ロジック追加
  const emergencyKeywords = ['メーデー', '緊急', '衝突', '火災', '浸水', 'SOS'];
  const isEmergency = emergencyKeywords.some(keyword => 
    transcriptText.includes(keyword)
  );
  
  return {
    ...response,
    isEmergency,
    priority: isEmergency ? 'EMERGENCY' : 'NORMAL'
  };
}
```

#### Step 2: message-router.js のメッセージタイプ修正
```javascript
// 471行目と487行目
type: 'aiResponse',  // 'AI_RESPONSE'から変更
```

## 🧪 テスト手順

### 1. ローカルテスト（5分）
```bash
# テストスクリプト実行
node test-bedrock-local.js
```

### 2. Lambda直接テスト（5分）
```bash
# テストイベント
aws lambda invoke \
  --function-name vts-websocket-handler \
  --payload '{"requestContext":{"connectionId":"test","routeKey":"$default"},"body":"{\"action\":\"message\",\"payload\":{\"text\":\"テスト\"}}"}' \
  response.json

cat response.json
```

### 3. E2Eテスト（5分）
1. https://d2pomq1mbe8jsg.cloudfront.net を開く
2. 録音開始
3. 「博多港VTS、入港許可を要請」と発話
4. AI応答パネルに結果表示を確認

## 📊 確認ポイント

### CloudWatch Logsで確認
```bash
aws logs tail /aws/lambda/vts-websocket-handler --follow | grep -E "AI|Bedrock|aiResponse"
```

### 期待されるログ
```
INFO: Processing VTS communication
INFO: AI analysis completed
INFO: AI response sent
```

## 🚨 モデルIDについて

**重要**: Claude Sonnet 4は2025年8月時点でAmazon Bedrockには存在しません。

### 利用可能なモデル
```bash
# 確認コマンド
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].[modelId]" \
  --output text

# 結果
anthropic.claude-3-sonnet-20240229-v1:0     ✅ 使用中
anthropic.claude-3-5-sonnet-20240620-v1:0   ✅ 利用可能
anthropic.claude-3-haiku-20240307-v1:0      ✅ 利用可能
```

## 📋 チェックリスト

### 修正実施
- [ ] message-router.js修正（generateEmergencyResponse削除）
- [ ] メッセージタイプ修正（AI_RESPONSE → aiResponse）
- [ ] Lambda関数更新
- [ ] CloudWatch Logs確認

### 動作確認
- [ ] 音声認識動作
- [ ] AI応答表示
- [ ] エラーなし

## ⏰ タイムライン

```
16:00 - 修正開始
16:15 - Option A完了
16:20 - テスト実施
16:30 - 本番反映
```

## 💡 今後の改善提案

1. **エラーモニタリング強化**
   - CloudWatch Alarmの設定
   - エラー時のSlack通知

2. **テスト自動化**
   - E2Eテストスイート作成
   - CI/CDパイプライン改善

3. **アーキテクチャ簡素化**
   - AWS Amplify Predictionsへの移行検討
   - 複雑度の削減

## 🎯 即座のアクション

**開発チームは以下を実行してください：**

1. **Option Aの修正を実施**（15分）
2. **Lambda更新**（5分）
3. **動作確認**（5分）
4. **結果報告**（5分）

**合計所要時間: 30分**

---

**連絡先**: PdM（即座に対応可能）  
**エスカレーション**: 必要に応じてAWSサポートへ
