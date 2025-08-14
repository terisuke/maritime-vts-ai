#!/bin/bash
# 🚀 クイック修正コマンド（5分で完了）
# 実行: bash quick-fix.sh

echo "🔧 Maritime VTS AI - クイック修正"
echo "================================="
echo ""

# Step 1: 修正ファイルをコピー
echo "📝 Step 1: 修正ファイルをコピー"
cd /Users/teradakousuke/Developer/maritime-vts-ai
cp message-router-fix.js backend/lambda/websocket-handler/message-router-fix.js

# Step 2: バックアップ作成
echo "💾 Step 2: オリジナルファイルをバックアップ"
cd backend/lambda/websocket-handler
cp message-router.js message-router.backup.$(date +%Y%m%d-%H%M%S).js

# Step 3: 修正適用
echo "✏️ Step 3: 修正を適用"
# handleTranscriptionResultメソッドだけを置き換え
sed -i.bak '445,550d' message-router.js
sed -i '444r message-router-fix.js' message-router.js

# Step 4: パッケージ作成
echo "📦 Step 4: デプロイパッケージ作成"
zip -r websocket-handler.zip . -x "*.backup.*" "*.git*" "node_modules/*"

# Step 5: Lambda更新
echo "🚀 Step 5: Lambda関数を更新"
aws lambda update-function-code \
  --function-name vts-websocket-handler \
  --zip-file fileb://websocket-handler.zip \
  --publish

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 修正完了！"
  echo ""
  echo "📋 次のステップ:"
  echo "1. CloudFront URL を開く: https://d2pomq1mbe8jsg.cloudfront.net"
  echo "2. ブラウザをリロード (Ctrl+F5)"
  echo "3. 録音開始ボタンをクリック"
  echo "4. 「博多港VTS、入港許可を要請」と話す"
  echo "5. AI応答パネルに結果が表示されることを確認"
  echo ""
  echo "🔍 ログ確認コマンド:"
  echo "aws logs tail /aws/lambda/vts-websocket-handler --follow | grep -E 'AI|aiResponse'"
else
  echo ""
  echo "❌ Lambda更新失敗"
  echo "エラーログを確認してください"
fi
