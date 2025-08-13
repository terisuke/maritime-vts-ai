/**
 * WebSocket Message Router
 * メッセージタイプに基づいてルーティングとハンドリングを実行
 */

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Logger = require('../shared/logger');
const dynamodbClient = require('../shared/dynamodb-client');

class MessageRouter {
  constructor(endpoint) {
    this.logger = new Logger({ component: 'MessageRouter' });
    
    // API Gateway Management API Client（WebSocketにメッセージを送信するため）
    this.apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: endpoint || process.env.WEBSOCKET_ENDPOINT,
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });

    // S3 Client（音声ファイル保存用）
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });

    // Transcribe Streaming Client
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });

    this.audioBucket = process.env.AUDIO_BUCKET || 'vts-audio-storage';
    this.conversationsTable = process.env.CONVERSATIONS_TABLE || 'vts-conversations';
  }

  /**
   * メッセージをルーティング
   * @param {Object} event - Lambda イベント
   * @param {Object} connectionManager - ConnectionManager インスタンス
   * @returns {Promise<Object>} - 処理結果
   */
  async routeMessage(event, connectionManager) {
    const connectionId = event.requestContext.connectionId;
    const messageBody = event.body;
    
    try {
      // メッセージをパース
      const message = JSON.parse(messageBody);
      
      // メッセージフォーマットの検証
      if (!this.validateMessage(message)) {
        await this.sendError(connectionId, 'Invalid message format');
        return { statusCode: 400, body: 'Invalid message format' };
      }

      // 接続のアクティビティを更新
      await connectionManager.updateActivity(connectionId);

      // 監査ログ
      this.logger.audit('MESSAGE_RECEIVED', {
        connectionId,
        action: message.action,
        timestamp: message.timestamp || new Date().toISOString()
      });

      // アクションに基づいてルーティング
      switch (message.action) {
        case 'message':
          return await this.handleMessage(connectionId, message.payload);
        
        case 'startTranscription':
          return await this.handleStartTranscription(connectionId, message.payload);
        
        case 'stopTranscription':
          return await this.handleStopTranscription(connectionId, message.payload);
        
        case 'audioData':
          return await this.handleAudioData(connectionId, message.payload);
        
        case 'ping':
          return await this.handlePing(connectionId);
        
        default:
          await this.sendError(connectionId, `Unknown action: ${message.action}`);
          return { statusCode: 400, body: `Unknown action: ${message.action}` };
      }
    } catch (error) {
      this.logger.error('Message routing failed', error);
      await this.sendError(connectionId, 'Internal server error');
      return { statusCode: 500, body: 'Internal server error' };
    }
  }

  /**
   * メッセージフォーマットの検証
   * @param {Object} message - メッセージオブジェクト
   * @returns {boolean} - 有効かどうか
   */
  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.action || typeof message.action !== 'string') {
      return false;
    }

    // timestampは任意だが、存在する場合はISO8601形式であることを確認
    if (message.timestamp) {
      const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (!timestampPattern.test(message.timestamp)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 通常メッセージの処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} payload - メッセージペイロード
   * @returns {Promise<Object>} - 処理結果
   */
  async handleMessage(connectionId, payload) {
    this.logger.info('Handling message', { connectionId, payload });

    // メッセージを会話履歴に保存
    const conversationItem = {
      ConversationID: `CONN-${connectionId}`,
      ItemTimestamp: `MSG#${new Date().toISOString()}`,
      ItemType: 'MESSAGE',
      ConnectionID: connectionId,
      MessageContent: payload.content || '',
      MessageType: payload.type || 'text',
      Timestamp: new Date().toISOString()
    };

    await dynamodbClient.putItem(this.conversationsTable, conversationItem);

    // クライアントに確認を送信
    await this.sendToConnection(connectionId, {
      type: 'messageReceived',
      messageId: conversationItem.ItemTimestamp,
      timestamp: conversationItem.Timestamp
    });

    this.logger.metric('MessagesProcessed', 1, 'Count', {
      messageType: payload.type || 'text'
    });

    return { statusCode: 200, body: 'Message processed' };
  }

  /**
   * 音声文字起こし開始の処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} payload - ペイロード
   * @returns {Promise<Object>} - 処理結果
   */
  async handleStartTranscription(connectionId, payload) {
    this.logger.info('Starting transcription', { connectionId, payload });

    // セッション情報を作成
    const sessionId = `TRANS-${connectionId}-${Date.now()}`;
    const sessionData = {
      ConversationID: sessionId,
      ItemTimestamp: `SESSION#${new Date().toISOString()}`,
      ItemType: 'TRANSCRIPTION_SESSION',
      ConnectionID: connectionId,
      Status: 'STARTED',
      Language: payload.languageCode || payload.language || 'ja-JP',
      VocabularyName: payload.vocabularyName || 'maritime-vts-vocabulary',
      SampleRate: payload.sampleRate || 16000,
      StartedAt: new Date().toISOString()
    };

    await dynamodbClient.putItem(this.conversationsTable, sessionData);

    // クライアントに開始確認を送信
    await this.sendToConnection(connectionId, {
      type: 'status',
      message: 'Transcription started',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    this.logger.audit('TRANSCRIPTION_STARTED', {
      connectionId,
      sessionId,
      language: sessionData.Language,
      vocabularyName: sessionData.VocabularyName
    });

    return { statusCode: 200, body: 'Transcription started' };
  }

  /**
   * 音声文字起こし停止の処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} payload - ペイロード
   * @returns {Promise<Object>} - 処理結果
   */
  async handleStopTranscription(connectionId, payload) {
    this.logger.info('Stopping transcription', { connectionId, payload });

    const sessionId = payload.sessionId || `TRANS-${connectionId}`;
    
    // セッション情報が存在する場合は更新
    try {
      await dynamodbClient.updateItem(
        this.conversationsTable,
        { ConversationID: sessionId, ItemTimestamp: `SESSION#${sessionId}` },
        {
          Status: 'STOPPED',
          StoppedAt: new Date().toISOString()
        }
      );
    } catch (error) {
      // セッションが存在しない場合もエラーにしない
      this.logger.debug('Session not found or already stopped', { sessionId });
    }

    // クライアントに停止確認を送信
    await this.sendToConnection(connectionId, {
      type: 'status',
      message: 'Transcription stopped',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    this.logger.audit('TRANSCRIPTION_STOPPED', {
      connectionId,
      sessionId
    });

    return { statusCode: 200, body: 'Transcription stopped' };
  }

  /**
   * 音声データの処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} payload - ペイロード（Base64エンコードされた音声データを含む）
   * @returns {Promise<Object>} - 処理結果
   */
  async handleAudioData(connectionId, payload) {
    try {
      // payloadがaudioプロパティを持つ場合（フロントエンドからの形式）
      const audioData = payload.audio || payload.audioData;
      const sessionId = payload.sessionId || `TRANS-${connectionId}-${Date.now()}`;
      const sequenceNumber = payload.sequenceNumber || 0;

      if (!audioData) {
        await this.sendError(connectionId, 'Audio data is required');
        return { statusCode: 400, body: 'Invalid audio data' };
      }

      // Base64デコード
      const audioBuffer = Buffer.from(audioData, 'base64');

      // デバッグ用：S3に音声ファイルを保存（オプション）
      if (process.env.SAVE_AUDIO_TO_S3 === 'true') {
        const s3Key = `audio/${sessionId}/${Date.now()}-${sequenceNumber}.raw`;
        await this.saveAudioToS3(audioBuffer, s3Key);
      }

      this.logger.debug('Audio data received', {
        connectionId,
        sessionId,
        sequenceNumber,
        audioSize: audioBuffer.length
      });

      // 仮の文字起こし結果を送信（Day 6のMVP用）
      // TODO: Day 7でTranscribe Streamingへの実装に置き換え
      
      // 部分的な結果を送信
      setTimeout(async () => {
        await this.sendToConnection(connectionId, {
          type: 'transcription',
          payload: {
            transcriptText: '本船は東京湾入口を通過中',
            confidence: 0.85,
            timestamp: new Date().toISOString(),
            isPartial: true,
            speakerLabel: 'VTS'
          }
        });
      }, 500);

      // 最終結果を送信
      setTimeout(async () => {
        await this.sendToConnection(connectionId, {
          type: 'transcription',
          payload: {
            transcriptText: '本船は東京湾入口を通過中です。現在の速力は12ノット。',
            confidence: 0.95,
            timestamp: new Date().toISOString(),
            isPartial: false,
            speakerLabel: 'VTS'
          }
        });
      }, 2000);

      this.logger.metric('AudioDataProcessed', audioBuffer.length, 'Bytes', {
        sessionId
      });

      return { statusCode: 200, body: 'Audio data received' };
    } catch (error) {
      this.logger.error('Failed to process audio data', error);
      await this.sendError(connectionId, 'Failed to process audio data');
      return { statusCode: 500, body: 'Failed to process audio data' };
    }
  }

  /**
   * Pingメッセージの処理（接続維持用）
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<Object>} - 処理結果
   */
  async handlePing(connectionId) {
    await this.sendToConnection(connectionId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });

    return { statusCode: 200, body: 'Pong' };
  }

  /**
   * 音声データをS3に保存
   * @param {Buffer} audioBuffer - 音声データ
   * @param {string} key - S3キー
   * @returns {Promise<void>}
   */
  async saveAudioToS3(audioBuffer, key) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.audioBucket,
        Key: key,
        Body: audioBuffer,
        ContentType: 'audio/raw',
        Metadata: {
          timestamp: new Date().toISOString()
        }
      });

      await this.s3Client.send(command);
      
      this.logger.debug('Audio saved to S3', { 
        bucket: this.audioBucket, 
        key,
        size: audioBuffer.length 
      });
    } catch (error) {
      this.logger.error('Failed to save audio to S3', error);
      // S3への保存に失敗してもメイン処理は継続
    }
  }

  /**
   * WebSocket接続にメッセージを送信
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} data - 送信するデータ
   * @returns {Promise<void>}
   */
  async sendToConnection(connectionId, data) {
    try {
      const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(data)
      });

      await this.apiGatewayClient.send(command);
      
      this.logger.debug('Message sent to connection', { 
        connectionId,
        messageType: data.type 
      });
    } catch (error) {
      if (error.statusCode === 410) {
        this.logger.warn('Connection no longer exists', { connectionId });
      } else {
        this.logger.error('Failed to send message to connection', error);
      }
      throw error;
    }
  }

  /**
   * エラーメッセージを送信
   * @param {string} connectionId - WebSocket接続ID
   * @param {string} errorMessage - エラーメッセージ
   * @returns {Promise<void>}
   */
  async sendError(connectionId, errorMessage) {
    try {
      await this.sendToConnection(connectionId, {
        type: 'error',
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      this.logger.metric('ErrorsSent', 1, 'Count', {
        errorType: errorMessage
      });
    } catch (error) {
      this.logger.error('Failed to send error message', error);
    }
  }
}

module.exports = MessageRouter;