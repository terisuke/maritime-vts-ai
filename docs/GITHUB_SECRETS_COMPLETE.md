# GitHub Secrets 設定ガイド - 完全版

## ✅ IAMユーザー作成完了

以下のIAMユーザーとアクセスキーが作成されました。これらの値をGitHub Secretsに設定してください。

## 🔐 設定すべきRepository Secrets - 最終版

### AWS関連（作成済み）

| Secret名 | 値 | ステータス |
|---------|-----|-----------|
| `AWS_ACCOUNT_ID` | `381491903672` | ✅ 確認済み |
| `AWS_REGION` | `ap-northeast-1` | ✅ 確認済み |
| `AWS_ACCESS_KEY_ID` | **`.aws-setup/github-secrets-values.txt`を参照** | ✅ 作成済み |
| `AWS_SECRET_ACCESS_KEY` | **`.aws-setup/github-secrets-values.txt`を参照** | ✅ 作成済み |

### WebSocket・API関連

| Secret名 | 値 | ステータス |
|---------|-----|-----------|
| `WEBSOCKET_ENDPOINT` | `wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod` | ✅ 確認済み |
| `TRANSCRIBE_VOCABULARY_NAME` | `maritime-vts-vocabulary-ja` | ✅ 確認済み |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | ✅ 確認済み |

### DynamoDB・S3関連

| Secret名 | 値 | ステータス |
|---------|-----|-----------|
| `CONVERSATIONS_TABLE` | `vts-conversations` | ✅ 確認済み |
| `CONNECTIONS_TABLE` | `vts-connections` | ✅ 確認済み |
| `AUDIO_BUCKET` | `vts-audio-storage-381491903672-ap-northeast-1` | ✅ 確認済み |

## 🌍 Environment Secrets

### Production環境
環境名: `production`

| Secret名 | 値 |
|---------|-----|
| `VITE_WS_URL` | `wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod` |
| `VITE_API_ENV` | `production` |
| `VITE_DEBUG` | `false` |

### Staging環境
環境名: `staging`

| Secret名 | 値 |
|---------|-----|
| `VITE_WS_URL` | `wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod` |
| `VITE_API_ENV` | `staging` |
| `VITE_DEBUG` | `true` |

## 📝 IAMユーザー詳細

### 作成済みユーザー情報
- **ユーザー名**: `github-actions-vts-deploy`
- **ARN**: `arn:aws:iam::381491903672:user/github-actions-vts-deploy`
- **作成日時**: 2025-08-13T17:20:01+00:00
- **ポリシー**: `VTSGitHubDeployPolicy` (アタッチ済み)

### アタッチされたポリシー権限
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationFullAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*"
      ],
      "Resource": [
        "arn:aws:cloudformation:ap-northeast-1:381491903672:stack/VtsInfrastructureStack/*",
        "arn:aws:cloudformation:ap-northeast-1:381491903672:stack/CDKToolkit/*"
      ]
    },
    {
      "Sid": "LambdaDeployAccess",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:ListFunctions",
        "lambda:DeleteFunction",
        "lambda:TagResource",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:ap-northeast-1:381491903672:function:vts-*"
    },
    {
      "Sid": "APIGatewayDeployAccess",
      "Effect": "Allow",
      "Action": [
        "apigatewayv2:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DynamoDBDeployAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:ListTables",
        "dynamodb:TagResource"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-1:381491903672:table/vts-*"
      ]
    },
    {
      "Sid": "S3DeployAccess",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:PutBucketPolicy",
        "s3:GetBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutBucketEncryption",
        "s3:PutLifecycleConfiguration",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::vts-*",
        "arn:aws:s3:::vts-*/*",
        "arn:aws:s3:::cdk-*",
        "arn:aws:s3:::cdk-*/*"
      ]
    },
    {
      "Sid": "IAMRoleManagement",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::381491903672:role/VtsInfrastructureStack-*",
        "arn:aws:iam::381491903672:policy/VtsInfrastructureStack-*"
      ]
    },
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:TagResource"
      ],
      "Resource": "arn:aws:logs:ap-northeast-1:381491903672:log-group:/aws/lambda/vts-*"
    }
  ]
}
```

## 🚀 GitHub設定手順

### 1. GitHub Secretsの設定

1. リポジトリにアクセス: https://github.com/terisuke/maritime-vts-ai
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** をクリック
4. 上記の各Secretを追加

### 2. アクセスキーの値を取得

```bash
# ローカルファイルから値を確認
cat .aws-setup/github-secrets-values.txt
```

⚠️ **重要**: アクセスキーは一度だけ表示されます。必ずGitHub Secretsに保存してください。

### 3. 設定の確認

GitHub ActionsでSecretsが正しく設定されているか確認：

```yaml
# .github/workflows/test-secrets.yml
name: Test Secrets
on: workflow_dispatch
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Check Secrets
        run: |
          echo "AWS_ACCOUNT_ID is set: ${{ secrets.AWS_ACCOUNT_ID != '' }}"
          echo "AWS_REGION is set: ${{ secrets.AWS_REGION != '' }}"
          echo "AWS_ACCESS_KEY_ID is set: ${{ secrets.AWS_ACCESS_KEY_ID != '' }}"
          echo "AWS_SECRET_ACCESS_KEY is set: ${{ secrets.AWS_SECRET_ACCESS_KEY != '' }}"
```

## ✅ 完了チェックリスト

- [x] IAMユーザー作成 (`github-actions-vts-deploy`)
- [x] デプロイポリシーアタッチ (`VTSGitHubDeployPolicy`)
- [x] アクセスキー生成
- [ ] GitHub Secretsへの登録（手動で実施）
- [ ] GitHub Actions権限確認
- [ ] テストワークフロー実行

## 🔧 トラブルシューティング

### アクセスキーを紛失した場合

```bash
# 新しいアクセスキーを生成
aws iam create-access-key --user-name github-actions-vts-deploy

# 古いアクセスキーを無効化
aws iam update-access-key \
  --user-name github-actions-vts-deploy \
  --access-key-id OLD_ACCESS_KEY_ID \
  --status Inactive

# 古いアクセスキーを削除
aws iam delete-access-key \
  --user-name github-actions-vts-deploy \
  --access-key-id OLD_ACCESS_KEY_ID
```

### 権限エラーが発生した場合

```bash
# ポリシーの確認
aws iam get-user-policy \
  --user-name github-actions-vts-deploy \
  --policy-name VTSGitHubDeployPolicy

# CloudFormationスタックの権限確認
aws cloudformation describe-stack-resources \
  --stack-name VtsInfrastructureStack
```

## 📊 現在のプロジェクト構成

```
GitHub Organization: terisuke
Repository: maritime-vts-ai
Branch: feature/sprint-2-frontend (main branch)
AWS Account: 381491903672
Region: ap-northeast-1
IAM User: github-actions-vts-deploy
```

## 🎯 次のステップ

1. **GitHub Secretsの手動設定**
   - `.aws-setup/github-secrets-values.txt` から値をコピー
   - GitHubリポジトリのSecretsに登録

2. **GitHub Actionsワークフローの有効化**
   - `.github/workflows/deploy.yml` を作成
   - mainブランチへのプッシュで自動デプロイ

3. **本番環境デプロイ**
   ```bash
   cd infrastructure
   npx cdk deploy VtsInfrastructureStack
   ```

---

**作成者**: 開発チーム  
**作成日時**: 2025-08-13  
**ステータス**: ✅ IAMユーザー作成完了・GitHub Secrets設定待ち  
**ファイル**: `docs/GITHUB_SECRETS_COMPLETE.md`