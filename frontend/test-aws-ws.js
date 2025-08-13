import WebSocket from 'ws';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.staging' });

const WS_URL = process.env.VITE_WS_URL || 'ws://localhost:8080';

if (!WS_URL.includes('localhost') && !process.env.ALLOW_PRODUCTION_TEST) {
  console.error('⚠️ WARNING: Attempting to connect to production environment!');
  console.error('Set ALLOW_PRODUCTION_TEST=true to proceed');
  process.exit(1);
}

console.log('🔌 Connecting to WebSocket:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to AWS WebSocket!');
  
  // Send ping
  const pingMessage = JSON.stringify({
    action: 'ping',
    payload: {},
    timestamp: new Date().toISOString()
  });
  
  console.log('📤 Sending ping:', pingMessage);
  ws.send(pingMessage);
  
  // Test audio data
  setTimeout(() => {
    console.log('📤 Sending test audio data...');
    ws.send(JSON.stringify({
      action: 'audioData',
      payload: { 
        audio: 'dGVzdCBhdWRpbyBkYXRh' // "test audio data" in base64
      },
      timestamp: new Date().toISOString()
    }));
  }, 1000);
  
  // Close after 5 seconds to see the transcription response
  setTimeout(() => {
    console.log('Closing connection...');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  console.log('📨 Received:', JSON.parse(data.toString()));
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('👋 Connection closed');
  process.exit(0);
});