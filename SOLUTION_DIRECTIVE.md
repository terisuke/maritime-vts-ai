# 音声入力問題 解決指示書
**作成日**: 2025年8月14日  
**優先度**: 🔴 CRITICAL

## 📊 問題診断結果

### 1. 根本原因の特定

#### 🔴 Critical Issue: AudioWorkletの競合状態
**場所**: `frontend/src/hooks/useAudioRecorder.ts` 146-157行目

```javascript
// 問題のコード
setTimeout(() => {
  console.log('CRITICAL: setTimeout executing now, workletRef.current:', workletRef.current);
  if (workletRef.current) {
    console.log('AudioWorkletに開始コマンドを送信');
    workletRef.current.port.postMessage({ command: 'start' });
    console.log('CRITICAL: Start command sent to AudioWorklet');
  } else {
    console.error('CRITICAL: workletRef.current is null in setTimeout!');
  }
}, 500);
```

**問題**: 
- setTimeoutの500ms遅延中にコンポーネントが再レンダリングされ、refが失われる
- isRecordingがtrueに設定されても、AudioWorkletがstartコマンドを受信しない

#### 🟡 Issue 2: モデルIDの不一致
**場所**: 複数のファイル
- 設定: `apac.anthropic.claude-sonnet-4-20250514-v1:0`
- 実際に必要: APACリージョンのプレフィックス

#### 🟠 Issue 3: Transcribeセッション管理
**場所**: `backend/lambda/websocket-handler/shared/transcribe-processor.js`
- 同時接続数の制限（25ストリーム）にすぐ到達
- セッションクリーンアップが不十分

## 🛠️ 即座に実施すべき修正

### **Priority 1: AudioWorklet修正（5分）**

#### 修正1: useAudioRecorder.ts
```javascript
// frontend/src/hooks/useAudioRecorder.ts の 146行目付近を修正

// 現在のコード（問題あり）
setTimeout(() => {
  if (workletRef.current) {
    workletRef.current.port.postMessage({ command: 'start' });
  }
}, 500);

// 修正後のコード
// setTimeoutを削除し、即座に送信
if (workletRef.current) {
  workletRef.current.port.postMessage({ command: 'start' });
  console.log('AudioWorklet start command sent immediately');
}
```

#### 修正2: audio-processor-worklet.js
```javascript
// frontend/public/audio-processor-worklet.js の constructor を修正

constructor() {
  super();
  this.isRecording = false;
  this.processCallCount = 0;
  this.bufferSize = 4096; // バッファサイズを追加
  this.audioBuffer = []; // バッファリング追加
  
  console.log('AudioWorklet: Constructor called - AudioPCMProcessor initialized');
  
  this.port.onmessage = (event) => {
    console.log('AudioWorklet: Message received:', event.data);
    
    if (event.data.command === 'start') {
      this.isRecording = true;
      this.audioBuffer = []; // バッファをクリア
      console.log('AudioWorklet: Recording STARTED');
    } else if (event.data.command === 'stop') {
      this.isRecording = false;
      // 残りのバッファを送信
      if (this.audioBuffer.length > 0) {
        this.sendBufferedAudio();
      }
      console.log('AudioWorklet: Recording STOPPED');
    }
  };
}

// 新しいメソッドを追加
sendBufferedAudio() {
  if (this.audioBuffer.length === 0) return;
  
  const pcmData = new Int16Array(this.audioBuffer);
  this.port.postMessage({
    type: 'audioData',
    data: pcmData
  });
  
  this.audioBuffer = [];
}

// process メソッドも修正
process(inputs, outputs, parameters) {
  if (!this.isRecording) {
    return true;
  }

  const input = inputs[0];
  if (input && input.length > 0) {
    const channelData = input[0];
    
    if (channelData && channelData.length > 0) {
      // PCMに変換してバッファに追加
      for (let i = 0; i < channelData.length; i++) {
        const clampedValue = Math.max(-1, Math.min(1, channelData[i]));
        const pcmValue = Math.floor(clampedValue * 32767);
        this.audioBuffer.push(pcmValue);
      }
      
      // バッファが一定サイズに達したら送信
      if (this.audioBuffer.length >= this.bufferSize) {
        this.sendBufferedAudio();
      }
    }
  }
  
  return true;
}
```

### **Priority 2: 簡易デバッグモード実装（10分）**

#### デバッグコンポーネント作成
```typescript
// frontend/src/components/debug/AudioDebugPanel.tsx（新規作成）
import React from 'react';

interface AudioDebugPanelProps {
  isRecording: boolean;
  audioLevel: number;
  connectionStatus: string;
  lastTranscription?: string;
  errorLog?: string[];
}

const AudioDebugPanel: React.FC<AudioDebugPanelProps> = ({
  isRecording,
  audioLevel,
  connectionStatus,
  lastTranscription,
  errorLog = []
}) => {
  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-green-400 p-4 rounded-lg font-mono text-xs max-w-md">
      <h3 className="text-yellow-400 mb-2">🔧 Debug Panel</h3>
      <div className="space-y-1">
        <div>Recording: {isRecording ? '🔴 ON' : '⚫ OFF'}</div>
        <div>Audio Level: {(audioLevel * 100).toFixed(1)}%</div>
        <div>WebSocket: {connectionStatus}</div>
        <div>Last Text: {lastTranscription || 'None'}</div>
      </div>
      {errorLog.length > 0 && (
        <div className="mt-2 text-red-400">
          <div>Errors:</div>
          {errorLog.slice(-3).map((err, i) => (
            <div key={i} className="text-xs">{err}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AudioDebugPanel;
```

### **Priority 3: テスト音声生成（検証用）**

#### テストトーン生成追加
```javascript
// frontend/src/utils/testAudioGenerator.js（新規作成）
export function generateTestTone(frequencyHz = 440, durationMs = 1000) {
  const sampleRate = 16000;
  const samples = (sampleRate * durationMs) / 1000;
  const pcmData = new Int16Array(samples);
  
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequencyHz * t);
    pcmData[i] = Math.floor(value * 32767);
  }
  
  return pcmData;
}

// AudioRecorderに追加
const sendTestTone = () => {
  const testData = generateTestTone(440, 500);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(testData.buffer)));
  websocketService.send({
    action: 'audioData',
    payload: { audio: base64 },
    timestamp: new Date().toISOString()
  });
  console.log('Test tone sent:', testData.length, 'samples');
};
```

## 🚀 段階的実装手順

### **Phase 1: 緊急修正（今すぐ）**

1. **AudioWorklet修正**
   ```bash
   cd frontend
   # useAudioRecorder.tsの setTimeout削除
   # audio-processor-worklet.jsのバッファリング追加
   npm run dev
   ```

2. **テスト実施**
   ```bash
   # ブラウザコンソールで確認
   # 1. 録音開始
   # 2. "AudioWorklet: Recording STARTED"を確認
   # 3. "AudioWorklet: Sending PCM data"を確認
   ```

### **Phase 2: サーバー側確認（30分以内）**

1. **CloudWatch Logsで確認**
   ```bash
   aws logs tail /aws/lambda/vts-websocket-handler --follow | grep -E "(audioData|Transcribe)"
   ```

2. **Lambda関数の直接テスト**
   ```bash
   # test-audio.json作成
   cat > test-audio.json << EOF
   {
     "requestContext": {
       "connectionId": "test-connection",
       "routeKey": "\$default"
     },
     "body": "{\"action\":\"startTranscription\",\"payload\":{\"languageCode\":\"ja-JP\"}}"
   }
   EOF
   
   # テスト実行
   aws lambda invoke \
     --function-name vts-websocket-handler \
     --payload file://test-audio.json \
     response.json
   ```

### **Phase 3: 代替案への移行準備（1時間後に判断）**

もし上記の修正で解決しない場合：

#### **Option A: シンプルなHTTP APIへの切り替え**

```javascript
// frontend/src/services/simpleTranscriptionService.js
class SimpleTranscriptionService {
  async sendAudioForTranscription(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.wav');
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    
    return response.json();
  }
}
```

#### **Option B: AWS Amplify Predictionsへの移行**

```bash
# Amplifyセットアップ
npm install @aws-amplify/predictions

# 初期化
amplify init
amplify add predictions
amplify push
```

## 📊 成功基準

### 30分以内に確認すべき項目

| チェック項目 | 期待される結果 | 確認方法 |
|------------|--------------|---------|
| AudioWorklet動作 | isRecording=true | ブラウザコンソール |
| PCMデータ送信 | chunksProcessed > 0 | CloudWatch Logs |
| Transcribe応答 | transcriptionResult受信 | WebSocketメッセージ |
| AI応答 | aiResponse受信 | フロントエンド表示 |

## 🔴 最終判断ポイント

**1時間後の判断基準**：
- ✅ 音声データがTranscribeに届いている → 現行システム継続
- ❌ まだ動作しない → AWS Amplifyへの即座の移行

## 📞 エスカレーション

もし1時間で解決しない場合：

1. **AWS Amplify Predictions実装（推奨）**
   - 実装時間: 2-3時間
   - 信頼性: 高
   - コスト: 同等

2. **Amazon Chime SDK採用**
   - 実装時間: 4-6時間
   - 信頼性: 最高
   - コスト: やや高

3. **外部サービス（AssemblyAI）**
   - 実装時間: 1-2時間
   - 信頼性: 高
   - コスト: 月額$99〜

## 🎯 開発チームへの指示

**即座に実施**：
1. AudioWorkletのsetTimeout削除（5分）
2. バッファリング実装（10分）
3. デバッグパネル追加（10分）
4. テスト実施（15分）

**40分後に判断**：
- 動作する → 現行システムで継続
- 動作しない → AWS Amplifyへ移行開始

**重要**: 2025年8月の最新情報として、AWS Amplify Predictionsが最も安定した選択肢です。現在のWebSocket + Transcribe Streamingアプローチは技術的に複雑すぎます。

---
**承認者**: システムアーキテクト  
**実施期限**: 2025年8月14日 17:00まで
