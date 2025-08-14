# 🔍 問題の真相解明と修正指示（改訂版）

**作成日時**: 2025年8月14日 16:30  
**優先度**: 🔴 CRITICAL

## 📊 状況の正確な把握

### Claude 4について（訂正）
✅ **Claude 4は2025年5月にAmazon Bedrockで利用可能になっています**
- Claude Opus 4: 最も強力なモデル
- Claude Sonnet 4: 中規模の本番稼働用モデル

### 現在の問題（2つの独立した問題）

#### 問題1: コードのバグ（確実に存在）
```javascript
// backend/lambda/websocket-handler/message-router.js:455
// ❌ このメソッドは存在しない！
const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(result.text);
```

#### 問題2: モデルIDの不確実性
- 設定中のID: `apac.anthropic.claude-sonnet-4-20250514-v1:0`
- 正しいIDかどうか要確認

## 🛠️ 段階的修正アプローチ

### **Phase 1: コードバグ修正（必須・即座）**

#### Step 1: message-router.js修正
```javascript
// backend/lambda/websocket-handler/message-router.js
// 455-469行目を修正

// ❌ 削除（存在しないメソッド）
// const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(result.text);

// ✅ 置換
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
// 471行目, 487行目
// ❌ 変更前
type: 'AI_RESPONSE',

// ✅ 変更後
type: 'aiResponse',
```

### **Phase 2: Claude 4モデル確認（Phase 1後）**

#### 調査スクリプト実行
```bash
# Claude 4モデルの正確なIDを確認
chmod +x check-claude4-models.sh
./check-claude4-models.sh
```

#### 可能性のあるモデルID
```bash
# パターン1: 標準形式
anthropic.claude-sonnet-4-20250514-v1:0

# パターン2: APAC形式
apac.anthropic.claude-sonnet-4-20250514-v1:0

# パターン3: 短縮形式
anthropic.claude-4-sonnet-v1:0

# パターン4: Opus 4
anthropic.claude-opus-4-20250514-v1:0
```

## 📝 修正手順（改訂版）

### 即座実行スクリプト
```bash
#!/bin/bash
# 修正スクリプト v2

echo "🔧 Maritime VTS AI - 修正 v2"
echo "============================="

# Step 1: コードバグ修正
cd /Users/teradakousuke/Developer/maritime-vts-ai/backend/lambda/websocket-handler

# バックアップ
cp message-router.js message-router.backup.$(date +%Y%m%d-%H%M%S).js

# 修正適用（sedで直接修正）
sed -i '' '455,469d' message-router.js
sed -i '' '454a\
        const aiResponse = await this.bedrockProcessor.processVTSCommunication(\
          result.text,\
          {\
            location: "博多港",\
            timestamp: new Date().toISOString(),\
            connectionId: connectionId,\
            vesselInfo: { type: "未特定" }\
          }\
        );' message-router.js

# メッセージタイプ修正
sed -i '' 's/type: "AI_RESPONSE"/type: "aiResponse"/g' message-router.js

# Step 2: デプロイ
zip -r handler.zip . -x "*.backup.*"
aws lambda update-function-code \
  --function-name vts-websocket-handler \
  --zip-file fileb://handler.zip \
  --publish

echo "✅ Phase 1完了: コードバグ修正"

# Step 3: Claude 4モデル確認
echo ""
echo "📋 Claude 4モデル確認中..."
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude-4') || contains(modelId, 'claude-sonnet-4') || contains(modelId, 'claude-opus-4')].[modelId]" \
  --output text

echo ""
echo "🧪 現在設定されているモデルIDでテスト..."
CURRENT_MODEL=$(aws lambda get-function-configuration \
  --function-name vts-websocket-handler \
  --query "Environment.Variables.BEDROCK_MODEL_ID" \
  --output text)

echo "Current Model: $CURRENT_MODEL"

aws bedrock-runtime invoke-model \
  --model-id "$CURRENT_MODEL" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":50,"messages":[{"role":"user","content":"test"}]}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-northeast-1 \
  test-model.json 2>&1

if [ $? -eq 0 ]; then
  echo "✅ モデルアクセス成功"
else
  echo "⚠️ モデルアクセス失敗 - Claude 3にフォールバック推奨"
  
  # Claude 3 Sonnetにフォールバック
  aws lambda update-function-configuration \
    --function-name vts-websocket-handler \
    --environment "Variables={BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0}"
  
  echo "✅ Claude 3 Sonnetに設定変更"
fi
```

## 🧪 テスト手順

### Step 1: コードバグ修正の確認
```bash
# エラーログが消えることを確認
aws logs tail /aws/lambda/vts-websocket-handler --follow | grep -E "generateEmergencyResponse|ERROR"
```

### Step 2: AI応答の確認
1. https://d2pomq1mbe8jsg.cloudfront.net を開く
2. 録音開始
3. 「博多港VTS、入港許可を要請」と発話
4. **AI応答パネルに結果が表示されることを確認**

### Step 3: モデル性能比較（オプション）
```bash
# Claude 3 vs Claude 4の応答時間比較
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --filter-pattern "BedrockResponseTime" \
  --query "events[*].message" \
  --output text
```

## 📊 期待される結果

### Phase 1完了後（5分）
- ✅ generateEmergencyResponseエラー解消
- ✅ AI応答がフロントエンドに表示される
- ✅ 基本的な動作回復

### Phase 2完了後（10分）
- ✅ 最適なClaudeモデルの特定
- ✅ モデルIDの正確な設定
- ✅ パフォーマンス最適化

## 🎯 優先順位

1. **最優先**: コードバグ修正（generateEmergencyResponse削除）
2. **高**: メッセージタイプ統一
3. **中**: Claude 4モデルIDの検証
4. **低**: Claude 4が使えない場合はClaude 3で継続

## 📋 チェックリスト

### 必須対応
- [ ] message-router.js修正
- [ ] Lambda更新
- [ ] AI応答表示確認

### 追加対応
- [ ] Claude 4モデルID確認
- [ ] 最適なモデル選択
- [ ] パフォーマンステスト

## 💡 重要な洞察

**Claude 4は存在しますが、現在の問題の主因はコードのバグです。**
まずバグを修正してから、Claude 4の正確なモデルIDを確認しましょう。

---

**即座のアクション**: 上記の修正スクリプトを実行してください。5分で基本機能が回復します！
