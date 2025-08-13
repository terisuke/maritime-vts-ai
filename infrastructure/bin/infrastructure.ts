#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OidcProviderStack } from '../lib/oidc-provider-stack';
import { VtsInfrastructureStack } from '../lib/vts-infrastructure-stack';

const app = new cdk.App();

// AWS環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1', // 東京リージョンをデフォルト
};

// OIDC Provider Stack (GitHub Actions連携用)
// これは最初に一度だけデプロイ
new OidcProviderStack(app, 'VtsOidcProviderStack', {
  env,
  description: 'OIDC Provider for GitHub Actions - Maritime VTS AI System',
  githubOrg: process.env.GITHUB_ORG || 'terisuke', // 正しいGitHubユーザー名に修正
  githubRepo: process.env.GITHUB_REPO || 'maritime-vts-ai',
});

// メインインフラストラクチャスタック
new VtsInfrastructureStack(app, 'VtsInfrastructureStack', {
  env,
  description: 'Main Infrastructure for Maritime VTS AI System MVP',
});

app.synth();
