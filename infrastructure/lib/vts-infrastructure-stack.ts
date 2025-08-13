import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VtsConfiguration, VtsConfig } from './config';
import { DatabaseConstruct } from './constructs/database-construct';
import { StorageConstruct } from './constructs/storage-construct';
import { ComputeConstruct } from './constructs/compute-construct';
import { ApiConstruct } from './constructs/api-construct';

export interface VtsInfrastructureStackProps extends cdk.StackProps {
  readonly environment?: 'dev' | 'staging' | 'prod';
}

export class VtsInfrastructureStack extends cdk.Stack {
  public readonly database: DatabaseConstruct;
  public readonly storage: StorageConstruct;
  public readonly compute: ComputeConstruct;
  public readonly api: ApiConstruct;

  constructor(scope: Construct, id: string, props?: VtsInfrastructureStackProps) {
    super(scope, id, props);

    // 環境設定の決定
    const environment = props?.environment || 'dev';
    
    // ============================================
    // モジュラーコンストラクトによる構成
    // ============================================

    // データベース層 (DynamoDB テーブル)
    this.database = new DatabaseConstruct(this, 'Database', {
      environment,
    });

    // ストレージ層 (S3バケット、CloudWatch Logs)
    this.storage = new StorageConstruct(this, 'Storage', {
      environment,
      account: this.account,
      region: this.region,
    });

    // コンピューティング層 (Lambda関数、IAMロール)
    this.compute = new ComputeConstruct(this, 'Compute', {
      environment,
      conversationsTable: this.database.conversationsTable,
      connectionsTable: this.database.connectionsTable,
      audioStorageBucket: this.storage.audioStorageBucket,
      vhfLogGroup: this.storage.vhfCommunicationLogGroup,
      transcriptionLogGroup: this.storage.transcriptionLogGroup,
      nlpLogGroup: this.storage.nlpProcessingLogGroup,
    });

    // API層 (WebSocket API Gateway)
    this.api = new ApiConstruct(this, 'Api', {
      environment,
      webSocketHandler: this.compute.webSocketHandler,
    });

    // ============================================
    // 追加設定
    // ============================================

    // Lambda関数にWebSocketエンドポイントを環境変数として追加
    this.compute.webSocketHandler.addEnvironment('WEBSOCKET_ENDPOINT', this.api.webSocketUrl);
    this.compute.transcriptionProcessor.addEnvironment('WEBSOCKET_ENDPOINT', this.api.webSocketUrl);

    // タグ設定
    this.addResourceTags(environment);

    // ============================================
    // CloudWatch 出力
    // ============================================

    this.createStackOutputs();
  }

  private addResourceTags(environment: string): void {
    const tags = {
      Project: 'maritime-vts-ai',
      Environment: environment,
      ManagedBy: 'AWS-CDK',
      CostCenter: 'VTS-Operations',
    };

    // すべてのリソースにタグを適用
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // データベーステーブルに特別なタグを追加
    this.database.addTagsToTables({
      ...tags,
      DataClassification: 'Maritime-Communications',
    });
  }

  private createStackOutputs(): void {
    // WebSocket API URL
    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: this.api.webSocketUrl,
      description: 'WebSocket API URL for real-time communication',
      exportName: `VtsWebSocketApiUrl-${this.stackName}`,
    });

    // DynamoDB テーブル名
    new cdk.CfnOutput(this, 'ConversationsTableName', {
      value: this.database.conversationsTable.tableName,
      description: 'DynamoDB Conversations Table Name',
      exportName: `VtsConversationsTableName-${this.stackName}`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.database.connectionsTable.tableName,
      description: 'DynamoDB Connections Table Name',
      exportName: `VtsConnectionsTableName-${this.stackName}`,
    });

    // S3バケット名
    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: this.storage.audioStorageBucket.bucketName,
      description: 'S3 Audio Storage Bucket Name',
      exportName: `VtsAudioBucketName-${this.stackName}`,
    });

    // CloudWatch Logsグループ名
    new cdk.CfnOutput(this, 'VhfLogGroupName', {
      value: this.storage.vhfCommunicationLogGroup.logGroupName,
      description: 'CloudWatch Log Group for VHF Communications',
      exportName: `VtsVhfLogGroupName-${this.stackName}`,
    });

    new cdk.CfnOutput(this, 'TranscriptionLogGroupName', {
      value: this.storage.transcriptionLogGroup.logGroupName,
      description: 'CloudWatch Log Group for Transcriptions',
      exportName: `VtsTranscriptionLogGroupName-${this.stackName}`,
    });

    new cdk.CfnOutput(this, 'NlpLogGroupName', {
      value: this.storage.nlpProcessingLogGroup.logGroupName,
      description: 'CloudWatch Log Group for NLP Processing',
      exportName: `VtsNlpLogGroupName-${this.stackName}`,
    });

    // Lambda関数名
    new cdk.CfnOutput(this, 'WebSocketHandlerName', {
      value: this.compute.webSocketHandler.functionName,
      description: 'WebSocket Handler Lambda Function Name',
      exportName: `VtsWebSocketHandlerName-${this.stackName}`,
    });

    new cdk.CfnOutput(this, 'TranscriptionProcessorName', {
      value: this.compute.transcriptionProcessor.functionName,
      description: 'Transcription Processor Lambda Function Name',
      exportName: `VtsTranscriptionProcessorName-${this.stackName}`,
    });

    new cdk.CfnOutput(this, 'NlpProcessorName', {
      value: this.compute.nlpProcessor.functionName,
      description: 'NLP Processor Lambda Function Name',
      exportName: `VtsNlpProcessorName-${this.stackName}`,
    });

    // API Gateway ID
    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.api.webSocketApi.apiId,
      description: 'WebSocket API Gateway ID',
      exportName: `VtsWebSocketApiId-${this.stackName}`,
    });
  }
}
