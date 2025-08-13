# AI海上管制官サポートシステム (Maritime VTS AI Support System)

## 🚢 概要
本プロジェクトは、船舶交通サービス（VTS）オペレーターを支援するAIシステムのMVP実装です。
VHF無線通信のリアルタイム文字起こし、意図解釈、応答案生成により、海上交通の安全性向上を目指します。

## 🏗 アーキテクチャ
- **音声認識**: Amazon Transcribe (カスタム語彙・言語モデル対応)
- **NLP/AI**: Amazon Bedrock (Claude)
- **ストリーミング**: WebRTC + Amazon Kinesis Video Streams
- **バックエンド**: AWS Lambda + API Gateway (サーバーレス)
- **データストア**: Amazon DynamoDB + Amazon Timestream
- **IaC**: AWS CDK (TypeScript)
- **CI/CD**: GitHub Actions + OIDC

## 📁 プロジェクト構造
```
maritime-vts-ai/
├── infrastructure/     # AWS CDKインフラ定義
├── backend/           # Lambda関数とバックエンドロジック
├── frontend/          # Web UIアプリケーション
├── docs/              # ドキュメント
└── .github/           # GitHub Actions設定
```

## 🚀 セットアップ

### 前提条件
- Node.js 18以上
- AWS CLI設定済み
- AWS CDK CLI (`npm install -g aws-cdk`)

### 初期設定
```bash
# 依存関係のインストール
npm install

# CDKブートストラップ
cd infrastructure
cdk bootstrap
```

## 📋 開発ロードマップ

### Phase 1: Crawl (リスナー)
- [ ] 音声入力パイプライン構築
- [ ] Amazon Transcribeベースライン実装
- [ ] データ収集基盤構築

### Phase 2: Walk (ナビゲーター)
- [ ] カスタム語彙・言語モデル適用
- [ ] AISデータ連携
- [ ] AI意思決定支援

### Phase 3: Run (監視付き自動操舵)
- [ ] 限定的自動応答
- [ ] 安全性検証

## 📝 ライセンス
[ライセンス情報を追加]

## 👥 貢献者
[貢献者情報を追加]
