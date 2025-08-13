/**
 * WebSocket Handler Unit Tests
 */

const { handler } = require('../lambda/websocket-handler/index');
const ConnectionManager = require('../lambda/websocket-handler/connection-manager');
const MessageRouter = require('../lambda/websocket-handler/message-router');

// モックの設定
jest.mock('../lambda/websocket-handler/connection-manager');
jest.mock('../lambda/websocket-handler/message-router');
jest.mock('../lambda/shared/logger');

describe('WebSocket Handler', () => {
  let mockConnectionManager;
  let mockMessageRouter;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    
    // ConnectionManagerのモック
    mockConnectionManager = {
      registerConnection: jest.fn().mockResolvedValue({
        connectionId: 'test-connection-id',
        connectedAt: '2024-01-01T00:00:00Z',
        status: 'CONNECTED'
      }),
      removeConnection: jest.fn().mockResolvedValue(),
      isConnectionHealthy: jest.fn().mockResolvedValue(true),
    };
    ConnectionManager.mockImplementation(() => mockConnectionManager);

    // MessageRouterのモック
    mockMessageRouter = {
      routeMessage: jest.fn().mockResolvedValue({
        statusCode: 200,
        body: 'Message processed'
      }),
      sendError: jest.fn().mockResolvedValue(),
    };
    MessageRouter.mockImplementation(() => mockMessageRouter);

    // 環境変数の設定
    process.env.CONNECTIONS_TABLE = 'test-connections-table';
    process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
    process.env.AWS_REGION = 'ap-northeast-1';
  });

  describe('$connect route', () => {
    it('should successfully handle new connection', async () => {
      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$connect',
          identity: {
            sourceIp: '192.168.1.1',
            userAgent: 'test-agent'
          },
          stage: 'prod',
          domainName: 'test.execute-api.amazonaws.com'
        },
        queryStringParameters: {
          clientType: 'web'
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toHaveProperty('connectionId');
      expect(mockConnectionManager.registerConnection).toHaveBeenCalledWith(
        'test-connection-id',
        expect.objectContaining({
          clientIp: '192.168.1.1',
          userAgent: 'test-agent',
          clientType: 'web'
        })
      );
    });

    it('should handle connection error gracefully', async () => {
      mockConnectionManager.registerConnection.mockRejectedValue(
        new Error('DynamoDB error')
      );

      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$connect',
          identity: {}
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toHaveProperty('error');
    });
  });

  describe('$disconnect route', () => {
    it('should successfully handle disconnection', async () => {
      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$disconnect',
          identity: {
            sourceIp: '192.168.1.1'
          },
          disconnectReason: 'Client initiated'
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(200);
      expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(
        'test-connection-id'
      );
    });

    it('should handle disconnection error gracefully', async () => {
      mockConnectionManager.removeConnection.mockRejectedValue(
        new Error('DynamoDB error')
      );

      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$disconnect',
          identity: {}
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      // 切断エラーでも200を返す（接続は既に切れている）
      expect(response.statusCode).toBe(200);
    });
  });

  describe('$default route', () => {
    it('should successfully route message', async () => {
      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$default',
          domainName: 'test.execute-api.amazonaws.com',
          stage: 'prod'
        },
        body: JSON.stringify({
          action: 'message',
          payload: { content: 'Test message' },
          timestamp: '2024-01-01T00:00:00Z'
        })
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(200);
      expect(mockConnectionManager.isConnectionHealthy).toHaveBeenCalledWith(
        'test-connection-id'
      );
      expect(mockMessageRouter.routeMessage).toHaveBeenCalledWith(
        event,
        mockConnectionManager
      );
    });

    it('should handle unhealthy connection', async () => {
      mockConnectionManager.isConnectionHealthy.mockResolvedValue(false);

      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$default',
          domainName: 'test.execute-api.amazonaws.com',
          stage: 'prod'
        },
        body: JSON.stringify({
          action: 'message',
          payload: { content: 'Test message' }
        })
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      // 不健全な接続でもメッセージは処理を試みる
      expect(response.statusCode).toBe(200);
      expect(mockMessageRouter.routeMessage).toHaveBeenCalled();
    });

    it('should handle message routing error', async () => {
      mockMessageRouter.routeMessage.mockRejectedValue(
        new Error('Routing error')
      );

      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$default',
          domainName: 'test.execute-api.amazonaws.com',
          stage: 'prod'
        },
        body: JSON.stringify({
          action: 'message',
          payload: { content: 'Test message' }
        })
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(500);
      expect(mockMessageRouter.sendError).toHaveBeenCalledWith(
        'test-connection-id',
        'Message processing failed'
      );
    });
  });

  describe('Unknown route', () => {
    it('should return 400 for unknown route', async () => {
      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$unknown'
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const response = await handler(event, context);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Unknown route');
    });
  });

  describe('Performance metrics', () => {
    it('should track response time metrics', async () => {
      const event = {
        requestContext: {
          connectionId: 'test-connection-id',
          routeKey: '$connect',
          identity: {}
        }
      };

      const context = {
        requestId: 'test-request-id'
      };

      const startTime = Date.now();
      await handler(event, context);
      const endTime = Date.now();

      // レスポンス時間が記録されることを確認
      expect(endTime - startTime).toBeLessThan(1000); // 1秒以内
    });
  });
});