import WebSocket from 'ws';

const WS_URL = 'wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod';

console.log('🔌 Connecting to AWS WebSocket:', WS_URL);
console.log('📝 Testing Amazon Transcribe Streaming integration...');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to AWS WebSocket!');
  
  // Start transcription session
  const startMessage = JSON.stringify({
    action: 'startTranscription',
    payload: {
      languageCode: 'ja-JP',
      sampleRate: 16000
    },
    timestamp: new Date().toISOString()
  });
  
  console.log('📤 Starting transcription session...');
  ws.send(startMessage);
  
  // Send test audio data (simulate small audio chunks)
  setTimeout(() => {
    console.log('📤 Sending test audio chunk 1...');
    
    // Create a simple PCM audio buffer (silence)
    const audioBuffer = Buffer.alloc(3200, 0); // 100ms of 16kHz mono PCM
    const base64Audio = audioBuffer.toString('base64');
    
    ws.send(JSON.stringify({
      action: 'audioData',
      payload: { 
        audio: base64Audio,
        sequenceNumber: 1
      },
      timestamp: new Date().toISOString()
    }));
  }, 1000);
  
  // Send another chunk
  setTimeout(() => {
    console.log('📤 Sending test audio chunk 2...');
    
    const audioBuffer = Buffer.alloc(3200, 0);
    const base64Audio = audioBuffer.toString('base64');
    
    ws.send(JSON.stringify({
      action: 'audioData',
      payload: { 
        audio: base64Audio,
        sequenceNumber: 2
      },
      timestamp: new Date().toISOString()
    }));
  }, 2000);
  
  // Stop transcription
  setTimeout(() => {
    console.log('📤 Stopping transcription...');
    ws.send(JSON.stringify({
      action: 'stopTranscription',
      payload: {},
      timestamp: new Date().toISOString()
    }));
  }, 3000);
  
  // Close connection
  setTimeout(() => {
    console.log('👋 Closing connection...');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received:', JSON.stringify(message, null, 2));
  
  if (message.type === 'transcription') {
    console.log('🎯 Transcription result:');
    console.log('   Text:', message.payload?.transcriptText || 'N/A');
    console.log('   Confidence:', message.payload?.confidence || 'N/A');
    console.log('   Partial:', message.payload?.isPartial || false);
  } else if (message.type === 'error') {
    console.error('❌ Error:', message.error);
  } else if (message.type === 'status') {
    console.log('ℹ️ Status:', message.message);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('👋 Connection closed');
  process.exit(0);
});