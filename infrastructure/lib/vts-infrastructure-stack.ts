import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class VtsInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // データストレージ層
    // ============================================
    
    // DynamoDB - 会話管理テーブル（提案書の設計に基づく）
    const conversationsTable = new dynamodb.Table(this, 'VtsConversationsTable', {
      tableName: 'vts-conversations',
      partitionKey: {
        name: 'ConversationID',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ItemTimestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP用設定
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // DynamoDB - WebSocket接続管理テーブル
    const connectionsTable = new dynamodb.Table(this, 'VtsConnectionsTable', {
      tableName: 'vts-connections',
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // TTL設定
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP用設定
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI - ステータスによる検索用
    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'connectedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI - 船舶名による検索用
    conversationsTable.addGlobalSecondaryIndex({
      indexName: 'VesselNameIndex',
      partitionKey: {
        name: 'VesselName',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ConversationID',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // CloudWatch Logs - 時系列ログの代替（Timestreamの代わり）
    const vhfCommunicationLogGroup = new logs.LogGroup(this, 'VhfCommunicationLogGroup', {
      logGroupName: '/aws/vts/vhf-communications',
      retention: logs.RetentionDays.THREE_MONTHS, // 3ヶ月保持
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const transcriptionLogGroup = new logs.LogGroup(this, 'TranscriptionLogGroup', {
      logGroupName: '/aws/vts/transcriptions',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3 - 音声ファイル保存用
    const audioStorageBucket = new s3.Bucket(this, 'VtsAudioStorageBucket', {
      bucketName: `vts-audio-storage-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          id: 'delete-old-audio',
          expiration: cdk.Duration.days(30), // MVP用: 30日後に削除
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP用設定
      autoDeleteObjects: true, // MVP用設定
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'], // 本番環境では制限必要
          allowedHeaders: ['*'],
        },
      ],
    });

    // ============================================
    // Lambda関数層
    // ============================================

    // Lambda実行ロール（基本）
    const lambdaExecutionRole = new iam.Role(this, 'VtsLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Transcribe権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'transcribe:StartStreamTranscription',
          'transcribe:StartStreamTranscriptionWebSocket',
        ],
        resources: ['*'],
      })
    );

    // Bedrock権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['*'],
      })
    );

    // CloudWatch Logs権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          vhfCommunicationLogGroup.logGroupArn,
          transcriptionLogGroup.logGroupArn,
          `${vhfCommunicationLogGroup.logGroupArn}:*`,
          `${transcriptionLogGroup.logGroupArn}:*`,
        ],
      })
    );

    // Lambda関数 - WebSocket Handler
    const signalingFunction = new lambda.Function(this, 'VtsSignalingFunction', {
      functionName: 'vts-websocket-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/lambda/websocket-handler')),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        VHF_LOG_GROUP: vhfCommunicationLogGroup.logGroupName,
        AUDIO_BUCKET: audioStorageBucket.bucketName,
        LOG_LEVEL: 'INFO',
      },
    });

    // Lambda関数 - Transcription Processor
    const transcriptionProcessor = new lambda.Function(this, 'VtsTranscriptionProcessor', {
      functionName: 'vts-transcription-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/lambda/transcription-handler')),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        TRANSCRIPTION_LOG_GROUP: transcriptionLogGroup.logGroupName,
        AUDIO_BUCKET: audioStorageBucket.bucketName,
        LOG_LEVEL: 'INFO',
      },
    });

    // Lambda関数 - NLP/AI Processor (Bedrock連携)
    const nlpProcessor = new lambda.Function(this, 'VtsNlpProcessor', {
      functionName: 'vts-nlp-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/lambda/nlp-processor')),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
    });

    // テーブルへの権限付与
    conversationsTable.grantReadWriteData(signalingFunction);
    conversationsTable.grantReadWriteData(transcriptionProcessor);
    conversationsTable.grantReadWriteData(nlpProcessor);
    connectionsTable.grantReadWriteData(signalingFunction);
    connectionsTable.grantReadWriteData(transcriptionProcessor);
    
    // S3バケットへの権限付与
    audioStorageBucket.grantReadWrite(signalingFunction);
    audioStorageBucket.grantReadWrite(transcriptionProcessor);
    audioStorageBucket.grantReadWrite(nlpProcessor);

    // ============================================
    // API Gateway (WebSocket)
    // ============================================

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'VtsWebSocketApi', {
      apiName: 'vts-websocket-api',
      description: 'WebSocket API for Maritime VTS Real-time Communication',
      connectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          signalingFunction
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          signalingFunction
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          signalingFunction
        ),
      },
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'VtsWebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // WebSocket APIのエンドポイントURLを構築
    const webSocketEndpoint = `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}`;

    // Lambda関数にWebSocketエンドポイントを環境変数として追加
    signalingFunction.addEnvironment('WEBSOCKET_ENDPOINT', webSocketEndpoint);
    transcriptionProcessor.addEnvironment('WEBSOCKET_ENDPOINT', webSocketEndpoint);

    // WebSocket管理権限を追加
    signalingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
      })
    );

    // ============================================
    // 出力
    // ============================================

    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: webSocketStage.url,
      description: 'WebSocket API URL for real-time communication',
      exportName: 'VtsWebSocketApiUrl',
    });

    new cdk.CfnOutput(this, 'ConversationsTableName', {
      value: conversationsTable.tableName,
      description: 'DynamoDB Conversations Table Name',
      exportName: 'VtsConversationsTableName',
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: connectionsTable.tableName,
      description: 'DynamoDB Connections Table Name',
      exportName: 'VtsConnectionsTableName',
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: audioStorageBucket.bucketName,
      description: 'S3 Audio Storage Bucket Name',
      exportName: 'VtsAudioBucketName',
    });

    new cdk.CfnOutput(this, 'VhfLogGroupName', {
      value: vhfCommunicationLogGroup.logGroupName,
      description: 'CloudWatch Log Group for VHF Communications',
      exportName: 'VtsVhfLogGroupName',
    });

    new cdk.CfnOutput(this, 'TranscriptionLogGroupName', {
      value: transcriptionLogGroup.logGroupName,
      description: 'CloudWatch Log Group for Transcriptions',
      exportName: 'VtsTranscriptionLogGroupName',
    });
  }
}
