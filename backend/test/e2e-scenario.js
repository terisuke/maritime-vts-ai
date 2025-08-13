import WebSocket from 'ws';
import dotenv from 'dotenv';

// stagingの設定を使用
dotenv.config({ path: '../../frontend/.env.staging' });

const WS_URL = process.env.VITE_WS_URL || 'ws://localhost:8080';

const scenarios = [
  {
    name: '博多港入港',
    message: {
      action: 'message',
      payload: { text: '博多港VTS、こちらさくら丸、入港許可要請' },
      timestamp: new Date().toISOString()
    },
    expectedClass: 'GREEN',
    timeout: 5000
  },
  {
    name: '緊急事態',
    message: {
      action: 'message', 
      payload: { text: 'メーデー、メーデー、機関故障' },
      timestamp: new Date().toISOString()
    },
    expectedClass: 'RED',
    timeout: 5000
  },
  {
    name: '注意状況',
    message: {
      action: 'message',
      payload: { text: '強風により操船困難です' },
      timestamp: new Date().toISOString()
    },
    expectedClass: 'AMBER',
    timeout: 5000
  }
];

async function testScenario(scenario) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing scenario: ${scenario.name}`);
    
    const ws = new WebSocket(WS_URL);
    let responseReceived = false;
    
    // タイムアウト設定
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        console.error(`❌ Timeout for scenario: ${scenario.name}`);
        ws.close();
        reject(new Error('Timeout'));
      }
    }, scenario.timeout);
    
    ws.on('open', () => {
      console.log(`✅ Connected for scenario: ${scenario.name}`);
      
      // 音声文字起こし開始
      ws.send(JSON.stringify({
        action: 'startTranscription',
        payload: { language: 'ja-JP' },
        timestamp: new Date().toISOString()
      }));
      
      // 少し待ってからメッセージ送信
      setTimeout(() => {
        console.log(`📤 Sending: ${scenario.message.payload.text}`);
        ws.send(JSON.stringify(scenario.message));
      }, 1000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received:`, message);
      
      // AI応答を確認
      if (message.type === 'aiResponse') {
        responseReceived = true;
        clearTimeout(timeout);
        
        const classification = message.payload?.classification || message.data?.classification;
        
        if (classification === scenario.expectedClass) {
          console.log(`✅ Scenario "${scenario.name}" passed: ${classification}`);
          resolve({
            scenario: scenario.name,
            success: true,
            classification: classification,
            response: message.payload?.suggestedResponse || message.data?.suggestedResponse
          });
        } else {
          console.error(`❌ Scenario "${scenario.name}" failed: Expected ${scenario.expectedClass}, got ${classification}`);
          resolve({
            scenario: scenario.name,
            success: false,
            expected: scenario.expectedClass,
            actual: classification
          });
        }
        
        ws.close();
      }
    });
    
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for scenario ${scenario.name}:`, error);
      clearTimeout(timeout);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log(`👋 Connection closed for scenario: ${scenario.name}`);
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting E2E Test Suite');
  console.log('📍 WebSocket URL:', WS_URL);
  console.log('=' .repeat(50));
  
  const results = [];
  
  for (const scenario of scenarios) {
    try {
      const result = await testScenario(scenario);
      results.push(result);
      
      // 次のテストまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      results.push({
        scenario: scenario.name,
        success: false,
        error: error.message
      });
    }
  }
  
  // 結果サマリー
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Test Results Summary:');
  console.log('=' .repeat(50));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.scenario}: ${result.success ? 'PASSED' : 'FAILED'}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.response) {
      console.log(`   AI Response: "${result.response}"`);
    }
  });
  
  console.log('=' .repeat(50));
  console.log(`Total: ${passed}/${scenarios.length} passed, ${failed}/${scenarios.length} failed`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// 環境変数チェック
if (!WS_URL.includes('localhost') && !process.env.ALLOW_PRODUCTION_TEST) {
  console.error('⚠️ WARNING: Attempting to test against production!');
  console.error('Set ALLOW_PRODUCTION_TEST=true to proceed');
  process.exit(1);
}

// テスト実行
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});