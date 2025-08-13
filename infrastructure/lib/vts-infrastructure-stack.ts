import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import { Construct } from 'constructs';

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

    // Timestream - 時系列データ用データベース
    const timestreamDatabase = new timestream.CfnDatabase(this, 'VtsTimestreamDatabase', {
      databaseName: 'vts-maritime-logs',
    });

    // Timestream テーブル - VHF通信ログ
    const timestreamTable = new timestream.CfnTable(this, 'VtsTimestreamTable', {
      databaseName: timestreamDatabase.databaseName!,
      tableName: 'vhf-communications',
      retentionProperties: {
        memoryStoreRetentionPeriodInHours: 24, // 1日
        magneticStoreRetentionPeriodInDays: 90, // 90日
      },
    });
    timestreamTable.addDependency(timestreamDatabase);

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

    // Timestream権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'timestream:WriteRecords',
          'timestream:DescribeEndpoints',
        ],
        resources: ['*'],
      })
    );

    // Lambda関数 - WebRTC Signaling Handler
    const signalingFunction = new lambda.Function(this, 'VtsSignalingFunction', {
      functionName: 'vts-webrtc-signaling',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // プレースホルダーコード - 後で実装
        exports.handler = async (event) => {
          console.log('WebRTC Signaling Event:', JSON.stringify(event));
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Signaling handler placeholder' }),
          };
        };
      `),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
      },
    });

    // Lambda関数 - Transcription Processor
    const transcriptionProcessor = new lambda.Function(this, 'VtsTranscriptionProcessor', {
      functionName: 'vts-transcription-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // プレースホルダーコード - 後で実装
        exports.handler = async (event) => {
          console.log('Transcription Event:', JSON.stringify(event));
          // ここでTranscribeの結果を処理し、DynamoDBに保存
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Transcription processor placeholder' }),
          };
        };
      `),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
        AUDIO_BUCKET: audioStorageBucket.bucketName,
      },
    });

    // Lambda関数 - NLP/AI Processor (Bedrock連携)
    const nlpProcessor = new lambda.Function(this, 'VtsNlpProcessor', {
      functionName: 'vts-nlp-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // プレースホルダーコード - 後で実装
        exports.handler = async (event) => {
          console.log('NLP Processing Event:', JSON.stringify(event));
          // ここでBedrock APIを呼び出し、意図解釈と応答生成
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'NLP processor placeholder' }),
          };
        };
      `),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0', // 後で最新版に更新
      },
    });

    // テーブルへの権限付与
    conversationsTable.grantReadWriteData(signalingFunction);
    conversationsTable.grantReadWriteData(transcriptionProcessor);
    conversationsTable.grantReadWriteData(nlpProcessor);
    
    // S3への権限付与
    audioStorageBucket.grantReadWrite(transcriptionProcessor);

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

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: audioStorageBucket.bucketName,
      description: 'S3 Audio Storage Bucket Name',
      exportName: 'VtsAudioBucketName',
    });

    new cdk.CfnOutput(this, 'TimestreamDatabaseName', {
      value: timestreamDatabase.databaseName!,
      description: 'Timestream Database Name',
      exportName: 'VtsTimestreamDatabaseName',
    });
  }
}
