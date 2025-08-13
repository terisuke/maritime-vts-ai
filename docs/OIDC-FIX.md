# OIDC認証エラー修正ガイド

## 問題

GitHub ActionsからAWSへのOIDC認証が失敗しています。

```
Error: Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

## 原因

IAMロールの信頼関係がGitHub Actionsのmainブランチpushイベントに対応していません。

## 修正方法

### Option 1: IAMロール信頼関係を修正（推奨）

1. AWS ConsoleでIAMロール `GitHubActionsRole` を開く
2. 「信頼関係」タブを選択
3. 「信頼関係を編集」をクリック
4. 以下のポリシーに更新：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::381491903672:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:terisuke/maritime-vts-ai:ref:refs/heads/main",
            "repo:terisuke/maritime-vts-ai:ref:refs/heads/*"
          ]
        }
      }
    }
  ]
}
```

### Option 2: 手動デプロイ（一時対応）

```bash
# ローカル環境で実行
cd infrastructure
aws configure # AWS認証情報を設定
npx cdk deploy --all --require-approval never
```

### Option 3: AWS Access Keysを使用（非推奨）

GitHub Secretsに以下を追加：
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

ワークフローを更新：
```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ env.AWS_REGION }}
```

## 推奨対応

1. **即時**: Option 2の手動デプロイを実行
2. **本日中**: Option 1のIAMロール修正
3. **避ける**: Option 3のAccess Keys使用

## 確認コマンド

```bash
# デプロイ状態確認
aws cloudformation describe-stacks \
  --stack-name VtsInfrastructureStack \
  --query 'Stacks[0].StackStatus'

# WebSocket API確認
aws apigatewayv2 get-apis \
  --query 'Items[?Name==`vts-websocket-api`]'
```