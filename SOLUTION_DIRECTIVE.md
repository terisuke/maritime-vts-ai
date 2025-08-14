# 🚨 緊急修正指示書 - Path A: 現行システム修正

## ⏱️ タイムライン（40分）
- **11:40** - 修正開始
- **11:45** - AudioWorklet修正完了
- **11:55** - バッファリング実装完了
- **12:05** - デバッグパネル実装完了
- **12:20** - テスト完了・評価

## 🔴 修正1: AudioWorkletのsetTimeout削除（最重要）

### 問題箇所
```typescript
// frontend/src/hooks/useAudioRecorder.ts - 129-139行目
setTimeout(() => {
  if (workletRef.current) {
    workletRef.current.port.postMessage({ command: 'start' });
  }
}, 500); // ← この500msの遅延が問題！
```

### 修正内容
```typescript
// 即座に開始コマンドを送信
if (workletRef.current) {
  workletRef.current.port.postMessage({ command: 'start' });
  console.log('CRITICAL: Start command sent to AudioWorklet immediately');
}
```

## 🔵 修正2: AudioWorkletバッファリング実装

### audio-processor-worklet.js の修正
```javascript
class AudioPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.buffer = [];
    this.bufferSize = 4096; // 256ms分のバッファ
    
    this.port.onmessage = (event) => {
      if (event.data.command === 'start') {
        this.isRecording = true;
        console.log('AudioWorklet: Recording STARTED immediately');
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        this.flushBuffer(); // 停止時にバッファをフラッシュ
      }
    };
  }
  
  flushBuffer() {
    if (this.buffer.length > 0) {
      const mergedBuffer = this.mergeBuffers(this.buffer);
      this.port.postMessage({
        type: 'audioData',
        data: mergedBuffer
      });
      this.buffer = [];
    }
  }
  
  mergeBuffers(buffers) {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
      merged.set(buffer, offset);
      offset += buffer.length;
    }
    return merged;
  }
  
  process(inputs, outputs, parameters) {
    if (!this.isRecording) return true;
    
    const input = inputs[0];
    if (input && input[0]) {
      const float32Data = input[0];
      const int16Data = new Int16Array(float32Data.length);
      
      for (let i = 0; i < float32Data.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Data[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      this.buffer.push(int16Data);
      
      // バッファが満杯になったら送信
      const totalSamples = this.buffer.reduce((acc, buf) => acc + buf.length, 0);
      if (totalSamples >= this.bufferSize) {
        this.flushBuffer();
      }
    }
    
    return true;
  }
}
```

## 🟢 修正3: デバッグパネル追加

### VHFRadioInterface.tsx に追加
```typescript
// デバッグパネルコンポーネント
const DebugPanel = ({ isRecording, audioLevel, websocketStatus, transcripts }) => (
  <div className="fixed bottom-0 right-0 bg-black bg-opacity-80 text-green-400 p-4 font-mono text-xs">
    <div>🎙️ Recording: {isRecording ? 'ON' : 'OFF'}</div>
    <div>📊 Audio Level: {(audioLevel * 100).toFixed(0)}%</div>
    <div>🔌 WebSocket: {websocketStatus}</div>
    <div>📝 Last Transcript: {transcripts[transcripts.length - 1] || 'None'}</div>
    <div>⏰ Time: {new Date().toISOString()}</div>
  </div>
);
```

## 🎯 テスト手順

### 1. ブラウザコンソール確認
```javascript
// 期待される出力
"AudioWorklet: Recording STARTED immediately"
"CRITICAL: Start command sent to AudioWorklet immediately"
"AudioWorklet: Sending PCM data, length = 4096"
```

### 2. CloudWatchログ確認
```bash
aws logs tail /aws/lambda/vts-websocket-handler --follow | grep -E "(chunksProcessed|Transcribe|audioData)"
```

期待される出力：
- `chunksProcessed: [1以上の数値]`
- `Transcribe session started`
- `Transcription result`

### 3. フロントエンド確認
- 音量ゲージが動く
- デバッグパネルにRecording: ON表示
- WebSocket: Connected表示

## ⚠️ 注意事項

1. **Chrome/Edgeで必ずテスト**（Safariは非推奨）
2. **HTTPSでアクセス**（マイク権限のため）
3. **ブラウザキャッシュをクリア**

## 🚦 成功基準

✅ 以下が全て確認できれば成功：
1. `isRecording = true` がコンソールに表示
2. CloudWatchで `chunksProcessed > 0`
3. 音声レベルメーターが反応
4. WebSocketエラーなし

## ❌ 失敗時の対処

40分後に動作しない場合：
→ **即座にPath B（Amplify移行）へ移行**

## 📝 修正ファイル一覧

1. `frontend/src/hooks/useAudioRecorder.ts` - setTimeout削除
2. `frontend/public/audio-processor-worklet.js` - バッファリング追加
3. `frontend/src/components/VHFRadioInterface.tsx` - デバッグパネル追加

---

**開始時刻**: _____
**完了予定**: 開始時刻 + 40分
**判断時刻**: 開始時刻 + 40分