#!/bin/bash

echo "🚢 福岡港湾VTSカスタム語彙デプロイ"
echo "================================"

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VOCABULARY_NAME="maritime-vts-vocabulary-ja"
REGION="ap-northeast-1"

# 既存語彙の確認
echo "📋 既存語彙の確認..."
EXISTING=$(aws transcribe get-vocabulary \
  --vocabulary-name $VOCABULARY_NAME \
  --region $REGION 2>/dev/null)

if [ $? -eq 0 ]; then
  CURRENT_STATE=$(echo $EXISTING | jq -r '.VocabularyState')
  echo -e "${YELLOW}⚠️  既存の語彙が見つかりました (状態: $CURRENT_STATE)${NC}"
  echo "削除して新規作成しますか？ (y/n)"
  read -r response
  if [[ "$response" == "y" ]]; then
    echo "削除中..."
    aws transcribe delete-vocabulary \
      --vocabulary-name $VOCABULARY_NAME \
      --region $REGION
    
    echo "削除完了。30秒待機..."
    for i in {30..1}; do
      echo -ne "\r待機中: $i 秒  "
      sleep 1
    done
    echo ""
  else
    echo "既存の語彙を保持します"
    exit 0
  fi
fi

# 新規作成
echo "📝 カスタム語彙を作成..."
node create-vocabulary.js

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ 語彙作成スクリプトの実行に失敗しました${NC}"
  exit 1
fi

# 状態確認
echo "⏳ 作成状態を確認中..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  
  STATUS=$(aws transcribe get-vocabulary \
    --vocabulary-name $VOCABULARY_NAME \
    --region $REGION \
    --query "VocabularyState" \
    --output text 2>/dev/null)
  
  if [ "$STATUS" == "READY" ]; then
    echo -e "${GREEN}✅ カスタム語彙の作成完了！${NC}"
    
    # 詳細情報を表示
    echo ""
    echo "📊 語彙の詳細:"
    aws transcribe get-vocabulary \
      --vocabulary-name $VOCABULARY_NAME \
      --region $REGION \
      --query "{Name:VocabularyName,Language:LanguageCode,LastModified:LastModifiedTime,State:VocabularyState}" \
      --output table
    
    break
  elif [ "$STATUS" == "FAILED" ]; then
    echo -e "${RED}❌ カスタム語彙の作成失敗${NC}"
    
    # エラー理由を表示
    FAILURE_REASON=$(aws transcribe get-vocabulary \
      --vocabulary-name $VOCABULARY_NAME \
      --region $REGION \
      --query "FailureReason" \
      --output text)
    echo -e "${RED}失敗理由: $FAILURE_REASON${NC}"
    exit 1
  elif [ "$STATUS" == "PENDING" ]; then
    echo -ne "\r状態: PENDING ... 待機中 ($ATTEMPT/$MAX_ATTEMPTS) "
    sleep 10
  else
    echo -ne "\r状態: $STATUS ... 待機中 ($ATTEMPT/$MAX_ATTEMPTS) "
    sleep 10
  fi
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo -e "\n${RED}❌ タイムアウト: 語彙の作成が完了しませんでした${NC}"
  exit 1
fi

echo ""
echo "================================"
echo -e "${GREEN}✨ デプロイ完了！${NC}"
echo ""
echo "次のステップ:"
echo "1. Lambda関数の環境変数を更新:"
echo "   TRANSCRIBE_VOCABULARY_NAME=$VOCABULARY_NAME"
echo ""
echo "2. WebSocket接続をテスト:"
echo "   cd ../../frontend"
echo "   ALLOW_PRODUCTION_TEST=true npm run test:aws"