// WebSocket接続テストスクリプト
import WebSocket from 'ws';

const WS_URL = 'wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod';

console.log('Connecting to WebSocket:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Ping送信
  const pingMessage = JSON.stringify({
    action: 'ping',
    payload: {},
    timestamp: new Date().toISOString()
  });
  
  console.log('Sending ping:', pingMessage);
  ws.send(pingMessage);
  
  // 5秒後に切断
  setTimeout(() => {
    console.log('Closing connection...');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  console.log('📨 Received message:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket disconnected');
  process.exit(0);
});