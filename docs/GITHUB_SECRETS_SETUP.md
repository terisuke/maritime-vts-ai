# GitHub Secrets 設定レポート

## 📋 調査結果サマリー

開発チームが調査した結果、以下の値をGitHub Secretsに設定する必要があります。

## 🔐 設定すべきRepository Secrets

### AWS関連
| Secret名 | 値 | 備考 |
|---------|-----|------|
| `AWS_ACCOUNT_ID` | `381491903672` | 現在のAWSアカウントID |
| `AWS_REGION` | `ap-northeast-1` | 東京リージョン |
| `AWS_ACCESS_KEY_ID` | **要作成** | デプロイ用IAMユーザーのアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | **要作成** | デプロイ用IAMユーザーのシークレットキー |

### WebSocket・API関連
| Secret名 | 値 | 備考 |
|---------|-----|------|
| `WEBSOCKET_ENDPOINT` | `wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod` | 現在のWebSocket URL |
| `TRANSCRIBE_VOCABULARY_NAME` | `maritime-vts-vocabulary-ja` | カスタム語彙名 |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Claude 3 Sonnet モデルID |

### DynamoDB・S3関連
| Secret名 | 値 | 備考 |
|---------|-----|------|
| `CONVERSATIONS_TABLE` | `vts-conversations` | 会話管理テーブル |
| `CONNECTIONS_TABLE` | `vts-connections` | 接続管理テーブル |
| `AUDIO_BUCKET` | `vts-audio-storage-381491903672-ap-northeast-1` | 音声ファイル保存用S3バケット |

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

## 🚨 要対応事項

### 1. IAMユーザー作成が必要

デプロイ用のIAMユーザーを作成し、以下の権限を付与する必要があります：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigatewayv2:*",
        "dynamodb:*",
        "s3:*",
        "iam:*",
        "logs:*",
        "transcribe:*",
        "bedrock:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. GitHub設定手順

1. リポジトリ: https://github.com/terisuke/maritime-vts-ai
2. Settings → Secrets and variables → Actions
3. 上記の各Secretを追加

### 3. WebSocket URLの確認

現在使用中のWebSocket URL (`wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod`) が有効か確認が必要です。

```bash
# 確認コマンド
aws apigatewayv2 get-apis --query "Items[?Name=='VtsWebSocketApi']"
```

## 📝 実装済み項目の確認

- ✅ AWSアカウントID: 確認済み
- ✅ リージョン: ap-northeast-1で統一
- ✅ DynamoDBテーブル名: インフラコードから取得
- ✅ S3バケット名: アカウントIDとリージョンを含む形式
- ✅ Bedrockモデル: Claude 3 Sonnet使用
- ✅ カスタム語彙名: 統一済み

## 🔧 推奨される追加設定

### CloudWatch Logs設定
| Secret名 | 推奨値 |
|---------|--------|
| `LOG_RETENTION_DAYS` | `30` |
| `LOG_LEVEL` | `INFO` |

### セキュリティ設定
| Secret名 | 推奨値 |
|---------|--------|
| `ENABLE_XRAY` | `true` |
| `ENABLE_METRICS` | `true` |

## 📊 現在のプロジェクト構成

```
GitHub Organization: terisuke
Repository: maritime-vts-ai
Branch: feature/sprint-2-frontend (main branch)
AWS Account: 381491903672
Region: ap-northeast-1
```

## ✅ チェックリスト

開発チームが確認すべき項目：

- [ ] IAMユーザー作成
- [ ] アクセスキー生成
- [ ] GitHub Secretsへの登録
- [ ] WebSocket URLの動作確認
- [ ] Environment設定の追加
- [ ] GitHub Actions権限確認

## 🎯 次のステップ

1. **IAMユーザー作成**
   ```bash
   aws iam create-user --user-name github-actions-deploy
   aws iam attach-user-policy --user-name github-actions-deploy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   aws iam create-access-key --user-name github-actions-deploy
   ```

2. **生成されたアクセスキーをGitHub Secretsに登録**

3. **GitHub Actionsワークフローの有効化**

---

報告者: 開発チーム
日時: 2025-08-13
ステータス: 調査完了・設定待ち