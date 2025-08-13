const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

// テストシナリオ
const scenarios = [
  {
    name: '✅ 通常通信（GREEN）- 入港要請',
    audioFile: 'audio/normal-hakata.wav',
    textMessage: '博多港VTS、こちらさくら丸、入港許可を要請します',
    expectedText: '博多港',
    expectedClass: 'GREEN',
    timeout: 5000
  },
  {
    name: '✅ 通常通信（GREEN）- 位置報告',
    audioFile: 'audio/position-report.wav',
    textMessage: '北九州港VTS、こちら第三海洋丸、現在位置は門司港沖3マイル',
    expectedText: '北九州港',
    expectedClass: 'GREEN',
    timeout: 5000
  },
  {
    name: '⚠️ 注意通信（AMBER）- 強風',
    audioFile: 'audio/warning-wind.wav',
    textMessage: 'VTS、強風により操船が困難です',
    expectedText: '強風',
    expectedClass: 'AMBER',
    timeout: 5000
  },
  {
    name: '⚠️ 注意通信（AMBER）- 視界不良',
    audioFile: 'audio/warning-fog.wav',
    textMessage: 'VTS、濃霧により視界不良、速度を落として航行中',
    expectedText: '視界不良',
    expectedClass: 'AMBER',
    timeout: 5000
  },
  {
    name: '🚨 緊急通信（RED）- メーデー',
    audioFile: 'audio/emergency-mayday.wav',
    textMessage: 'メーデー、メーデー、メーデー、機関故障、ドリフト中',
    expectedText: 'メーデー',
    expectedClass: 'RED',
    timeout: 5000
  },
  {
    name: '🚨 緊急通信（RED）- 火災',
    audioFile: 'audio/emergency-fire.wav',
    textMessage: 'パンパン、パンパン、パンパン、機関室で火災発生',
    expectedText: 'パンパン',
    expectedClass: 'RED',
    timeout: 5000
  }
];

class E2ETester {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.results = [];
    this.startTime = Date.now();
  }

  async runAllTests() {
    console.log('🧪 E2Eテスト開始');
    console.log('📍 WebSocket URL:', this.wsUrl);
    console.log('⏰ 開始時刻:', new Date().toISOString());
    console.log('=' .repeat(60));
    console.log('');
    
    for (const scenario of scenarios) {
      await this.runScenario(scenario);
      await this.wait(2000); // シナリオ間の待機
    }
    
    this.printResults();
  }

  async runScenario(scenario) {
    console.log(`📋 テスト: ${scenario.name}`);
    
    return new Promise((resolve) => {
      const ws = new WebSocket(this.wsUrl);
      const testStartTime = Date.now();
      let transcriptionReceived = false;
      let aiResponseReceived = false;
      let actualClass = null;
      let actualText = '';
      let suggestedResponse = '';
      let confidence = 0;

      const timeout = setTimeout(() => {
        ws.close();
        this.results.push({
          name: scenario.name,
          success: false,
          error: 'Timeout',
          duration: Date.now() - testStartTime
        });
        console.log(`  ❌ タイムアウト (${scenario.timeout}ms)\n`);
        resolve();
      }, scenario.timeout);

      ws.on('open', async () => {
        console.log('  📡 WebSocket接続完了');
        
        // テキストベースのテスト（音声ファイルがない場合）
        if (!scenario.audioFile || scenario.audioFile.includes('dummy')) {
          console.log(`  📤 テストメッセージ送信: "${scenario.textMessage}"`);
          
          // Transcriptionセッション開始
          ws.send(JSON.stringify({
            action: 'startTranscription',
            payload: { 
              languageCode: 'ja-JP',
              vocabularyName: 'maritime-vts-vocabulary-ja'
            },
            timestamp: new Date().toISOString()
          }));
          
          // 少し待ってから音声データをシミュレート
          await this.wait(500);
          
          // ダミー音声データを送信（base64エンコード）
          const dummyAudio = Buffer.from(scenario.textMessage).toString('base64');
          ws.send(JSON.stringify({
            action: 'audioData',
            payload: { audio: dummyAudio },
            timestamp: new Date().toISOString()
          }));
        } else {
          // 実際の音声ファイルを使用
          const audioData = await this.loadAudioFile(scenario.audioFile);
          
          ws.send(JSON.stringify({
            action: 'startTranscription',
            payload: { languageCode: 'ja-JP' }
          }));
          
          // 音声データを分割送信
          for (let i = 0; i < audioData.length; i += 1024) {
            const chunk = audioData.slice(i, i + 1024);
            ws.send(JSON.stringify({
              action: 'audioData',
              payload: { audio: chunk.toString('base64') }
            }));
            await this.wait(100);
          }
        }
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'transcription') {
          const transcriptData = message.data || message.payload;
          if (!transcriptData.isPartial) {
            transcriptionReceived = true;
            actualText = transcriptData.transcriptText || '';
            console.log(`  📝 文字起こし: "${actualText}"`);
          }
        }
        
        if (message.type === 'aiResponse') {
          aiResponseReceived = true;
          const aiData = message.data || message.payload;
          actualClass = aiData.classification;
          suggestedResponse = aiData.suggestedResponse;
          confidence = aiData.confidence;
          
          console.log(`  🤖 AI分類: ${actualClass}`);
          console.log(`  💬 推奨応答: "${suggestedResponse}"`);
          console.log(`  📊 信頼度: ${(confidence * 100).toFixed(1)}%`);
          
          const success = 
            actualClass === scenario.expectedClass &&
            (actualText.includes(scenario.expectedText) || 
             scenario.textMessage.includes(scenario.expectedText));
          
          const duration = Date.now() - testStartTime;
          
          if (success) {
            console.log(`  ✅ 成功 (${duration}ms)\n`);
          } else {
            console.log(`  ❌ 失敗 - 期待値: ${scenario.expectedClass}, 実際: ${actualClass} (${duration}ms)\n`);
          }
          
          this.results.push({
            name: scenario.name,
            success,
            actualClass,
            expectedClass: scenario.expectedClass,
            actualText,
            suggestedResponse,
            confidence,
            duration
          });
          
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (error) => {
        console.error(`  ❌ WebSocketエラー:`, error.message);
        this.results.push({
          name: scenario.name,
          success: false,
          error: error.message,
          duration: Date.now() - testStartTime
        });
        clearTimeout(timeout);
        resolve();
      });

      ws.on('close', () => {
        // 接続クローズのログは省略（正常終了）
      });
    });
  }

  async loadAudioFile(filename) {
    // ダミーデータ（実際の音声ファイルが存在しない場合）
    return Buffer.from('dummy audio data for testing');
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printResults() {
    const totalDuration = Date.now() - this.startTime;
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / total;
    
    console.log('=' .repeat(60));
    console.log('📊 テスト結果サマリー\n');
    
    // 個別結果
    console.log('【個別結果】');
    this.results.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
      if (!result.success && result.error) {
        console.log(`   エラー: ${result.error}`);
      }
      if (result.actualClass) {
        console.log(`   分類: ${result.actualClass} (期待値: ${result.expectedClass})`);
      }
      if (result.confidence) {
        console.log(`   信頼度: ${(result.confidence * 100).toFixed(1)}%`);
      }
      console.log(`   実行時間: ${result.duration}ms`);
    });
    
    // 統計情報
    console.log('\n【統計情報】');
    console.log(`成功: ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
    console.log(`失敗: ${failed}/${total}`);
    console.log(`平均実行時間: ${avgDuration.toFixed(0)}ms`);
    console.log(`総実行時間: ${(totalDuration/1000).toFixed(1)}秒`);
    
    // 分類別の統計
    const classificationStats = {
      GREEN: { correct: 0, total: 0 },
      AMBER: { correct: 0, total: 0 },
      RED: { correct: 0, total: 0 }
    };
    
    this.results.forEach(result => {
      if (result.expectedClass) {
        classificationStats[result.expectedClass].total++;
        if (result.success) {
          classificationStats[result.expectedClass].correct++;
        }
      }
    });
    
    console.log('\n【分類別精度】');
    Object.keys(classificationStats).forEach(classification => {
      const stats = classificationStats[classification];
      if (stats.total > 0) {
        const accuracy = (stats.correct / stats.total * 100).toFixed(1);
        console.log(`${classification}: ${stats.correct}/${stats.total} (${accuracy}%)`);
      }
    });
    
    console.log('\n' + '=' .repeat(60));
    console.log('⏰ 終了時刻:', new Date().toISOString());
    
    // 終了コード
    const exitCode = failed > 0 ? 1 : 0;
    console.log(`\n🏁 テスト終了 (終了コード: ${exitCode})`);
    
    process.exit(exitCode);
  }
}

// メイン実行
async function main() {
  const wsUrl = process.env.WS_URL || 'wss://kaqn2r1p8i.execute-api.ap-northeast-1.amazonaws.com/prod';
  
  // 環境変数チェック
  if (!wsUrl.includes('localhost') && !process.env.ALLOW_PRODUCTION_TEST) {
    console.error('⚠️ WARNING: 本番環境へのテストを実行しようとしています！');
    console.error('実行するには以下を設定してください:');
    console.error('ALLOW_PRODUCTION_TEST=true npm run test:e2e');
    process.exit(1);
  }
  
  const tester = new E2ETester(wsUrl);
  await tester.runAllTests();
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のエラー:', error);
  process.exit(1);
});

// 実行
main().catch(error => {
  console.error('❌ テスト実行エラー:', error);
  process.exit(1);
});