/**
 * Storage Construct
 * S3バケットとCloudWatch Logsの管理
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { VtsConfiguration } from '../config';

export interface StorageConstructProps {
  readonly environment: string;
  readonly account: string;
  readonly region: string;
}

export class StorageConstruct extends Construct {
  public readonly audioStorageBucket: s3.Bucket;
  public readonly vhfCommunicationLogGroup: logs.LogGroup;
  public readonly transcriptionLogGroup: logs.LogGroup;
  public readonly nlpProcessingLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: StorageConstructProps) {
    super(scope, id);

    const removalPolicy = VtsConfiguration.getRemovalPolicy(props.environment);

    // S3バケット作成
    this.audioStorageBucket = this.createAudioBucket(props, removalPolicy);
    
    // CloudWatch Logsグループ作成
    this.vhfCommunicationLogGroup = this.createLogGroup(
      'VhfCommunicationLogGroup',
      VtsConfiguration.LOG_CONFIG.LOG_GROUPS.VHF_COMMUNICATIONS,
      removalPolicy
    );

    this.transcriptionLogGroup = this.createLogGroup(
      'TranscriptionLogGroup', 
      VtsConfiguration.LOG_CONFIG.LOG_GROUPS.TRANSCRIPTIONS,
      removalPolicy
    );

    this.nlpProcessingLogGroup = this.createLogGroup(
      'NlpProcessingLogGroup',
      VtsConfiguration.LOG_CONFIG.LOG_GROUPS.NLP_PROCESSING,
      removalPolicy
    );
  }

  private createAudioBucket(
    props: StorageConstructProps, 
    removalPolicy: cdk.RemovalPolicy
  ): s3.Bucket {
    const bucketName = VtsConfiguration.getBucketName(props.account, props.region);
    
    const bucket = new s3.Bucket(this, 'AudioStorageBucket', {
      bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy,
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
      
      // ライフサイクル設定
      lifecycleRules: [
        {
          id: 'audio-lifecycle-rule',
          enabled: true,
          prefix: 'audio/',
          
          // 30日後にStandard-IA
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(VtsConfiguration.S3_CONFIG.LIFECYCLE_DAYS),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(VtsConfiguration.S3_CONFIG.GLACIER_TRANSITION_DAYS),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(VtsConfiguration.S3_CONFIG.DEEP_ARCHIVE_DAYS),
            },
          ],
          
          // 1年後に削除（本番環境では要検討）
          expiration: props.environment !== 'prod' 
            ? cdk.Duration.days(365) 
            : undefined,
        },
        
        // 不完全マルチパートアップロードのクリーンアップ
        {
          id: 'incomplete-multipart-upload-cleanup',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // CORS設定（フロントエンドから直接アップロード用）
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'], // 本番環境では特定ドメインに制限
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],

      // 通知設定は後で addEventNotification() で追加可能
    });

    // バケットポリシー（SSL必須）
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyInsecureConnections',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [
          bucket.bucketArn,
          bucket.arnForObjects('*'),
        ],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      })
    );

    return bucket;
  }

  private createLogGroup(
    id: string, 
    logGroupName: string, 
    removalPolicy: cdk.RemovalPolicy
  ): logs.LogGroup {
    return new logs.LogGroup(this, id, {
      logGroupName,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy,
    });
  }

  // バックアップ設定（本番環境用）
  public enableCrossRegionBackup(backupRegion: string): s3.Bucket | undefined {
    if (backupRegion) {
      // クロスリージョンレプリケーション設定
      // 注意: この実装は簡略化されており、実際にはより詳細な設定が必要
      const backupBucket = new s3.Bucket(this, 'AudioStorageBackupBucket', {
        bucketName: `${this.audioStorageBucket.bucketName}-backup-${backupRegion}`,
        encryption: s3.BucketEncryption.S3_MANAGED,
        versioned: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      });

      return backupBucket;
    }
    
    return undefined;
  }

  // ログ保持期間の動的調整
  public updateLogRetention(retentionDays: logs.RetentionDays): void {
    // 既存のロググループの保持期間を更新
    // CDKでは直接更新できないため、カスタムリソースが必要
    new cdk.CfnOutput(this, 'LogRetentionDays', {
      value: retentionDays.toString(),
      description: 'Current log retention period in days',
    });
  }

  // ストレージメトリクス
  public createStorageMetrics(): void {
    // S3メトリクス
    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: this.audioStorageBucket.bucketName,
      description: 'Name of the audio storage bucket',
    });

    // CloudWatch Logsメトリクス
    new cdk.CfnOutput(this, 'VhfLogGroupName', {
      value: this.vhfCommunicationLogGroup.logGroupName,
      description: 'Name of the VHF communication log group',
    });

    new cdk.CfnOutput(this, 'TranscriptionLogGroupName', {
      value: this.transcriptionLogGroup.logGroupName,
      description: 'Name of the transcription log group',
    });
  }
}