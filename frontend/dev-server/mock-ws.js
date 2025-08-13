import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

console.log('🚀 Mock WebSocket server running on ws://localhost:8080');

wss.on('connection', (ws) => {
  console.log('✅ Client connected');
  
  // 接続確認メッセージ
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to mock server',
    connectionId: `conn_${Date.now()}`,
    timestamp: new Date().toISOString()
  }));

  // メッセージハンドラー
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received:', message);
      
      // pingへの応答
      if (message.action === 'ping') {
        ws.send(JSON.stringify({ 
          type: 'pong', 
          timestamp: new Date().toISOString() 
        }));
      }
      
      // 音声録音開始
      if (message.action === 'startTranscription') {
        ws.send(JSON.stringify({
          type: 'status',
          message: 'Transcription started',
          timestamp: new Date().toISOString()
        }));
      }
      
      // 音声データ受信時のモック文字起こし
      if (message.action === 'audioData') {
        // ランダムな遅延後に部分的な文字起こし結果を送信
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'transcription',
            payload: {
              transcriptText: '本船は東京湾入口を通過中',
              confidence: 0.85,
              timestamp: new Date().toISOString(),
              isPartial: true,
              speakerLabel: 'VTS'
            }
          }));
        }, 500);
        
        // 最終的な文字起こし結果
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'transcription',
            payload: {
              transcriptText: '本船は東京湾入口を通過中です。現在の速力は12ノット。',
              confidence: 0.95,
              timestamp: new Date().toISOString(),
              isPartial: false,
              speakerLabel: 'VTS'
            }
          }));
          
          // AI応答のモック
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'aiResponse',
              payload: {
                classification: 'GREEN',
                suggestedResponse: '了解しました。東京湾内では速力を10ノット以下に減速してください。',
                confidence: 0.92,
                riskFactors: [],
                timestamp: new Date().toISOString()
              }
            }));
          }, 1000);
        }, 2000);
      }
      
      // 録音停止
      if (message.action === 'stopTranscription') {
        ws.send(JSON.stringify({
          type: 'status',
          message: 'Transcription stopped',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
  
  // 定期的にpingを送信
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
});

console.log('Mock server ready. Waiting for connections...');