import WebSocket from 'ws';

const WS_URL = 'wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod';

console.log('🔌 Connecting to AWS WebSocket:', WS_URL);

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