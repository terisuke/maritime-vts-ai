#!/usr/bin/env node
/**
 * Maritime VTS AI MVP テストスクリプト
 * WebSocket接続とメッセージング機能をテスト
 */

const WebSocket = require('ws');
const readline = require('readline');

// WebSocketエンドポイント
const WS_URL = 'wss://1sgsvccfa2.execute-api.ap-northeast-1.amazonaws.com/dev';

// カラー出力用のヘルパー
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function timestamp() {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

class VTSTestClient {
  constructor() {
    this.ws = null;
    this.connectionId = null;
    this.isConnected = false;
    this.sessionId = `test-session-${Date.now()}`;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      log(`\n[${timestamp()}] 🚀 VTS WebSocket接続を開始...`, 'cyan');
      log(`エンドポイント: ${WS_URL}`, 'blue');
      
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        this.isConnected = true;
        log(`[${timestamp()}] ✅ WebSocket接続成功！`, 'green');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          log(`[${timestamp()}] 📨 Raw message: ${data.toString()}`, 'yellow');
        }
      });
      
      this.ws.on('error', (error) => {
        log(`[${timestamp()}] ❌ WebSocketエラー: ${error.message}`, 'red');
        reject(error);
      });
      
      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        log(`[${timestamp()}] 🔌 WebSocket切断 (Code: ${code}, Reason: ${reason})`, 'yellow');
      });
      
      // タイムアウト設定
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('接続タイムアウト'));
        }
      }, 10000);
    });
  }

  handleMessage(message) {
    log(`\n[${timestamp()}] 📥 受信メッセージ:`, 'cyan');
    console.log(JSON.stringify(message, null, 2));
    
    // メッセージタイプ別の処理
    if (message.type === 'CONNECTION_ACK') {
      this.connectionId = message.connectionId;
      log(`Connection ID: ${this.connectionId}`, 'green');
    } else if (message.type === 'TRANSCRIPTION_RESULT') {
      log(`🎙️ 文字起こし結果: ${message.text}`, 'magenta');
    } else if (message.type === 'AI_RESPONSE') {
      log(`🤖 AI応答:`, 'blue');
      log(`  分類: ${message.classification}`, 'blue');
      log(`  推奨応答: ${message.suggestedResponse}`, 'blue');
      log(`  信頼度: ${message.confidence}`, 'blue');
    } else if (message.type === 'ERROR') {
      log(`❌ エラー: ${message.error}`, 'red');
    }
  }

  async sendMessage(action, payload = {}) {
    if (!this.isConnected) {
      log('❌ WebSocketが接続されていません', 'red');
      return;
    }
    
    const message = {
      action,
      ...payload,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
    
    log(`\n[${timestamp()}] 📤 送信メッセージ:`, 'cyan');
    console.log(JSON.stringify(message, null, 2));
    
    this.ws.send(JSON.stringify(message));
  }

  async runTests() {
    log('\n========== MVPテストシナリオ開始 ==========', 'magenta');
    
    // Test 1: Pingテスト
    log('\n📍 Test 1: Ping接続確認', 'yellow');
    await this.sendMessage('ping');
    await this.sleep(2000);
    
    // Test 2: 通常メッセージ
    log('\n📍 Test 2: 通常の海事通信メッセージ', 'yellow');
    await this.sendMessage('message', {
      text: 'こちら貨物船「さくら丸」、博多港入港許可を要請します。',
      vesselInfo: {
        name: 'さくら丸',
        type: '貨物船',
        position: '33.6064° N, 130.4183° E'
      }
    });
    await this.sleep(3000);
    
    // Test 3: 緊急通信
    log('\n📍 Test 3: 緊急通信シミュレーション', 'yellow');
    await this.sendMessage('message', {
      text: 'メーデー、メーデー、こちら漁船「海風」、エンジン故障、ドリフト中、即座の支援を要請',
      vesselInfo: {
        name: '海風',
        type: '漁船',
        position: '33.5901° N, 130.4017° E'
      },
      priority: 'EMERGENCY'
    });
    await this.sleep(3000);
    
    // Test 4: 音声文字起こし開始
    log('\n📍 Test 4: 音声文字起こしセッション開始', 'yellow');
    await this.sendMessage('startTranscription', {
      language: 'ja-JP',
      vocabularyName: 'maritime-vts-vocabulary'
    });
    await this.sleep(2000);
    
    // Test 5: 音声データ送信（シミュレーション）
    log('\n📍 Test 5: 音声データ送信シミュレーション', 'yellow');
    const mockAudioData = Buffer.from('Mock audio data for testing').toString('base64');
    await this.sendMessage('audioData', {
      audio: mockAudioData,
      encoding: 'pcm',
      sampleRate: 16000
    });
    await this.sleep(2000);
    
    // Test 6: 音声文字起こし停止
    log('\n📍 Test 6: 音声文字起こしセッション停止', 'yellow');
    await this.sendMessage('stopTranscription');
    await this.sleep(2000);
    
    log('\n========== テストシナリオ完了 ==========', 'magenta');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect() {
    if (this.ws && this.isConnected) {
      log('\n[${timestamp()}] 👋 WebSocket接続を閉じます...', 'yellow');
      this.ws.close();
    }
  }
}

// インタラクティブモード
async function interactiveMode(client) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nVTS> '
  });
  
  log('\n📝 インタラクティブモード開始', 'cyan');
  log('使用可能なコマンド:', 'yellow');
  log('  message <text>  - メッセージを送信', 'yellow');
  log('  ping           - Ping送信', 'yellow');
  log('  start          - 文字起こし開始', 'yellow');
  log('  stop           - 文字起こし停止', 'yellow');
  log('  test           - テストシナリオ実行', 'yellow');
  log('  quit           - 終了', 'yellow');
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    const [command, ...args] = line.trim().split(' ');
    
    switch (command) {
      case 'message':
        await client.sendMessage('message', { text: args.join(' ') });
        break;
      case 'ping':
        await client.sendMessage('ping');
        break;
      case 'start':
        await client.sendMessage('startTranscription', { language: 'ja-JP' });
        break;
      case 'stop':
        await client.sendMessage('stopTranscription');
        break;
      case 'test':
        await client.runTests();
        break;
      case 'quit':
      case 'exit':
        await client.disconnect();
        rl.close();
        process.exit(0);
        break;
      default:
        if (command) {
          log(`不明なコマンド: ${command}`, 'red');
        }
    }
    
    rl.prompt();
  });
}

// メイン実行
async function main() {
  log('🚢 Maritime VTS AI - MVP テストクライアント', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  const client = new VTSTestClient();
  
  try {
    // WebSocket接続
    await client.connect();
    
    // 自動テスト実行
    const args = process.argv.slice(2);
    if (args.includes('--auto')) {
      await client.runTests();
      await client.sleep(5000);
      await client.disconnect();
      process.exit(0);
    } else {
      // インタラクティブモード
      await interactiveMode(client);
    }
    
  } catch (error) {
    log(`\n❌ エラー: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// WebSocketモジュールチェック
try {
  require.resolve('ws');
} catch (e) {
  log('⚠️  wsモジュールがインストールされていません', 'yellow');
  log('以下のコマンドを実行してください:', 'yellow');
  log('npm install ws', 'green');
  process.exit(1);
}

// 実行
main().catch(console.error);