import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface OidcProviderStackProps extends cdk.StackProps {
  githubOrg: string;
  githubRepo: string;
}

export class OidcProviderStack extends cdk.Stack {
  public readonly deploymentRole: iam.Role;

  constructor(scope: Construct, id: string, props: OidcProviderStackProps) {
    super(scope, id, props);

    // GitHub OIDC Provider
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
      clientIds: ['sts.amazonaws.com'],
    });

    // GitHub Actions用のIAMロール
    this.deploymentRole = new iam.Role(this, 'GitHubActionsDeploymentRole', {
      roleName: 'github-actions-maritime-vts-role',
      assumedBy: new iam.OpenIdConnectPrincipal(githubProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${props.githubOrg}/${props.githubRepo}:*`,
          ],
        },
      }),
      description: 'Role for GitHub Actions to deploy Maritime VTS AI System',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // CDKデプロイに必要な権限を付与
    // CDK v2のブートストラップロールへのAssumeRole権限
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*`,
        ],
      })
    );

    // CloudFormationへの権限
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:ValidateTemplate',
          'cloudformation:CreateChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:ExecuteChangeSet',
        ],
        resources: ['*'],
      })
    );

    // S3への権限（CDKアセット用）
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetBucketLocation',
          's3:CreateBucket',
        ],
        resources: [
          `arn:aws:s3:::cdk-*`,
        ],
      })
    );

    // SSMパラメータストアへの権限（CDKコンテキスト用）
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:PutParameter',
        ],
        resources: ['*'],
      })
    );

    // 出力
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: this.deploymentRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions',
      exportName: 'GitHubActionsRoleArn',
    });

    new cdk.CfnOutput(this, 'GitHubOidcProviderArn', {
      value: githubProvider.openIdConnectProviderArn,
      description: 'ARN of the GitHub OIDC Provider',
      exportName: 'GitHubOidcProviderArn',
    });
  }
}
