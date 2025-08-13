/**
 * VTS Infrastructure Configuration
 * システム全体の設定値を一元管理
 */

import * as cdk from 'aws-cdk-lib';

export interface VtsConfig {
  readonly region: string;
  readonly account: string;
  readonly environment: 'dev' | 'staging' | 'prod';
}

export class VtsConfiguration {
  // DynamoDB設定
  static readonly DYNAMODB_CONFIG = {
    CONVERSATIONS_TABLE: 'vts-conversations',
    CONNECTIONS_TABLE: 'vts-connections',
    BILLING_MODE: 'PAY_PER_REQUEST',
    TTL_DAYS: 30,
  } as const;

  // Lambda設定
  static readonly LAMBDA_CONFIG = {
    RUNTIME: 'nodejs20.x',
    TIMEOUT: {
      WEBSOCKET_HANDLER: 30,
      TRANSCRIPTION_PROCESSOR: 300,  // 5分
      NLP_PROCESSOR: 30,
    },
    MEMORY_SIZE: {
      WEBSOCKET_HANDLER: 512,
      TRANSCRIPTION_PROCESSOR: 1024,
      NLP_PROCESSOR: 512,
    },
    ARCHITECTURE: 'arm64',
  } as const;

  // AI/ML設定
  static readonly AI_CONFIG = {
    BEDROCK_MODEL_ID: 'anthropic.claude-sonnet-4-20250514-v1:0',
    TRANSCRIBE_LANGUAGE: 'ja-JP',
    VOCABULARY_NAME: 'maritime-vts-vocabulary-ja',
    TEMPERATURE: 0.3,
    MAX_TOKENS: 300,
  } as const;

  // ログ設定
  static readonly LOG_CONFIG = {
    RETENTION_DAYS: 90, // 3ヶ月
    LOG_GROUPS: {
      VHF_COMMUNICATIONS: '/aws/vts/vhf-communications',
      TRANSCRIPTIONS: '/aws/vts/transcriptions',
      NLP_PROCESSING: '/aws/vts/nlp-processing',
    },
    LOG_LEVEL: {
      DEV: 'DEBUG',
      STAGING: 'INFO',
      PROD: 'WARN',
    },
  } as const;

  // S3設定
  static readonly S3_CONFIG = {
    BUCKET_PREFIX: 'vts-audio-storage',
    LIFECYCLE_DAYS: 30,
    GLACIER_TRANSITION_DAYS: 90,
    DEEP_ARCHIVE_DAYS: 365,
  } as const;

  // API Gateway設定
  static readonly API_CONFIG = {
    THROTTLE: {
      BURST_LIMIT: 5000,
      RATE_LIMIT: 2000,
    },
    TIMEOUT: 29000, // 29秒（Lambdaタイムアウトより短く）
  } as const;

  // リソース名生成ヘルパー
  static getBucketName(account: string, region: string): string {
    return `${this.S3_CONFIG.BUCKET_PREFIX}-${account}-${region}`;
  }

  static getLogLevel(environment: string): string {
    switch (environment) {
      case 'dev':
        return this.LOG_CONFIG.LOG_LEVEL.DEV;
      case 'staging':
        return this.LOG_CONFIG.LOG_LEVEL.STAGING;
      case 'prod':
        return this.LOG_CONFIG.LOG_LEVEL.PROD;
      default:
        return this.LOG_CONFIG.LOG_LEVEL.DEV;
    }
  }

  static getRemovalPolicy(environment: string): cdk.RemovalPolicy {
    return environment === 'prod' 
      ? cdk.RemovalPolicy.RETAIN 
      : cdk.RemovalPolicy.DESTROY;
  }

  // 環境変数生成
  static getCommonEnvironmentVariables(): Record<string, string> {
    return {
      NODE_ENV: 'production',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      // パフォーマンス最適化
      UV_USE_IO_URING: '0',
    };
  }

  static getWebSocketEnvironmentVariables(
    conversationsTable: string,
    connectionsTable: string,
    audioBucket: string,
    logGroup: string,
    logLevel: string
  ): Record<string, string> {
    return {
      ...this.getCommonEnvironmentVariables(),
      CONVERSATIONS_TABLE: conversationsTable,
      CONNECTIONS_TABLE: connectionsTable,
      AUDIO_BUCKET: audioBucket,
      VHF_LOG_GROUP: logGroup,
      LOG_LEVEL: logLevel,
      BEDROCK_MODEL_ID: this.AI_CONFIG.BEDROCK_MODEL_ID,
      TRANSCRIBE_VOCABULARY_NAME: this.AI_CONFIG.VOCABULARY_NAME,
    };
  }

  static getTranscriptionEnvironmentVariables(
    conversationsTable: string,
    audioBucket: string,
    logGroup: string,
    logLevel: string
  ): Record<string, string> {
    return {
      ...this.getCommonEnvironmentVariables(),
      CONVERSATIONS_TABLE: conversationsTable,
      TRANSCRIPTION_LOG_GROUP: logGroup,
      AUDIO_BUCKET: audioBucket,
      LOG_LEVEL: logLevel,
      TRANSCRIBE_LANGUAGE: this.AI_CONFIG.TRANSCRIBE_LANGUAGE,
      VOCABULARY_NAME: this.AI_CONFIG.VOCABULARY_NAME,
    };
  }

  static getNLPEnvironmentVariables(
    conversationsTable: string,
    logLevel: string
  ): Record<string, string> {
    return {
      ...this.getCommonEnvironmentVariables(),
      CONVERSATIONS_TABLE: conversationsTable,
      LOG_LEVEL: logLevel,
      BEDROCK_MODEL_ID: this.AI_CONFIG.BEDROCK_MODEL_ID,
      TEMPERATURE: String(this.AI_CONFIG.TEMPERATURE),
      MAX_TOKENS: String(this.AI_CONFIG.MAX_TOKENS),
    };
  }
}

// 型安全性のための定数エクスポート
export const RESOURCE_NAMES = VtsConfiguration.DYNAMODB_CONFIG;
export const LAMBDA_SETTINGS = VtsConfiguration.LAMBDA_CONFIG;
export const AI_SETTINGS = VtsConfiguration.AI_CONFIG;