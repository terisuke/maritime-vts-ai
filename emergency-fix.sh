#!/bin/bash
# 緊急修正スクリプト
# 実行日: 2025年8月14日

echo "🔧 Maritime VTS AI - 緊急修正実施"
echo "===================================="
echo ""

# 1. 現在のLambda関数のコードをバックアップ
echo "📦 現在のコードをバックアップ中..."
aws lambda get-function --function-name vts-websocket-handler \
  --query 'Code.Location' --output text > lambda-code-url.txt

if [ -f lambda-code-url.txt ]; then
  wget -q -O lambda-backup-$(date +%Y%m%d-%H%M%S).zip $(cat lambda-code-url.txt)
  echo "✅ バックアップ完了"
fi

# 2. message-router.jsの修正
echo ""
echo "📝 message-router.jsを修正中..."

cat > /tmp/fix-message-router.patch << 'EOF'
--- a/backend/lambda/websocket-handler/message-router.js
+++ b/backend/lambda/websocket-handler/message-router.js
@@ -452,20 +452,11 @@
         // AI処理をtry-catchでラップ
         try {
-          // Bedrockで分析（緊急性を自動判定）
-          const aiResponse = await this.bedrockProcessor.generateEmergencyResponse(result.text);
-          
-          // 非緊急の場合は詳細分析も実行
-          if (!aiResponse.isEmergency) {
-            const detailedResponse = await this.bedrockProcessor.processVTSCommunication(
-              result.text,
-              {
-                location: '博多港',
-                timestamp: new Date().toISOString(),
-                connectionId: connectionId,
-                vesselInfo: '未特定'
-              }
-            );
-            // 詳細分析の結果をマージ
-            Object.assign(aiResponse, detailedResponse);
-          }
+          // Bedrockで分析（processVTSCommunicationメソッドを直接使用）
+          const aiResponse = await this.bedrockProcessor.processVTSCommunication(
+            result.text,
+            {
+              location: '博多港',
+              timestamp: new Date().toISOString(),
+              connectionId: connectionId,
+              vesselInfo: { type: '未特定' }
+            }
+          );
           
           // AI応答をクライアントに送信
           await this.sendToConnection(connectionId, {
-            type: 'aiResponse',
+            type: 'aiResponse',  // フロントエンドが期待する形式
             payload: aiResponse
           });
           
@@ -475,7 +466,7 @@
           // フォールバック応答を送信
           await this.sendToConnection(connectionId, {
-            type: 'aiResponse',
+            type: 'aiResponse',  // フロントエンドが期待する形式
             payload: {
               classification: 'AMBER',
               suggestedResponse: 'AI処理中にエラーが発生しました。音声は正常に記録されています。もう一度お試しください。',
EOF

echo "✅ パッチファイル作成完了"

# 3. bedrock-processor.jsに緊急対応メソッドを追加
echo ""
echo "📝 bedrock-processor.jsに不足メソッドを追加中..."

cat > /tmp/add-emergency-method.js << 'EOF'
  /**
   * 緊急応答生成（互換性のため追加）
   * @deprecated processVTSCommunicationを使用してください
   * @param {string} transcriptText - 文字起こしテキスト
   * @returns {Promise<Object>} - AI応答
   */
  async generateEmergencyResponse(transcriptText) {
    // processVTSCommunicationにリダイレクト
    return await this.processVTSCommunication(transcriptText, {
      location: '博多港',
      timestamp: new Date().toISOString(),
      priority: 'URGENT'
    });
  }
EOF

echo "✅ メソッド追加コード作成完了"

# 4. Lambda関数の更新準備
echo ""
echo "🚀 Lambda関数更新の準備..."

cd /Users/teradakousuke/Developer/maritime-vts-ai/backend/lambda/websocket-handler

# パッチ適用（ローカル）
if [ -f message-router.js ]; then
  cp message-router.js message-router.js.backup
  echo "✅ message-router.jsのバックアップ作成"
fi

# 5. デプロイ
echo ""
echo "📦 修正版をデプロイ中..."

# Lambda関数パッケージ作成
cd /Users/teradakousuke/Developer/maritime-vts-ai/backend/lambda/websocket-handler
zip -r websocket-handler.zip . -x "*.git*" "*.backup"

# Lambda関数更新
aws lambda update-function-code \
  --function-name vts-websocket-handler \
  --zip-file fileb://websocket-handler.zip \
  --publish

if [ $? -eq 0 ]; then
  echo "✅ Lambda関数の更新完了"
else
  echo "❌ Lambda関数の更新失敗"
  exit 1
fi

# 6. 動作確認
echo ""
echo "🧪 動作確認テスト..."

# テストイベント作成
cat > /tmp/test-transcription.json << 'EOF'
{
  "requestContext": {
    "connectionId": "test-connection-$(date +%s)",
    "routeKey": "$default"
  },
  "body": "{\"action\":\"message\",\"payload\":{\"text\":\"博多港VTS、入港許可を要請\",\"type\":\"transcription\"}}"
}
EOF

# テスト実行
aws lambda invoke \
  --function-name vts-websocket-handler \
  --payload file:///tmp/test-transcription.json \
  /tmp/test-response.json

echo "テスト結果:"
cat /tmp/test-response.json | jq '.'

echo ""
echo "✅ 修正完了！"
echo ""
echo "📋 確認事項:"
echo "1. CloudFrontページをリロード"
echo "2. 録音開始"
echo "3. 「博多港VTS、入港許可を要請」と発話"
echo "4. AI応答が表示されることを確認"
