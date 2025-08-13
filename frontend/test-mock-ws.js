import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('✅ Connected to mock server');
  
  // Ping送信
  ws.send(JSON.stringify({
    action: 'ping',
    payload: {},
    timestamp: new Date().toISOString()
  }));
  
  // 音声データ送信のテスト
  setTimeout(() => {
    ws.send(JSON.stringify({
      action: 'audioData',
      payload: { audio: 'base64_encoded_audio_data_here' },
      timestamp: new Date().toISOString()
    }));
  }, 1000);
  
  // 5秒後に切断
  setTimeout(() => {
    console.log('Closing connection...');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  console.log('📨 Received:', JSON.parse(data.toString()));
});

ws.on('error', (error) => {
  console.error('❌ Error:', error);
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});