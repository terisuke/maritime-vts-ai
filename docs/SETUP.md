# 開発環境セットアップガイド

## 📋 前提条件

1. **必要なツール**
   - Node.js v18以上
   - npm または yarn
   - AWS CLI v2
   - Git

2. **AWSアカウント**
   - 有効なAWSアカウント
   - 適切な権限を持つIAMユーザーまたはロール

3. **GitHubアカウント**
   - リポジトリの作成権限

## 🚀 セットアップ手順

### 1. AWS CLIの設定

```bash
# AWS CLIの設定
aws configure

# 以下を入力：
# AWS Access Key ID: [your-access-key]
# AWS Secret Access Key: [your-secret-key]
# Default region name: ap-northeast-1
# Default output format: json

# 設定確認
aws sts get-caller-identity
```

### 2. プロジェクトの初期化

```bash
# プロジェクトディレクトリに移動
cd /Users/teradakousuke/Developer/maritime-vts-ai

# 依存関係のインストール
npm install

# CDKのインストール（グローバル）
npm install -g aws-cdk

# CDKバージョン確認
cdk --version
```

### 3. CDKブートストラップ

**重要**: CDKを初めて使用する場合、またはリージョンで初めて使用する場合は必須です。

```bash
# infrastructureディレクトリに移動
cd infrastructure

# 依存関係のインストール
npm install

# CDKブートストラップ（初回のみ）
npx cdk bootstrap aws://[YOUR-ACCOUNT-ID]/ap-northeast-1

# または環境変数が設定されている場合
npx cdk bootstrap
```

### 4. GitHub リポジトリの作成

1. GitHubで新しいリポジトリを作成
   - リポジトリ名: `maritime-vts-ai`
   - Public/Privateを選択

2. ローカルリポジトリの初期化
```bash
cd /Users/teradakousuke/Developer/maritime-vts-ai
git init
git add .
git commit -m "Initial commit: Project structure and CDK setup"
git branch -M main
git remote add origin https://github.com/[YOUR-GITHUB-USERNAME]/maritime-vts-ai.git
git push -u origin main
```

### 5. OIDC Provider のデプロイ（GitHub Actions連携）

```bash
# 環境変数の設定
export GITHUB_ORG="[YOUR-GITHUB-USERNAME]"
export GITHUB_REPO="maritime-vts-ai"

# OIDC Providerスタックのデプロイ
cd infrastructure
npx cdk deploy VtsOidcProviderStack

# デプロイ完了後、出力されたRoleのARNをメモ
# 例: arn:aws:iam::123456789012:role/github-actions-maritime-vts-role
```

### 6. GitHub Secretsの設定

1. GitHubリポジトリの Settings → Secrets and variables → Actions
2. 「New repository secret」をクリック
3. 以下のシークレットを追加：
   - Name: `AWS_ROLE_ARN`
   - Value: 上記でメモしたRole ARN

### 7. メインインフラのデプロイ

```bash
# ローカルから手動でデプロイ（テスト用）
cd infrastructure
npx cdk deploy VtsInfrastructureStack

# または、GitHub Actionsから自動デプロイ
# mainブランチにpushすると自動的にデプロイされます
```

## 🔍 動作確認

### CDKスタックの確認
```bash
# スタック一覧
npx cdk list

# スタックの差分確認
npx cdk diff VtsInfrastructureStack

# CloudFormationテンプレートの生成（デプロイなし）
npx cdk synth VtsInfrastructureStack
```

### AWSリソースの確認
```bash
# CloudFormationスタック
aws cloudformation list-stacks --region ap-northeast-1

# DynamoDBテーブル
aws dynamodb list-tables --region ap-northeast-1

# Lambda関数
aws lambda list-functions --region ap-northeast-1
```

## 🛠 トラブルシューティング

### CDKブートストラップエラー
```bash
# 既存のブートストラップスタックを更新
npx cdk bootstrap --force
```

### 権限エラー
```bash
# IAMポリシーの確認
aws iam get-user
aws iam list-attached-user-policies --user-name [YOUR-IAM-USER]
```

### GitHub Actions エラー
- Secretsが正しく設定されているか確認
- OIDCプロバイダーのTrust Relationshipを確認

## 📝 次のステップ

1. **Lambda関数の実装**
   - `/backend` ディレクトリに実際のコードを実装
   - Transcribe/Bedrock連携コードの作成

2. **フロントエンドの開発**
   - `/frontend` ディレクトリにReact/Vue.jsアプリを構築
   - WebSocketクライアントの実装

3. **WebRTC/Kinesis統合**
   - オンプレミス側のRoIPゲートウェイ設定
   - Kinesis Video Streams設定

## 📚 参考資料

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/)
- [Amazon Transcribe Documentation](https://docs.aws.amazon.com/transcribe/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [GitHub Actions with OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
