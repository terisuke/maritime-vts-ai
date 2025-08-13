/**
 * VTS Transcription Handler
 * Amazon Transcribeとの連携と文字起こし結果の処理
 */

const TranscribeClient = require('./transcribe-client');
const Logger = require('../shared/logger');
const dynamodbClient = require('../shared/dynamodb-client');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { CloudWatchLogsClient, PutLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

// グローバルインスタンス
let transcribeClient;
let logger;
let apiGatewayClient;
let cloudWatchClient;

/**
 * Lambda ハンドラー関数
 * @param {Object} event - Lambda イベント
 * @param {Object} context - Lambda コンテキスト
 * @returns {Promise<Object>} - 処理結果
 */
exports.handler = async (event, context) => {
  // 初回実行時のみ初期化
  if (!logger) {
    logger = new Logger({ 
      component: 'TranscriptionHandler',
      requestId: context.requestId 
    });
  }

  if (!transcribeClient) {
    transcribeClient = new TranscribeClient();
  }

  if (!apiGatewayClient && process.env.WEBSOCKET_ENDPOINT) {
    apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_ENDPOINT,
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
  }

  if (!cloudWatchClient) {
    cloudWatchClient = new CloudWatchLogsClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
  }

  const startTime = Date.now();

  try {
    logger.info('Transcription handler invoked', {
      eventType: event.type,
      requestId: context.requestId
    });

    // イベントタイプに基づいて処理を分岐
    let result;
    switch (event.type) {
      case 'START_TRANSCRIPTION':
        result = await handleStartTranscription(event);
        break;
      
      case 'STOP_TRANSCRIPTION':
        result = await handleStopTranscription(event);
        break;
      
      case 'AUDIO_DATA':
        result = await handleAudioData(event);
        break;
      
      case 'PROCESS_RESULTS':
        result = await handleProcessResults(event);
        break;
      
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }

    const processingTime = Date.now() - startTime;
    logger.metric('TranscriptionProcessingTime', processingTime, 'Milliseconds', {
      eventType: event.type
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    logger.error('Transcription handler failed', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        requestId: context.requestId
      })
    };
  }
};

/**
 * 文字起こし開始処理
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 処理結果
 */
async function handleStartTranscription(event) {
  const { sessionId, connectionId, options = {} } = event;

  if (!sessionId || !connectionId) {
    throw new Error('Session ID and Connection ID are required');
  }

  logger.info('Starting transcription', { sessionId, connectionId, options });

  try {
    // Transcribeストリーミングを開始
    const session = await transcribeClient.startStreamingTranscription(sessionId, options);

    // セッション情報をDynamoDBに保存
    const sessionData = {
      ConversationID: sessionId,
      ItemTimestamp: `SESSION#${new Date().toISOString()}`,
      ItemType: 'TRANSCRIPTION_SESSION',
      ConnectionID: connectionId,
      Status: 'ACTIVE',
      StartedAt: new Date().toISOString(),
      LanguageCode: options.languageCode || 'ja-JP',
      MediaSampleRate: options.mediaSampleRateHertz || 16000
    };

    await dynamodbClient.putItem(
      process.env.CONVERSATIONS_TABLE || 'vts-conversations',
      sessionData
    );

    // 文字起こし結果の処理を開始（非同期）
    processTranscriptionResultsAsync(sessionId, connectionId);

    // CloudWatch Logsに記録
    await logToCloudWatch('TRANSCRIPTION_STARTED', {
      sessionId,
      connectionId,
      languageCode: options.languageCode || 'ja-JP'
    });

    logger.audit('TRANSCRIPTION_SESSION_STARTED', {
      sessionId,
      connectionId,
      options
    });

    return {
      sessionId,
      status: 'started',
      message: 'Transcription started successfully'
    };

  } catch (error) {
    logger.error('Failed to start transcription', error);
    throw error;
  }
}

/**
 * 文字起こし停止処理
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 処理結果
 */
async function handleStopTranscription(event) {
  const { sessionId } = event;

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  logger.info('Stopping transcription', { sessionId });

  try {
    // セッション情報を取得
    const sessionInfo = transcribeClient.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Transcribeストリーミングを停止
    await transcribeClient.stopStreamingTranscription(sessionId);

    // DynamoDBのセッション情報を更新
    await dynamodbClient.updateItem(
      process.env.CONVERSATIONS_TABLE || 'vts-conversations',
      { 
        ConversationID: sessionId,
        ItemTimestamp: `SESSION#${sessionInfo.startTime}`
      },
      {
        Status: 'STOPPED',
        StoppedAt: new Date().toISOString(),
        Duration: Date.now() - sessionInfo.startTime
      }
    );

    // CloudWatch Logsに記録
    await logToCloudWatch('TRANSCRIPTION_STOPPED', {
      sessionId,
      duration: Date.now() - sessionInfo.startTime
    });

    logger.audit('TRANSCRIPTION_SESSION_STOPPED', {
      sessionId,
      duration: Date.now() - sessionInfo.startTime
    });

    return {
      sessionId,
      status: 'stopped',
      message: 'Transcription stopped successfully',
      duration: Date.now() - sessionInfo.startTime
    };

  } catch (error) {
    logger.error('Failed to stop transcription', error);
    throw error;
  }
}

/**
 * 音声データ処理
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 処理結果
 */
async function handleAudioData(event) {
  const { sessionId, audioData } = event;

  if (!sessionId || !audioData) {
    throw new Error('Session ID and audio data are required');
  }

  try {
    // Base64デコード
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // 音声データをTranscribeに送信
    await transcribeClient.sendAudioData(sessionId, audioBuffer);

    logger.debug('Audio data processed', {
      sessionId,
      dataSize: audioBuffer.length
    });

    return {
      sessionId,
      status: 'processed',
      dataSize: audioBuffer.length
    };

  } catch (error) {
    logger.error('Failed to process audio data', error);
    throw error;
  }
}

/**
 * 文字起こし結果の処理（非同期）
 * @param {string} sessionId - セッションID
 * @param {string} connectionId - WebSocket接続ID
 */
async function processTranscriptionResultsAsync(sessionId, connectionId) {
  try {
    await transcribeClient.processTranscriptionResults(sessionId, async (result) => {
      // 文字起こし結果をDynamoDBに保存
      const transcriptionItem = {
        ConversationID: sessionId,
        ItemTimestamp: `TRANS#${result.timestamp}`,
        ItemType: 'TRANSCRIPTION',
        ConnectionID: connectionId,
        TranscriptText: result.transcript,
        Confidence: result.confidence,
        StartTime: result.startTime,
        EndTime: result.endTime,
        Timestamp: result.timestamp
      };

      await dynamodbClient.putItem(
        process.env.CONVERSATIONS_TABLE || 'vts-conversations',
        transcriptionItem
      );

      // WebSocket経由でクライアントに送信
      if (apiGatewayClient) {
        await sendToWebSocket(connectionId, {
          type: 'transcriptionResult',
          sessionId,
          transcript: result.transcript,
          confidence: result.confidence,
          timestamp: result.timestamp
        });
      }

      // CloudWatch Logsに記録
      await logToCloudWatch('TRANSCRIPTION_RESULT', {
        sessionId,
        transcriptLength: result.transcript.length,
        confidence: result.confidence
      });

      logger.info('Transcription result saved', {
        sessionId,
        transcriptLength: result.transcript.length
      });
    });
  } catch (error) {
    logger.error('Failed to process transcription results', error);
    
    // エラーをクライアントに通知
    if (apiGatewayClient && connectionId) {
      await sendToWebSocket(connectionId, {
        type: 'transcriptionError',
        sessionId,
        error: error.message
      });
    }
  }
}

/**
 * WebSocketにメッセージを送信
 * @param {string} connectionId - WebSocket接続ID
 * @param {Object} data - 送信データ
 */
async function sendToWebSocket(connectionId, data) {
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(data)
    });

    await apiGatewayClient.send(command);
    
    logger.debug('Sent to WebSocket', { connectionId, dataType: data.type });
  } catch (error) {
    if (error.statusCode === 410) {
      logger.warn('WebSocket connection no longer exists', { connectionId });
    } else {
      logger.error('Failed to send to WebSocket', error);
    }
  }
}

/**
 * CloudWatch Logsに記録
 * @param {string} eventType - イベントタイプ
 * @param {Object} data - ログデータ
 */
async function logToCloudWatch(eventType, data) {
  try {
    const logGroupName = process.env.TRANSCRIPTION_LOG_GROUP || '/aws/vts/transcriptions';
    const logStreamName = `${new Date().toISOString().split('T')[0]}-transcriptions`;
    
    const logEvent = {
      timestamp: Date.now(),
      message: JSON.stringify({
        eventType,
        ...data,
        timestamp: new Date().toISOString()
      })
    };

    const command = new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [logEvent]
    });

    await cloudWatchClient.send(command);
    
    logger.debug('Logged to CloudWatch', { eventType, logGroupName });
  } catch (error) {
    // CloudWatch Logsへの記録に失敗してもメイン処理は継続
    logger.error('Failed to log to CloudWatch', error);
  }
}

/**
 * クリーンアップ処理（Lambda終了時）
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, cleaning up');
  
  if (transcribeClient) {
    await transcribeClient.cleanupAllSessions();
  }
  
  process.exit(0);
});