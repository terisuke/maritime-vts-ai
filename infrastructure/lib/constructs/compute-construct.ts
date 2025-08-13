/**
 * Compute Construct
 * Lambda関数とIAMロールの管理
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { VtsConfiguration } from '../config';

export interface ComputeConstructProps {
  readonly environment: string;
  readonly conversationsTable: dynamodb.Table;
  readonly connectionsTable: dynamodb.Table;
  readonly audioStorageBucket: s3.Bucket;
  readonly vhfLogGroup: logs.LogGroup;
  readonly transcriptionLogGroup: logs.LogGroup;
  readonly nlpLogGroup: logs.LogGroup;
}

export class ComputeConstruct extends Construct {
  public readonly webSocketHandler: lambda.Function;
  public readonly transcriptionProcessor: lambda.Function;
  public readonly nlpProcessor: lambda.Function;
  public readonly lambdaExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeConstructProps) {
    super(scope, id);

    // IAMロールの作成
    this.lambdaExecutionRole = this.createLambdaExecutionRole(props);

    // Lambda関数の作成
    this.webSocketHandler = this.createWebSocketHandler(props);
    this.transcriptionProcessor = this.createTranscriptionProcessor(props);
    this.nlpProcessor = this.createNlpProcessor(props);

    // 権限の付与
    this.grantPermissions(props);
  }

  private createLambdaExecutionRole(props: ComputeConstructProps): iam.Role {
    const role = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        VtsLambdaPolicy: this.createLambdaPolicy(props),
      },
    });

    return role;
  }

  private createLambdaPolicy(props: ComputeConstructProps): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [
        // DynamoDB権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
          ],
          resources: [
            props.conversationsTable.tableArn,
            props.connectionsTable.tableArn,
            `${props.conversationsTable.tableArn}/index/*`,
            `${props.connectionsTable.tableArn}/index/*`,
          ],
        }),

        // S3権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
          ],
          resources: [props.audioStorageBucket.arnForObjects('*')],
        }),

        // CloudWatch Logs権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: [
            props.vhfLogGroup.logGroupArn,
            props.transcriptionLogGroup.logGroupArn,
            props.nlpLogGroup.logGroupArn,
            `${props.vhfLogGroup.logGroupArn}:*`,
            `${props.transcriptionLogGroup.logGroupArn}:*`,
            `${props.nlpLogGroup.logGroupArn}:*`,
          ],
        }),

        // Amazon Transcribe権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'transcribe:StartStreamTranscription',
            'transcribe:GetVocabulary',
          ],
          resources: ['*'],
        }),

        // Amazon Bedrock権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:ListFoundationModels',
            'bedrock:GetFoundationModel',
          ],
          resources: ['*'], // すべてのBedrockモデルへのアクセスを許可
        }),

        // API Gateway Management権限（WebSocket）
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'execute-api:ManageConnections',
          ],
          resources: ['arn:aws:execute-api:*:*:*'],
        }),

        // X-Ray Tracing権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'xray:PutTraceSegments',
            'xray:PutTelemetryRecords',
          ],
          resources: ['*'],
        }),
      ],
    });
  }

  private createWebSocketHandler(props: ComputeConstructProps): lambda.Function {
    const logLevel = VtsConfiguration.getLogLevel(props.environment);
    
    return new lambda.Function(this, 'WebSocketHandler', {
      functionName: 'vts-websocket-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../backend/lambda/websocket-handler')
      ),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(VtsConfiguration.LAMBDA_CONFIG.TIMEOUT.WEBSOCKET_HANDLER),
      memorySize: VtsConfiguration.LAMBDA_CONFIG.MEMORY_SIZE.WEBSOCKET_HANDLER,
      architecture: lambda.Architecture.ARM_64,
      
      environment: VtsConfiguration.getWebSocketEnvironmentVariables(
        props.conversationsTable.tableName,
        props.connectionsTable.tableName,
        props.audioStorageBucket.bucketName,
        props.vhfLogGroup.logGroupName,
        logLevel
      ),

      // デッドレターキュー設定
      deadLetterQueue: new cdk.aws_sqs.Queue(this, 'WebSocketHandlerDLQ', {
        queueName: 'vts-websocket-handler-dlq',
        retentionPeriod: cdk.Duration.days(14),
      }),

      // X-Ray Tracing
      tracing: lambda.Tracing.ACTIVE,

      // 予約済み同時実行数（本番環境用）
      reservedConcurrentExecutions: props.environment === 'prod' ? 50 : undefined,
    });
  }

  private createTranscriptionProcessor(props: ComputeConstructProps): lambda.Function {
    const logLevel = VtsConfiguration.getLogLevel(props.environment);

    return new lambda.Function(this, 'TranscriptionProcessor', {
      functionName: 'vts-transcription-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../backend/lambda/transcription-handler')
      ),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(VtsConfiguration.LAMBDA_CONFIG.TIMEOUT.TRANSCRIPTION_PROCESSOR),
      memorySize: VtsConfiguration.LAMBDA_CONFIG.MEMORY_SIZE.TRANSCRIPTION_PROCESSOR,
      architecture: lambda.Architecture.ARM_64,

      environment: VtsConfiguration.getTranscriptionEnvironmentVariables(
        props.conversationsTable.tableName,
        props.audioStorageBucket.bucketName,
        props.transcriptionLogGroup.logGroupName,
        logLevel
      ),

      // デッドレターキュー設定
      deadLetterQueue: new cdk.aws_sqs.Queue(this, 'TranscriptionProcessorDLQ', {
        queueName: 'vts-transcription-processor-dlq',
        retentionPeriod: cdk.Duration.days(14),
      }),

      // X-Ray Tracing
      tracing: lambda.Tracing.ACTIVE,

      // 予約済み同時実行数
      reservedConcurrentExecutions: props.environment === 'prod' ? 20 : undefined,
    });
  }

  private createNlpProcessor(props: ComputeConstructProps): lambda.Function {
    const logLevel = VtsConfiguration.getLogLevel(props.environment);

    return new lambda.Function(this, 'NlpProcessor', {
      functionName: 'vts-nlp-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../backend/lambda/nlp-processor')
      ),
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(VtsConfiguration.LAMBDA_CONFIG.TIMEOUT.NLP_PROCESSOR),
      memorySize: VtsConfiguration.LAMBDA_CONFIG.MEMORY_SIZE.NLP_PROCESSOR,
      architecture: lambda.Architecture.ARM_64,

      environment: VtsConfiguration.getNLPEnvironmentVariables(
        props.conversationsTable.tableName,
        logLevel
      ),

      // デッドレターキュー設定
      deadLetterQueue: new cdk.aws_sqs.Queue(this, 'NlpProcessorDLQ', {
        queueName: 'vts-nlp-processor-dlq',
        retentionPeriod: cdk.Duration.days(14),
      }),

      // X-Ray Tracing
      tracing: lambda.Tracing.ACTIVE,

      // 予約済み同時実行数
      reservedConcurrentExecutions: props.environment === 'prod' ? 30 : undefined,
    });
  }

  private grantPermissions(props: ComputeConstructProps): void {
    // DynamoDB権限付与
    props.conversationsTable.grantReadWriteData(this.webSocketHandler);
    props.connectionsTable.grantReadWriteData(this.webSocketHandler);
    props.conversationsTable.grantReadWriteData(this.transcriptionProcessor);
    props.conversationsTable.grantReadWriteData(this.nlpProcessor);

    // S3権限付与
    props.audioStorageBucket.grantReadWrite(this.webSocketHandler);
    props.audioStorageBucket.grantReadWrite(this.transcriptionProcessor);
  }

  // Lambda関数のメトリクス作成
  public createLambdaAlarms(): void {
    const functions = [
      { name: 'WebSocketHandler', func: this.webSocketHandler },
      { name: 'TranscriptionProcessor', func: this.transcriptionProcessor },
      { name: 'NlpProcessor', func: this.nlpProcessor },
    ];

    functions.forEach(({ name, func }) => {
      // エラー率アラーム
      const errorAlarm = func.metricErrors({
        period: cdk.Duration.minutes(5),
      });

      // 実行時間アラーム
      const durationAlarm = func.metricDuration({
        period: cdk.Duration.minutes(5),
      });

      // スロットリングアラーム  
      const throttleAlarm = func.metricThrottles({
        period: cdk.Duration.minutes(5),
      });

      // CloudWatch出力
      new cdk.CfnOutput(this, `${name}ErrorMetric`, {
        value: errorAlarm.metricName,
        description: `Error metric for ${name}`,
      });

      new cdk.CfnOutput(this, `${name}DurationMetric`, {
        value: durationAlarm.metricName,
        description: `Duration metric for ${name}`,
      });

      new cdk.CfnOutput(this, `${name}ThrottleMetric`, {
        value: throttleAlarm.metricName,
        description: `Throttle metric for ${name}`,
      });
    });
  }
}