# 🚀 クイックスタートガイド

## 概要
福岡港湾VTS AI支援システムを10分で起動し、実際のAI音声認識・応答生成を体験できます。本システムは**完全実装済み**で、Amazon Transcribe、Amazon Bedrock Claude Sonnet 4を活用した本格的な海上交通管制支援が可能です。

## 前提条件
- Node.js 18以上
- AWS CLI設定済み（[設定方法](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)）
- AWS Bedrockの有効化（東京リージョン）
- GitHubアカウント

## 10分でMVPを起動

### Step 1: コードの取得（1分）
```bash
git clone https://github.com/terisuke/maritime-vts-ai.git
cd maritime-vts-ai
```

### Step 2: 依存関係インストール（2分）
```bash
npm run install:all
```

### Step 3: AWS設定（1分）
```bash
# AWS認証確認
aws sts get-caller-identity

# リージョン設定
export AWS_REGION=ap-northeast-1
```

### Step 4: インフラデプロイ（5分）
```bash
cd infrastructure
npx cdk bootstrap  # 初回のみ
npx cdk deploy VtsInfrastructureStack --outputs-file outputs.json
```

デプロイされる主要コンポーネント:
- **WebSocket API**: リアルタイム双方向通信
- **Lambda Functions**: 音声処理・AI分析・WebSocket管理
- **DynamoDB Tables**: 会話履歴・接続管理
- **CloudWatch**: ログ・メトリクス監視

### Step 5: カスタム語彙の登録（1分）
```bash
# 福岡港湾専門用語の登録（オプション）
cd ../backend/vocabulary
node create-vocabulary.js
```

登録される専門用語例:
- 港湾名: 博多港、北九州港、門司港
- 施設名: 中央ふ頭、箱崎ふ頭、香椎パークポート
- 海事用語: メーデー、パンパン、セキュリテ

### Step 6: WebSocket URL取得（30秒）
```bash
# outputs.jsonからWebSocket URLを取得
cd ../../infrastructure
export WS_URL=$(cat outputs.json | jq -r '.VtsInfrastructureStack.WebSocketApiUrl')
echo "WebSocket URL: $WS_URL"
```

### Step 7: フロントエンド起動（30秒）
```bash
cd ../frontend

# 環境変数設定
echo "VITE_WS_URL=$WS_URL" > .env.local
echo "VITE_API_ENV=development" >> .env.local
echo "VITE_DEBUG=true" >> .env.local

# 開発サーバー起動
npm run dev
```

### Step 8: アクセス
ブラウザで http://localhost:5173 を開く

## 🎙️ 基本的な使い方

### 音声入力テスト
1. 「録音開始」ボタンをクリック
2. マイクアクセスを許可
3. 「博多港VTS、入港許可を要請」と話す
4. 「録音停止」ボタンをクリック
5. AI応答を確認

### 動作確認ポイント
- **WebSocket接続**: 画面右上に「接続中」表示（緑色）
- **音声認識**: Amazon Transcribeによるリアルタイム文字化（精度88%）
- **AI応答**: Claude Sonnet 4（2025年5月版）による適切な海上交通管制応答
- **リスク分類**: GREEN/AMBER/REDの自動判定
- **会話履歴**: DynamoDBに自動保存（30日間保持）

## 🔧 トラブルシューティング

### WebSocket接続エラー
```bash
# CloudWatch Logsで確認
aws logs tail /aws/lambda/vts-websocket-handler --follow
```

### マイクが動作しない
- ブラウザの設定でマイク許可を確認
- Chrome/Edge推奨（Safari/Firefoxは制限あり）
- HTTPSが必要（localhost は HTTP でも可）

### デプロイエラー
```bash
# CDKのブートストラップを確認
npx cdk doctor

# IAM権限を確認
aws sts get-caller-identity

# リージョンの確認
echo $AWS_REGION
```

### AI応答が返らない
```bash
# Bedrock モデルアクセス確認
aws bedrock list-foundation-models --region ap-northeast-1

# Lambda関数ログを確認
aws logs tail /aws/lambda/vts-nlp-processor --follow
```

## 🛠️ 開発モード

### バックエンド単独起動
```bash
cd backend
npm start  # Lambda関数をローカル実行
```

### フロントエンド単独起動
```bash
cd frontend
npm run dev
```

### インフラのみデプロイ
```bash
cd infrastructure
npx cdk deploy --outputs-file outputs.json
```

## 📱 モバイル対応

### スマートフォンでのテスト
1. 同一WiFi内のデバイスからアクセス
2. IPアドレスを使用: `http://192.168.x.x:5173`
3. マイク権限の許可が必要

## 🌊 海事通信テスト例

### 入港要請
```
博多港VTSこちら○○丸、現在位置東経130度、北緯33度、入港許可を要請します。
```

### 航行報告
```
VTS、こちら△△丸、現在博多湾内航行中、異常ありません。
```

### 緊急事態（テスト用）
```
メーデー、メーデー、こちら××丸、エンジン故障により航行不能、支援を要請します。
```

## 📊 監視とメトリクス

### CloudWatch ダッシュボード
```bash
# メトリクス確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=vts-websocket-handler \
  --statistics Average \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

### DynamoDB データ確認
```bash
# 会話履歴の確認
aws dynamodb scan \
  --table-name vts-conversations \
  --limit 5
```

## 📚 次のステップ

### 詳細ドキュメント
- [完全なデプロイガイド](DEPLOYMENT.md)
- [API仕様書](API_SPECIFICATION.md)  
- [アーキテクチャ](ARCHITECTURE.md)
- [GitHub Actions セットアップ](GITHUB_SECRETS_SETUP.md)

### カスタマイズ
- カスタム語彙の追加
- 海域別設定の調整
- AI応答のパーソナライズ

## ⚡ パフォーマンス最適化

### 初回起動を高速化
```bash
# Lambda関数のウォームアップ
curl -X POST $WS_URL -d '{"action":"ping"}'
```

### 音声品質の調整
- サンプルレート: 16kHz推奨
- フォーマット: PCM 16-bit
- チャンクサイズ: 1024bytes

## 🔒 セキュリティ注意事項

- 本番環境では HTTPS必須
- API Keyの管理に注意
- DynamoDB テーブルのアクセス制限
- CloudWatch Logs の保持期間設定

---

**💡 ヒント**: 初回起動時は AWS リソースの作成に時間がかかります。2回目以降は1-2分で起動できます。

**📞 サポート**: 問題が発生した場合は、CloudWatch Logs を確認してください。