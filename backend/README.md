# VTS Backend Lambda Functions

## 概要

海上管制官サポートシステムのバックエンドLambda関数実装。WebSocket通信、音声文字起こし、AI処理を担当します。

## 実装完了内容（Sprint 1）

### ✅ Phase 1: WebSocket基盤実装

#### 1. 接続管理機能
- [x] クライアント接続時にconnectionIdをDynamoDBに保存
- [x] 切断時に該当レコードを削除
- [x] 接続メタデータ（接続時刻、クライアントIP等）を記録
- [x] TTL設定による自動削除（24時間）
- [x] 接続健全性チェック機能（5分間のアクティビティ監視）

#### 2. メッセージルーティング
- [x] メッセージタイプによる振り分け実装
  - `message`: 通常メッセージ
  - `startTranscription`: 文字起こし開始
  - `stopTranscription`: 文字起こし停止
  - `audioData`: 音声データ処理
  - `ping`: 接続維持
- [x] エラーハンドリング（不正なメッセージ形式）
- [x] CloudWatch Logsへの監査ログ出力

### ✅ Phase 2: Transcribe連携準備

#### 1. 音声ストリーム受信
- [x] Base64エンコードされた音声データの受信
- [x] S3への音声ファイル保存（デバッグ用）

#### 2. Transcribe SDK統合
- [x] AWS SDK for Transcribe Streaming初期化
- [x] ストリーミングセッション管理
- [x] エラーリトライ機構（SDK内蔵の最大3回）

## ディレクトリ構造

```
backend/
├── lambda/
│   ├── websocket-handler/      # WebSocket接続管理
│   │   ├── index.js            # メインハンドラー
│   │   ├── connection-manager.js # 接続管理
│   │   ├── message-router.js   # メッセージルーティング
│   │   └── package.json
│   ├── transcription-handler/  # 音声文字起こし処理
│   │   ├── index.js            # メインハンドラー
│   │   ├── transcribe-client.js # Transcribeクライアント
│   │   └── package.json
│   └── shared/                 # 共通ユーティリティ
│       ├── dynamodb-client.js  # DynamoDBクライアント
│       └── logger.js           # 構造化ログ出力
├── tests/
│   └── websocket-handler.test.js # 単体テスト
└── package.json
```

## テーブル設計

### vts-connections テーブル
```
PK: connectionId (String)
Attributes:
- connectedAt (String)
- status (String) - CONNECTED/DISCONNECTED
- clientIp (String)
- userAgent (String)
- lastActivity (String)
- ttl (Number) - TTL属性

GSI:
- StatusIndex
  - PK: status
  - SK: connectedAt
```

### vts-conversations テーブル
```
PK: ConversationID (String)
SK: ItemTimestamp (String)
Attributes:
- ItemType (String) - MESSAGE/TRANSCRIPTION/SESSION
- ConnectionID (String)
- TranscriptText (String)
- Confidence (Number)
- Status (String)
```

## 環境変数

Lambda関数に必要な環境変数：

```
CONVERSATIONS_TABLE=vts-conversations
CONNECTIONS_TABLE=vts-connections
AUDIO_BUCKET=vts-audio-storage-{account}-{region}
WEBSOCKET_ENDPOINT=https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
VHF_LOG_GROUP=/aws/vts/vhf-communications
TRANSCRIPTION_LOG_GROUP=/aws/vts/transcriptions
LOG_LEVEL=INFO
```

## 品質メトリクス

### 実装済み
- ✅ 構造化ログ出力（JSON形式）
- ✅ CloudWatchメトリクス送信
- ✅ 監査ログ記録
- ✅ エラーハンドリング
- ✅ リトライ機構

### パフォーマンス目標
- レスポンス時間: 95パーセンタイルで500ms以内
- エラー率: 0.1%未満
- 同時接続数: 100接続まで対応

## テスト実行

```bash
# 単体テスト実行
npm test

# カバレッジレポート生成
npm run test:coverage

# ウォッチモード
npm run test:watch
```

### テストカバレッジ目標
- ステートメント: 80%以上
- ブランチ: 80%以上
- 関数: 80%以上
- 行: 80%以上

## デプロイメント

Lambda関数はAWS CDKによって自動デプロイされます：

```bash
# インフラストラクチャのデプロイ
cd ../infrastructure
npm run deploy
```

## 監視とログ

### CloudWatch Logs
- `/aws/lambda/vts-websocket-handler` - WebSocket処理ログ
- `/aws/lambda/vts-transcription-processor` - 文字起こし処理ログ
- `/aws/vts/vhf-communications` - VHF通信ログ
- `/aws/vts/transcriptions` - 文字起こし結果ログ

### CloudWatch メトリクス
- `WebSocketConnections` - 接続数
- `WebSocketResponseTime` - レスポンス時間
- `MessagesProcessed` - 処理メッセージ数
- `TranscriptionSessionsStarted` - 開始セッション数
- `AudioDataProcessed` - 処理音声データ量

## 次のステップ（Phase 3実装予定）

1. **Transcribe カスタム語彙**
   - 海事専門用語の追加
   - 船舶名、港湾名の認識精度向上

2. **AISデータ統合**
   - 船舶位置情報との連携
   - リアルタイム船舶追跡

3. **Bedrock AI処理**
   - 意図分類（GREEN/YELLOW/RED）
   - 応答候補生成
   - 安全性チェック

4. **WebRTC音声ストリーミング**
   - Kinesis Video Streamsとの連携
   - リアルタイム音声処理

## トラブルシューティング

### 接続エラー
- CloudWatch Logsで`/aws/lambda/vts-websocket-handler`を確認
- DynamoDB `vts-connections`テーブルの接続状態を確認

### 文字起こしエラー
- Transcribe APIの権限を確認
- 音声フォーマット（16kHz, 16bit, mono）を確認

### パフォーマンス問題
- Lambda関数のメモリ設定を調整（現在: 512MB〜2048MB）
- 同時実行数の制限を確認