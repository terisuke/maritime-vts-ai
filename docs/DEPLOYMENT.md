# デプロイガイド

## 本番環境デプロイ手順

### 1. 事前準備

#### AWS設定
- [ ] AWSアカウントの準備
- [ ] IAMユーザーの作成（デプロイ権限付き）
- [ ] Bedrock Claudeのアクセス有効化
- [ ] Transcribeのリージョン確認

#### GitHub設定
- [ ] GitHub Secretsの設定（[設定ガイド](GITHUB_SECRETS_SETUP.md)参照）
- [ ] GitHub Actionsの有効化

### 2. 初回デプロイ

```bash
# 1. CDKブートストラップ
cd infrastructure
cdk bootstrap aws://381491903672/ap-northeast-1

# 2. スタックデプロイ
cdk deploy VtsInfrastructureStack

# 3. 出力値の確認
aws cloudformation describe-stacks \
  --stack-name VtsInfrastructureStack \
  --query "Stacks[0].Outputs"
```

### 3. カスタム語彙登録

```bash
cd backend/vocabulary

# 既存語彙の確認
node check-vocabulary.js

# 新規作成または更新
node create-vocabulary.js

# 状態確認（READYになるまで待機）
aws transcribe get-vocabulary \
  --vocabulary-name maritime-vts-vocabulary-ja \
  --query "VocabularyState"
```

### 4. 動作確認

```bash
# WebSocket接続テスト
cd frontend
ALLOW_PRODUCTION_TEST=true npm run test:aws

# CloudWatch Logs確認
aws logs tail /aws/lambda/vts-webrtc-signaling --follow
aws logs tail /aws/lambda/vts-transcription-processor --follow
aws logs tail /aws/lambda/vts-nlp-processor --follow
```

### 5. 環境変数の設定

Lambda関数の環境変数を確認・更新：

```bash
# WebSocketハンドラー
aws lambda update-function-configuration \
  --function-name vts-webrtc-signaling \
  --environment Variables='{
    "WEBSOCKET_ENDPOINT":"wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod",
    "CONVERSATIONS_TABLE":"vts-conversations",
    "CONNECTIONS_TABLE":"vts-connections",
    "AUDIO_BUCKET":"vts-audio-storage-381491903672-ap-northeast-1"
  }'

# Transcribeプロセッサー
aws lambda update-function-configuration \
  --function-name vts-transcription-processor \
  --environment Variables='{
    "TRANSCRIBE_VOCABULARY_NAME":"maritime-vts-vocabulary-ja",
    "LANGUAGE_CODE":"ja-JP",
    "MEDIA_ENCODING":"pcm",
    "SAMPLE_RATE":"16000"
  }'

# NLPプロセッサー
aws lambda update-function-configuration \
  --function-name vts-nlp-processor \
  --environment Variables='{
    "BEDROCK_MODEL_ID":"anthropic.claude-3-sonnet-20240229-v1:0",
    "CONVERSATIONS_TABLE":"vts-conversations"
  }'
```

## トラブルシューティング

### WebSocket接続エラー

```bash
# API Gatewayの確認
aws apigatewayv2 get-apis --query "Items[?Name=='VtsWebSocketApi']"

# ルートの確認
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='VtsWebSocketApi'].ApiId" --output text)
aws apigatewayv2 get-routes --api-id $API_ID

# Lambda関数の確認
aws lambda list-functions --query "Functions[?contains(FunctionName, 'vts')].[FunctionName,State]"
```

### Transcribeエラー

```bash
# カスタム語彙の状態確認
aws transcribe get-vocabulary \
  --vocabulary-name maritime-vts-vocabulary-ja \
  --query "[VocabularyState,FailureReason]"

# サポートされている言語の確認
aws transcribe list-vocabularies --query "Vocabularies[?LanguageCode=='ja-JP']"
```

### Bedrockエラー

```bash
# モデルアクセスの確認
aws bedrock list-foundation-models \
  --query "modelSummaries[?modelId=='anthropic.claude-3-sonnet-20240229-v1:0']"

# モデルアクセス権限の確認
aws bedrock get-foundation-model-access \
  --model-id anthropic.claude-3-sonnet-20240229-v1:0
```

### DynamoDBエラー

```bash
# テーブルの存在確認
aws dynamodb describe-table --table-name vts-conversations
aws dynamodb describe-table --table-name vts-connections

# テーブルのステータス確認
aws dynamodb list-tables --query "TableNames[?contains(@, 'vts')]"
```

### CloudWatch Logsでのデバッグ

```bash
# 最新のエラーログを確認
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-webrtc-signaling \
  --filter-pattern "ERROR" \
  --max-items 10

# メトリクスの確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=vts-webrtc-signaling \
  --start-time 2025-08-13T00:00:00Z \
  --end-time 2025-08-13T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## CI/CDパイプライン

### GitHub Actions設定

`.github/workflows/deploy.yml`を作成：

```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    types: [opened, synchronize]

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}
  AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci --prefix backend
          npm ci --prefix frontend
          npm ci --prefix infrastructure
      
      - name: Run tests
        run: |
          npm test --prefix backend

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install CDK
        run: npm install -g aws-cdk
      
      - name: Deploy infrastructure
        run: |
          cd infrastructure
          npm ci
          cdk deploy VtsInfrastructureStack --require-approval never
```

## 本番環境チェックリスト

### デプロイ前
- [ ] すべてのテストがパス
- [ ] セキュリティスキャン完了
- [ ] 環境変数の確認
- [ ] IAM権限の確認

### デプロイ後
- [ ] WebSocket接続テスト
- [ ] 音声認識テスト
- [ ] AI応答テスト
- [ ] CloudWatch監視設定
- [ ] アラーム設定

### 監視項目
- [ ] Lambda関数のエラー率
- [ ] API Gatewayのレスポンスタイム
- [ ] DynamoDBのスロットリング
- [ ] Transcribeの処理時間
- [ ] Bedrockの応答時間

## ロールバック手順

問題が発生した場合：

```bash
# 前のバージョンにロールバック
cd infrastructure
cdk deploy VtsInfrastructureStack --rollback

# Lambda関数の前のバージョンに戻す
aws lambda update-function-code \
  --function-name vts-webrtc-signaling \
  --s3-bucket your-deployment-bucket \
  --s3-key previous-version.zip
```

## メンテナンス

### 定期メンテナンス

1. **週次**
   - CloudWatch Logsの確認
   - メトリクスの分析
   - コスト確認

2. **月次**
   - セキュリティパッチの適用
   - 依存関係の更新
   - バックアップの確認

3. **四半期**
   - パフォーマンスレビュー
   - アーキテクチャレビュー
   - コスト最適化

### バックアップ

```bash
# DynamoDBのバックアップ
aws dynamodb create-backup \
  --table-name vts-conversations \
  --backup-name vts-conversations-$(date +%Y%m%d)

# S3のバックアップ
aws s3 sync \
  s3://vts-audio-storage-381491903672-ap-northeast-1 \
  s3://vts-backup-381491903672-ap-northeast-1/$(date +%Y%m%d)/
```

## 連絡先

問題が発生した場合の連絡先：

- **開発チーム**: [GitHub Issues](https://github.com/terisuke/maritime-vts-ai/issues)
- **緊急連絡**: AWS Support Console

---

最終更新: 2025-08-13
バージョン: 1.0.0