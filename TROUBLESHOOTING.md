# Maritime VTS AI - 音声文字起こしシステム問題分析レポート

## 現在の状況
**2025年8月14日時点**

### ✅ 解決済み
1. フロントエンド音声キャプチャ（AudioWorklet実装）
2. WebSocket接続確立
3. 音声データのBase64エンコード・送信
4. バックエンドでの音声データ受信
5. CloudFront/S3デプロイメント

### ❌ 未解決の重大な問題

#### 1. Amazon Transcribeが文字起こしを返さない
**症状**：
- 音声データは送信されている（chunksProcessed > 0）
- Transcribeセッションは開始される
- しかし、文字起こし結果が一切返ってこない

**考えられる原因**：
- PCMフォーマットの不一致（16bit, 16kHz, モノラル）
- 音声データの品質が低すぎる
- Transcribeの日本語モデルの問題
- ストリーミングAPIの使用方法の誤り

#### 2. AudioWorkletの状態管理問題
**症状**：
- `currentIsRecording: false` が常にログに出力される
- 録音状態のフラグが正しく管理されていない

#### 3. Lambda関数の並列実行問題
**症状**：
- 複数のLambdaインスタンスが独立して実行
- セッション管理が分散している
- 同時接続制限（25ストリーム）にすぐ到達

## 技術的課題

### 1. 複雑すぎるアーキテクチャ
```
Browser → AudioWorklet → WebSocket → API Gateway → Lambda → Transcribe
```
- 各レイヤーでの変換・エンコーディングが複雑
- デバッグが極めて困難
- レイテンシーの蓄積

### 2. 不適切な技術選択の可能性
- WebSocketとTranscribe Streamingの組み合わせは過度に複雑
- Lambda関数でのステートフル処理は本来不適切

## 代替ソリューションの提案

### オプション1: Amazon Transcribe WebSocket API（直接接続）
**利点**：
- ブラウザから直接Transcribeに接続
- 中間層を削減
- AWS公式のSDKサポート

**実装例**：
```javascript
// AWS Transcribe WebSocket直接接続
import { TranscribeStreamingClient } from "@aws-sdk/client-transcribe-streaming";
```

### オプション2: Amazon Chime SDK
**利点**：
- 音声・ビデオ通信用の完全なフレームワーク
- Transcribeとの統合が組み込み済み
- WebRTCベースで信頼性が高い

**ドキュメント**：
https://aws.amazon.com/jp/chime/chime-sdk/

### オプション3: Amazon Connect + Contact Lens
**利点**：
- コールセンター向けの完全なソリューション
- リアルタイム文字起こし機能内蔵
- 感情分析も可能

### オプション4: AWS Amplify + Predictions
**利点**：
- フロントエンド開発用の統合フレームワーク
- Transcribeとの簡単な統合
- 認証・API・ストレージも統合

**実装例**：
```javascript
import { Predictions } from '@aws-amplify/predictions';

// 音声を文字に変換
Predictions.convert({
  transcription: {
    source: {
      bytes: audioBuffer
    },
    language: "ja-JP"
  }
});
```

### オプション5: サードパーティソリューション

#### 1. AssemblyAI
- シンプルなREST API
- 日本語サポート
- WebSocketストリーミング対応

#### 2. Deepgram
- 超低レイテンシー
- 優れた日本語認識
- WebSocket API

#### 3. Google Cloud Speech-to-Text
- 高精度な日本語認識
- ストリーミングAPI
- 豊富なドキュメント

## 推奨される次のステップ

### 短期的解決策（現在のシステムを修正）
1. **Transcribeの直接テスト**
   - AWS CLIでPCMファイルを直接送信してテスト
   - フォーマットの確認

2. **Lambda関数のシンプル化**
   - ステートレスな設計に変更
   - DynamoDBでセッション管理

### 長期的解決策（アーキテクチャ変更）

#### 推奨: AWS Amplify + Predictions
**理由**：
1. 開発速度が速い
2. AWSのベストプラクティスに準拠
3. メンテナンスが容易
4. ドキュメントが充実

**実装ステップ**：
```bash
# Amplifyプロジェクトの初期化
amplify init

# Predictions（文字起こし）の追加
amplify add predictions

# デプロイ
amplify push
```

## コスト比較

| ソリューション | 月額コスト（推定） | 複雑度 | 信頼性 |
|------------|--------------|-------|--------|
| 現在のシステム | $50-100 | 高 | 低 |
| Amplify + Predictions | $30-60 | 低 | 高 |
| Amazon Chime SDK | $100-200 | 中 | 高 |
| AssemblyAI | $99〜 | 低 | 高 |

## 結論

現在のシステムは技術的に複雑すぎ、デバッグとメンテナンスが困難です。

**即座の推奨事項**：
1. AWS Amplify + Predictionsへの移行を検討
2. または、Amazon Chime SDKの採用
3. 最小限の実装で動作確認を優先

**理由**：
- 車輪の再発明を避ける
- AWSの公式ソリューションを活用
- 開発・運用コストの削減
- 信頼性の向上

## 参考リンク

- [AWS Amplify Predictions](https://docs.amplify.aws/lib/predictions/getting-started/q/platform/js/)
- [Amazon Chime SDK](https://docs.aws.amazon.com/chime-sdk/latest/dg/what-is-chime-sdk.html)
- [Amazon Transcribe Streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [AssemblyAI Streaming](https://www.assemblyai.com/docs/guides/real-time-streaming-transcription)