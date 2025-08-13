/**
 * API Construct
 * API Gateway WebSocketとルートの管理
 */

import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { VtsConfiguration } from '../config';

export interface ApiConstructProps {
  readonly environment: string;
  readonly webSocketHandler: lambda.Function;
}

export class ApiConstruct extends Construct {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly webSocketUrl: string;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    // WebSocket API作成
    this.webSocketApi = this.createWebSocketApi(props);
    
    // ステージ作成
    this.webSocketStage = this.createWebSocketStage(props);
    
    // URLの構築
    this.webSocketUrl = `wss://${this.webSocketApi.apiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/${this.webSocketStage.stageName}`;

    // Lambda関数にAPI Gateway実行権限を付与
    this.grantApiGatewayInvokePermission(props.webSocketHandler);
  }

  private createWebSocketApi(props: ApiConstructProps): apigatewayv2.WebSocketApi {
    // Lambda統合の作成
    const webSocketIntegration = new apigatewayv2_integrations.WebSocketLambdaIntegration(
      'WebSocketIntegration',
      props.webSocketHandler
    );

    // WebSocket API作成
    const api = new apigatewayv2.WebSocketApi(this, 'VtsWebSocketApi', {
      apiName: `vts-websocket-api-${props.environment}`,
      description: 'VTS Maritime AI WebSocket API for real-time communication',
      
      // ルート設定
      // 重要: $connect, $disconnect, $defaultの3つのルートのみを設定
      // カスタムアクションは$defaultルートで処理される
      connectRouteOptions: {
        integration: webSocketIntegration,
      },
      disconnectRouteOptions: {
        integration: webSocketIntegration,
      },
      defaultRouteOptions: {
        integration: webSocketIntegration,
      },

      // ルートレスポンス設定
      // $defaultルートがすべてのカスタムアクションを処理
      routeSelectionExpression: '$request.body.action',
    });

    // 注意: カスタムルートは作成しない
    // すべてのカスタムアクション（ping, message, startTranscription等）は
    // $defaultルートでLambda関数内のMessageRouterによって処理される

    return api;
  }


  private createWebSocketStage(props: ApiConstructProps): apigatewayv2.WebSocketStage {
    const stageName = props.environment === 'prod' ? 'prod' : 'dev';
    
    const stage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName,
      autoDeploy: true,
      
      // スロットリング設定
      throttle: {
        burstLimit: VtsConfiguration.API_CONFIG.THROTTLE.BURST_LIMIT,
        rateLimit: VtsConfiguration.API_CONFIG.THROTTLE.RATE_LIMIT,
      },
      
      // スロットリング設定はステージレベルで適用
    });

    // CloudWatch Logsの有効化
    stage.node.addDependency(this.createApiGatewayLogRole());

    return stage;
  }

  private createApiGatewayLogRole(): iam.Role {
    const logRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
      ],
    });

    // API Gatewayアカウント設定（リージョンごとに1回のみ必要）
    new cdk.CfnResource(this, 'ApiGatewayCloudWatchAccount', {
      type: 'AWS::ApiGateway::Account',
      properties: {
        CloudWatchRoleArn: logRole.roleArn,
      },
    });

    return logRole;
  }

  private grantApiGatewayInvokePermission(lambdaFunction: lambda.Function): void {
    lambdaFunction.addPermission('ApiGatewayInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
    });
  }

  // CORS設定（REST API用、将来の拡張用）
  public enableCors(allowedOrigins: string[]): void {
    // WebSocket APIではCORSは適用されないが、
    // 将来REST APIを追加する場合のための設定
    new cdk.CfnOutput(this, 'CorsAllowedOrigins', {
      value: allowedOrigins.join(','),
      description: 'CORS allowed origins for future REST API',
    });
  }

  // カスタムドメインの設定（将来の拡張用）
  public addCustomDomain(domainName: string, certificateArn: string): void {
    const customDomain = new apigatewayv2.DomainName(this, 'WebSocketCustomDomain', {
      domainName,
      certificate: cdk.aws_certificatemanager.Certificate.fromCertificateArn(
        this, 
        'Certificate', 
        certificateArn
      ),
    });

    new apigatewayv2.ApiMapping(this, 'WebSocketApiMapping', {
      api: this.webSocketApi,
      domainName: customDomain,
      stage: this.webSocketStage,
    });

    new cdk.CfnOutput(this, 'CustomWebSocketUrl', {
      value: `wss://${domainName}`,
      description: 'Custom domain WebSocket URL',
    });
  }

  // API使用量プランの設定（REST API用）
  public createUsagePlan(planName: string, apiKeyName: string): void {
    // WebSocket APIには使用量プランは適用されないが、
    // 将来のREST API用として設定方法を示す
    new cdk.CfnOutput(this, 'UsagePlanName', {
      value: planName,
      description: 'Usage plan name for future REST API',
    });

    new cdk.CfnOutput(this, 'ApiKeyName', {
      value: apiKeyName,
      description: 'API key name for future REST API',
    });
  }

  // APIメトリクスの設定
  public createApiMetrics(): void {
    // CloudWatch出力
    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID for monitoring',
    });

    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: this.webSocketUrl,
      description: 'WebSocket API URL',
    });

    new cdk.CfnOutput(this, 'WebSocketStageName', {
      value: this.webSocketStage.stageName,
      description: 'WebSocket API stage name',
    });
  }

  // API Gatewayアラームの設定
  public createApiAlarms(): void {
    // 4XX エラーメトリクス
    const clientErrorMetric = new cdk.aws_cloudwatch.Metric({
      namespace: 'AWS/ApiGatewayV2',
      metricName: '4XXError',
      dimensionsMap: {
        ApiId: this.webSocketApi.apiId,
        Stage: this.webSocketStage.stageName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // 5XX エラーメトリクス
    const serverErrorMetric = new cdk.aws_cloudwatch.Metric({
      namespace: 'AWS/ApiGatewayV2',
      metricName: '5XXError', 
      dimensionsMap: {
        ApiId: this.webSocketApi.apiId,
        Stage: this.webSocketStage.stageName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // レイテンシメトリクス
    const latencyMetric = new cdk.aws_cloudwatch.Metric({
      namespace: 'AWS/ApiGatewayV2',
      metricName: 'IntegrationLatency',
      dimensionsMap: {
        ApiId: this.webSocketApi.apiId,
        Stage: this.webSocketStage.stageName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // CloudWatch出力
    new cdk.CfnOutput(this, 'ApiClientErrorMetric', {
      value: clientErrorMetric.metricName,
      description: 'API Gateway 4XX error metric',
    });

    new cdk.CfnOutput(this, 'ApiServerErrorMetric', {
      value: serverErrorMetric.metricName,
      description: 'API Gateway 5XX error metric', 
    });

    new cdk.CfnOutput(this, 'ApiLatencyMetric', {
      value: latencyMetric.metricName,
      description: 'API Gateway integration latency metric',
    });
  }
}