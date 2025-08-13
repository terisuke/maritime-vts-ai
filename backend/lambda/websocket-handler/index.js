/**
 * VTS WebSocket Handler
 * WebSocket APIのメインハンドラー
 * $connect, $disconnect, $defaultルートを処理
 */

const ConnectionManager = require('./connection-manager');
const MessageRouter = require('./message-router');
const Logger = require('./shared/logger');

// グローバルインスタンス（Lambda実行環境での再利用）
let connectionManager;
let messageRouter;
let logger;

/**
 * Lambda ハンドラー関数
 * @param {Object} event - API Gateway WebSocket イベント
 * @param {Object} context - Lambda コンテキスト
 * @returns {Promise<Object>} - API Gateway レスポンス
 */
exports.handler = async (event, context) => {
  // 初回実行時のみ初期化
  if (!logger) {
    logger = new Logger({ 
      component: 'WebSocketHandler',
      requestId: context.requestId 
    });
  }

  if (!connectionManager) {
    connectionManager = new ConnectionManager();
  }

  if (!messageRouter) {
    const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
    messageRouter = new MessageRouter(endpoint);
  }

  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  logger.info('WebSocket request received', {
    routeKey,
    connectionId,
    requestId: context.requestId,
    sourceIp: event.requestContext.identity?.sourceIp
  });

  // パフォーマンスメトリクスのトラッキング開始
  const startTime = Date.now();
  let response;

  try {
    switch (routeKey) {
      case '$connect':
        response = await handleConnect(event, connectionManager);
        break;
      
      case '$disconnect':
        response = await handleDisconnect(event, connectionManager);
        break;
      
      case '$default':
        response = await handleDefault(event, connectionManager, messageRouter);
        break;
      
      default:
        logger.warn('Unknown route', { routeKey });
        response = {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unknown route' })
        };
    }

    // レスポンス時間のメトリクス記録
    const responseTime = Date.now() - startTime;
    logger.metric('WebSocketResponseTime', responseTime, 'Milliseconds', {
      routeKey,
      statusCode: response.statusCode
    });

    // 成功レスポンスのロギング
    logger.info('Request processed successfully', {
      routeKey,
      connectionId,
      statusCode: response.statusCode,
      responseTime
    });

    return response;

  } catch (error) {
    // エラーハンドリング
    logger.error('Request processing failed', error);
    
    logger.metric('WebSocketErrors', 1, 'Count', {
      routeKey,
      errorType: error.name || 'UnknownError'
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        requestId: context.requestId 
      })
    };
  }
};

/**
 * $connect ルートのハンドラー
 * @param {Object} event - API Gateway イベント
 * @param {ConnectionManager} connectionManager - 接続マネージャー
 * @returns {Promise<Object>} - レスポンス
 */
async function handleConnect(event, connectionManager) {
  const connectionId = event.requestContext.connectionId;
  const { sourceIp, userAgent } = event.requestContext.identity || {};
  
  logger.info('Client connecting', {
    connectionId,
    sourceIp,
    userAgent
  });

  try {
    // クエリパラメータからメタデータを取得
    const queryParams = event.queryStringParameters || {};
    
    // 接続メタデータを準備
    const metadata = {
      clientIp: sourceIp,
      userAgent: userAgent,
      stage: event.requestContext.stage,
      domainName: event.requestContext.domainName,
      connectedVia: 'WebSocket',
      ...queryParams // クエリパラメータから追加のメタデータを含める
    };

    // 接続を登録
    await connectionManager.registerConnection(connectionId, metadata);

    logger.audit('CLIENT_CONNECTED', {
      connectionId,
      sourceIp,
      metadata
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Connected successfully',
        connectionId 
      })
    };

  } catch (error) {
    logger.error('Failed to handle connection', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to establish connection' 
      })
    };
  }
}

/**
 * $disconnect ルートのハンドラー
 * @param {Object} event - API Gateway イベント
 * @param {ConnectionManager} connectionManager - 接続マネージャー
 * @returns {Promise<Object>} - レスポンス
 */
async function handleDisconnect(event, connectionManager) {
  const connectionId = event.requestContext.connectionId;
  const { sourceIp } = event.requestContext.identity || {};
  
  logger.info('Client disconnecting', {
    connectionId,
    sourceIp
  });

  try {
    // 接続を削除
    await connectionManager.removeConnection(connectionId);

    logger.audit('CLIENT_DISCONNECTED', {
      connectionId,
      sourceIp,
      reason: event.requestContext.disconnectReason || 'Client initiated'
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Disconnected successfully' 
      })
    };

  } catch (error) {
    logger.error('Failed to handle disconnection', error);
    // 切断時のエラーは成功として扱う（接続は既に切れている）
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Disconnection processed' 
      })
    };
  }
}

/**
 * $default ルートのハンドラー（メッセージ処理）
 * @param {Object} event - API Gateway イベント
 * @param {ConnectionManager} connectionManager - 接続マネージャー
 * @param {MessageRouter} messageRouter - メッセージルーター
 * @returns {Promise<Object>} - レスポンス
 */
async function handleDefault(event, connectionManager, messageRouter) {
  const connectionId = event.requestContext.connectionId;
  
  logger.info('Message received', {
    connectionId,
    bodySize: event.body?.length || 0
  });

  try {
    // 接続の健全性をチェック
    const isHealthy = await connectionManager.isConnectionHealthy(connectionId);
    
    if (!isHealthy) {
      logger.warn('Unhealthy connection detected', { connectionId });
      // 不健全な接続でもメッセージは処理を試みる
    }

    // メッセージをルーティング
    const result = await messageRouter.routeMessage(event, connectionManager);
    
    return result;

  } catch (error) {
    logger.error('Failed to handle message', error);
    
    // エラーをクライアントに通知
    try {
      await messageRouter.sendError(connectionId, 'Message processing failed');
    } catch (sendError) {
      logger.error('Failed to send error to client', sendError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to process message' 
      })
    };
  }
}

/**
 * グレースフルシャットダウン用のハンドラー
 * Lambda環境では通常使用されないが、ローカルテスト用に実装
 */
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    // アクティブな接続を取得して通知
    if (connectionManager) {
      const activeConnections = await connectionManager.getActiveConnections();
      logger.info('Active connections on shutdown', { 
        count: activeConnections.length 
      });
    }
  } catch (error) {
    logger.error('Error during shutdown', error);
  }
  
  process.exit(0);
});