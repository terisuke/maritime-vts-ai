/**
 * Database Construct
 * DynamoDB テーブルとインデックスの管理
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { VtsConfiguration } from '../config';

export interface DatabaseConstructProps {
  readonly environment: string;
}

export class DatabaseConstruct extends Construct {
  public readonly conversationsTable: dynamodb.Table;
  public readonly connectionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const removalPolicy = VtsConfiguration.getRemovalPolicy(props.environment);

    // 会話管理テーブル
    this.conversationsTable = this.createConversationsTable(removalPolicy);
    
    // 接続管理テーブル
    this.connectionsTable = this.createConnectionsTable(removalPolicy);
  }

  private createConversationsTable(removalPolicy: cdk.RemovalPolicy): dynamodb.Table {
    const table = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: VtsConfiguration.DYNAMODB_CONFIG.CONVERSATIONS_TABLE,
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
      removalPolicy,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
    });

    // 船舶名による検索用GSI
    table.addGlobalSecondaryIndex({
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

    // 日時による検索用GSI
    table.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: {
        name: 'Date',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ItemTimestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 分類による検索用GSI
    table.addGlobalSecondaryIndex({
      indexName: 'ClassificationIndex',
      partitionKey: {
        name: 'Classification',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ItemTimestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    return table;
  }

  private createConnectionsTable(removalPolicy: cdk.RemovalPolicy): dynamodb.Table {
    const table = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: VtsConfiguration.DYNAMODB_CONFIG.CONNECTIONS_TABLE,
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ステータスによる検索用GSI
    table.addGlobalSecondaryIndex({
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

    // ユーザーIDによる検索用GSI（将来の認証機能用）
    table.addGlobalSecondaryIndex({
      indexName: 'UserIdIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'connectedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    return table;
  }

  // DynamoDBテーブルのタグ設定
  public addTagsToTables(tags: Record<string, string>): void {
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.conversationsTable).add(key, value);
      cdk.Tags.of(this.connectionsTable).add(key, value);
    });
  }

  // メトリクス用のアラーム設定
  public createTableAlarms(): void {
    // スロットリングアラーム
    const conversationsThrottleAlarm = this.conversationsTable.metricThrottledRequestsForOperations({
      operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM],
    });

    const connectionsThrottleAlarm = this.connectionsTable.metricThrottledRequestsForOperations({
      operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.DELETE_ITEM],
    });

    // CloudWatchアラーム作成は親スタックで実装
    new cdk.CfnOutput(this, 'ConversationsThrottleMetric', {
      value: 'UserErrors',
      description: 'CloudWatch metric for conversations table throttling',
    });

    new cdk.CfnOutput(this, 'ConnectionsThrottleMetric', {
      value: 'UserErrors', 
      description: 'CloudWatch metric for connections table throttling',
    });
  }
}