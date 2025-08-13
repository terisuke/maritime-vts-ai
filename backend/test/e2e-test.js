/**
 * End-to-End Test for VTS Maritime AI System
 * Transcribe + Bedrock統合テスト
 */

const WebSocket = require('ws');

const WS_URL = 'wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod';

// テストシナリオ定義
const scenarios = [
  {
    name: '博多港入港申請（通常）',
    input: '博多港VTS、こちらコンテナ船さくら丸、中央ふ頭への入港許可を要請します',
    expectedClassification: 'GREEN',
    expectedKeywords: ['入港', '許可', 'パイロット'],
    testType: 'text'
  },
  {
    name: '関門海峡警告（注意）',
    input: '門司港VTS、フェリーきたきゅう、強風により操船困難',
    expectedClassification: 'AMBER',
    expectedKeywords: ['注意', '安全', '待機'],
    testType: 'text'
  },
  {
    name: '緊急事態（緊急）',
    input: 'メーデー、メーデー、メーデー、タンカーげんかい、機関故障、若松沖で漂流中',
    expectedClassification: 'RED',
    expectedKeywords: ['緊急', '救助', '直ちに'],
    testType: 'text'
  },
  {
    name: '位置報告（通常）',
    input: '博多港VTS、貨物船はかた、現在香椎パークポート沖、速力12ノット',
    expectedClassification: 'GREEN',
    expectedKeywords: ['了解', '報告'],
    testType: 'text'
  },
  {
    name: '視界不良報告（注意）',
    input: 'VTSセンター、こちらクルーズ船、濃霧により視程200メートル以下',
    expectedClassification: 'AMBER',
    expectedKeywords: ['注意', '減速', '警戒'],
    testType: 'text'
  }
];

// テスト結果保存用
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

/**
 * 単一のシナリオをテスト
 */
async function testScenario(scenario) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const startTime = Date.now();
    let transcriptionReceived = false;
    let aiResponseReceived = false;
    const result = {
      scenario: scenario.name,
      success: false,
      transcription: null,
      aiResponse: null,
      responseTime: 0,
      errors: []
    };

    // タイムアウト設定（30秒）
    const timeout = setTimeout(() => {
      result.errors.push('Timeout: Test did not complete within 30 seconds');
      ws.close();
      resolve(result);
    }, 30000);

    ws.on('open', () => {
      console.log(`\n🔌 Testing: ${scenario.name}`);
      
      // テキストベースのテスト（実際の音声の代わりにモックテキストを送信）
      if (scenario.testType === 'text') {
        // Transcribeセッション開始をシミュレート
        setTimeout(() => {
          // 仮の文字起こし結果を直接処理させる
          // 注: 実際のテストでは音声データを送信する必要がある
          console.log(`📤 Sending test input: "${scenario.input}"`);
          
          // startTranscriptionを送信
          ws.send(JSON.stringify({
            action: 'startTranscription',
            payload: {
              languageCode: 'ja-JP'
            },
            timestamp: new Date().toISOString()
          }));
        }, 100);
      }
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'status' && message.message === 'Transcription started') {
        console.log('✅ Transcription session started');
        // セッション開始後、すぐに停止（モックテストのため）
        setTimeout(() => {
          ws.send(JSON.stringify({
            action: 'stopTranscription',
            payload: {},
            timestamp: new Date().toISOString()
          }));
        }, 500);
      }
      
      if (message.type === 'transcription') {
        console.log('📝 Transcription received:', message.payload?.transcriptText);
        result.transcription = message.payload;
        transcriptionReceived = true;
      }
      
      if (message.type === 'aiResponse') {
        console.log('🤖 AI Response received:', {
          classification: message.payload?.classification,
          response: message.payload?.suggestedResponse
        });
        
        result.aiResponse = message.payload;
        result.responseTime = Date.now() - startTime;
        aiResponseReceived = true;
        
        // 結果を検証
        if (message.payload?.classification === scenario.expectedClassification) {
          result.success = true;
          console.log(`✅ Classification matched: ${scenario.expectedClassification}`);
        } else {
          result.errors.push(`Classification mismatch: expected ${scenario.expectedClassification}, got ${message.payload?.classification}`);
        }
        
        // キーワードチェック
        const response = message.payload?.suggestedResponse || '';
        const missingKeywords = scenario.expectedKeywords.filter(keyword => 
          !response.includes(keyword)
        );
        
        if (missingKeywords.length > 0) {
          console.log(`⚠️ Missing keywords: ${missingKeywords.join(', ')}`);
        }
        
        clearTimeout(timeout);
        ws.close();
        resolve(result);
      }
      
      if (message.type === 'error') {
        console.error('❌ Error:', message.error);
        result.errors.push(message.error);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      result.errors.push(error.message);
      clearTimeout(timeout);
      resolve(result);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!aiResponseReceived && !result.errors.length) {
        result.errors.push('Connection closed without receiving AI response');
      }
      resolve(result);
    });
  });
}

/**
 * 全シナリオを順次実行
 */
async function runE2ETests() {
  console.log('🚀 Starting End-to-End Tests for VTS Maritime AI System');
  console.log('=' .repeat(60));
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log(`Total scenarios: ${scenarios.length}`);
  console.log('=' .repeat(60));

  for (const scenario of scenarios) {
    testResults.total++;
    const result = await testScenario(scenario);
    
    if (result.success) {
      testResults.passed++;
      console.log(`✅ PASSED: ${scenario.name} (${result.responseTime}ms)`);
    } else {
      testResults.failed++;
      console.log(`❌ FAILED: ${scenario.name}`);
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
    
    testResults.details.push(result);
    
    // 次のテストまで2秒待機
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 結果サマリー
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Results Summary');
  console.log('=' .repeat(60));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  // 詳細レポート
  console.log('\n📋 Detailed Results:');
  testResults.details.forEach((detail, index) => {
    console.log(`\n${index + 1}. ${detail.scenario}`);
    console.log(`   Status: ${detail.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (detail.aiResponse) {
      console.log(`   Classification: ${detail.aiResponse.classification}`);
      console.log(`   Confidence: ${(detail.aiResponse.confidence * 100).toFixed(1)}%`);
      console.log(`   Response Time: ${detail.responseTime}ms`);
    }
    if (detail.errors.length > 0) {
      console.log(`   Errors: ${detail.errors.join(', ')}`);
    }
  });

  // パフォーマンス統計
  const successfulTests = testResults.details.filter(d => d.success);
  if (successfulTests.length > 0) {
    const avgResponseTime = successfulTests.reduce((sum, d) => sum + d.responseTime, 0) / successfulTests.length;
    const maxResponseTime = Math.max(...successfulTests.map(d => d.responseTime));
    const minResponseTime = Math.min(...successfulTests.map(d => d.responseTime));
    
    console.log('\n⚡ Performance Metrics:');
    console.log(`   Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`   Max Response Time: ${maxResponseTime}ms`);
    console.log(`   Min Response Time: ${minResponseTime}ms`);
  }

  // 終了
  console.log('\n✨ E2E Tests completed');
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// 引数処理
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node e2e-test.js [options]');
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log('  --single <n>  Run only scenario number <n>');
  process.exit(0);
}

if (args.includes('--single')) {
  const index = parseInt(args[args.indexOf('--single') + 1]) - 1;
  if (index >= 0 && index < scenarios.length) {
    testScenario(scenarios[index]).then(result => {
      console.log('\nTest completed:', result);
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.error('Invalid scenario index');
    process.exit(1);
  }
} else {
  // 全テスト実行
  runE2ETests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}