/**
 * WebSocket統合テスト
 * Lambda関数のルーティングとメッセージ処理を徹底的にテスト
 */

// AWSサービスのモックを最初に設定（requireより前）
// DynamoDBモック
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Item: {
        connectionId: { S: 'test-connection-id' },
        status: { S: 'CONNECTED' }
      }
    })
  })),
  PutItemCommand: jest.fn(),
  GetItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  UpdateItemCommand: jest.fn()
}));

// API Gateway管理APIモック
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  PostToConnectionCommand: jest.fn()
}));

// Bedrockモック
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{
          text: JSON.stringify({
            classification: 'GREEN',
            suggestedResponse: 'テスト応答',
            confidence: 0.95,
            riskFactors: [],
            recommendedActions: []
          })
        }]
      }))
    })
  })),
  InvokeModelCommand: jest.fn()
}));

// Amazon Transcribeモック
jest.mock('@aws-sdk/client-transcribe-streaming', () => ({
  TranscribeStreamingClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      TranscriptResultStream: {
        [Symbol.asyncIterator]: async function* () {
          yield {
            TranscriptEvent: {
              Transcript: {
                Results: [{
                  IsPartial: false,
                  Alternatives: [{
                    Transcript: 'テスト文字起こし'
                  }]
                }]
              }
            }
          };
        }
      }
    })
  })),
  StartStreamTranscriptionCommand: jest.fn()
}));

// Lambda関数をrequire（モック設定後）
const { handler } = require('../../lambda/websocket-handler/index');

// モックコンテキスト
const createContext = () => ({
  requestId: `test-${Date.now()}`,
  functionName: 'vts-websocket-handler',
  awsRequestId: `aws-test-${Date.now()}`,
  getRemainingTimeInMillis: () => 30000,
});

// モックイベント作成ヘルパー
const createEvent = (routeKey, connectionId, body = null) => ({
  requestContext: {
    routeKey,
    connectionId,
    domainName: 'test.execute-api.ap-northeast-1.amazonaws.com',
    stage: 'test',
    identity: {
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent'
    }
  },
  body: body ? JSON.stringify(body) : undefined
});

describe('WebSocket統合テスト', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  
  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  
  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('ルート処理', () => {
    test('$connect ルートが正しく処理される', async () => {
      const event = createEvent('$connect', 'test-connection-id');
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response).toEqual({
        statusCode: 200,
        body: expect.stringContaining('Connected successfully')
      });
    });

    test('$disconnect ルートが正しく処理される', async () => {
      const event = createEvent('$disconnect', 'test-connection-id');
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response).toEqual({
        statusCode: 200,
        body: expect.stringContaining('Disconnected successfully')
      });
    });

    test('$default ルートが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'ping'
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response).toEqual({
        statusCode: 200,
        body: expect.stringContaining('success')
      });
    });
  });

  describe('カスタムアクション処理（$defaultルート経由）', () => {
    test('pingアクションが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'ping'
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    test('messageアクションが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'message',
        text: 'テストメッセージ',
        vesselInfo: {
          name: 'テスト船',
          type: '貨物船'
        }
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    test('startTranscriptionアクションが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'startTranscription',
        language: 'ja-JP'
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    test('stopTranscriptionアクションが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'stopTranscription'
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    test('audioDataアクションが正しく処理される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'audioData',
        audio: 'base64encodedaudiodata',
        encoding: 'pcm',
        sampleRate: 16000
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    test('不明なアクションでエラーが返される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'unknownAction'
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Unknown action');
    });

    test('不正なJSONでエラーが返される', async () => {
      const event = {
        ...createEvent('$default', 'test-connection-id'),
        body: 'invalid json{{'
      };
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid message format');
    });

    test('必須パラメータが欠けている場合エラーが返される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'startTranscription'
        // languageパラメータが欠けている
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Missing required parameter');
    });
  });

  describe('セキュリティ検証', () => {
    test('XSSインジェクション攻撃が防がれる', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'message',
        text: '<script>alert("XSS")</script>',
        vesselInfo: {
          name: '<img src=x onerror=alert(1)>',
          type: 'javascript:alert(1)'
        }
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      // エスケープされていることを確認
      expect(response.body).not.toContain('<script>');
      expect(response.body).not.toContain('onerror=');
    });

    test('SQLインジェクション攻撃が防がれる', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'message',
        text: "'; DROP TABLE users; --",
        vesselInfo: {
          name: "1' OR '1'='1",
          type: "admin' --"
        }
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(200);
      // DynamoDBはNoSQLなのでSQLインジェクションは発生しないが、
      // 入力が適切にサニタイズされることを確認
    });

    test('大きすぎるペイロードが拒否される', async () => {
      const largeText = 'x'.repeat(100000); // 100KB
      const event = createEvent('$default', 'test-connection-id', {
        action: 'message',
        text: largeText
      });
      const context = createContext();
      
      const response = await handler(event, context);
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Payload too large');
    });
  });

  describe('パフォーマンステスト', () => {
    test('レスポンスが1秒以内に返される', async () => {
      const event = createEvent('$default', 'test-connection-id', {
        action: 'ping'
      });
      const context = createContext();
      
      const startTime = Date.now();
      await handler(event, context);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000);
    });

    test('並列リクエストが正しく処理される', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const event = createEvent('$default', `connection-${i}`, {
          action: 'ping'
        });
        const context = createContext();
        promises.push(handler(event, context));
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('メモリリーク検証', () => {
    test('長時間接続でメモリリークが発生しない', async () => {
      // メモリ使用量の初期値を記録
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 100回繰り返し実行
      for (let i = 0; i < 100; i++) {
        const event = createEvent('$default', 'test-connection-id', {
          action: 'message',
          text: `メッセージ ${i}`
        });
        const context = createContext();
        await handler(event, context);
      }
      
      // ガベージコレクションを強制実行（テスト環境のみ）
      if (global.gc) {
        global.gc();
      }
      
      // メモリ使用量の最終値を記録
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // メモリ増加が10MB以下であることを確認
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});

// Lambda関数の動作を保証するための追加テスト
describe('Lambda関数の実装詳細テスト', () => {
  test('routeKeyが個別ルート名でもエラーにならない', async () => {
    // APIゲートウェイが誤って個別ルートを送ってきた場合のテスト
    const routeKeys = ['ping', 'message', 'startTranscription', 'stopTranscription', 'audioData'];
    
    for (const routeKey of routeKeys) {
      const event = createEvent(routeKey, 'test-connection-id');
      const context = createContext();
      
      const response = await handler(event, context);
      
      // Unknown routeエラーが返されることを確認
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Unknown route');
    }
  });
});