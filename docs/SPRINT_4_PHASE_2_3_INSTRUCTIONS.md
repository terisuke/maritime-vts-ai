# 🎯 Sprint 4 Phase 2-3 実装指示書

## 📅 2025年8月15日

開発チーム各位

Phase 1の素晴らしい実装と迅速なデプロイ、お疲れ様でした！
音声出力UIの常時表示化が確認でき、ユーザビリティが大幅に向上しました。

## ✅ Phase 1 実装確認

### 完了した実装
- ✅ 音声出力コントロールの常時表示
- ✅ AI応答がない時のグレーアウト
- ✅ 自動読み上げのデフォルトOFF設定
- ✅ 本番環境へのデプロイ

**評価**: 要件通り完璧に実装されています！

---

## 🚀 Phase 2: PTT（Push-to-Talk）方式の実装

### 実装優先順位
1. **基本PTT機能**（本日午前）
2. **モード切替UI**（本日午後）
3. **キーボードショートカット**（オプション）

### 詳細実装仕様

#### 1. AudioRecorder.tsx の修正

```typescript
// 新しいPropsインターフェース
interface AudioRecorderProps {
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onChunksProcessedChange?: (chunks: number) => void;
  mode?: 'ptt' | 'toggle'; // 新規追加
  onModeChange?: (mode: 'ptt' | 'toggle') => void; // 新規追加
}

// デフォルトモードの設定
const [mode, setMode] = useState<'ptt' | 'toggle'>('ptt'); // PTTをデフォルトに

// PTTイベントハンドラー
const handlePTTStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
  e.preventDefault();
  if (!isRecording && !error) {
    startRecording();
    websocketService.startTranscription();
  }
}, [isRecording, error, startRecording]);

const handlePTTEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
  e.preventDefault();
  if (isRecording) {
    stopRecording();
    websocketService.stopTranscription();
  }
}, [isRecording, stopRecording]);

// 録音ボタンの実装
{mode === 'ptt' ? (
  // PTTモード用ボタン
  <button
    onMouseDown={handlePTTStart}
    onMouseUp={handlePTTEnd}
    onMouseLeave={handlePTTEnd} // マウスが外れた時も停止
    onTouchStart={handlePTTStart}
    onTouchEnd={handlePTTEnd}
    onContextMenu={(e) => e.preventDefault()} // 右クリック無効化
    className={`px-8 py-4 rounded-full font-bold text-lg transition-all duration-200 
      select-none cursor-pointer touch-none ${
      isRecording
        ? 'bg-red-600 text-white scale-110 shadow-2xl animate-pulse'
        : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105 shadow-lg'
    }`}
    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
  >
    {isRecording ? (
      <>
        <span className="inline-block w-3 h-3 bg-white rounded-full animate-pulse mr-2" />
        送信中... (ボタンを離すと停止)
      </>
    ) : (
      <>
        🎙️ 押して送信 (PTT)
      </>
    )}
  </button>
) : (
  // トグルモード用ボタン（既存）
  <button
    onClick={handleToggleRecording}
    className={`px-6 py-3 rounded-full font-semibold text-base transition-all duration-300 
      flex items-center space-x-2 shadow-lg ${
      isRecording
        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
        : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
    }`}
  >
    {isRecording ? (
      <>
        <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
        <span>🔴 録音停止</span>
      </>
    ) : (
      <>
        <span>🎙️ 録音開始</span>
      </>
    )}
  </button>
)}

// モード切替UI
<div className="flex items-center justify-center space-x-4 mb-4">
  <label className="flex items-center cursor-pointer">
    <input
      type="radio"
      value="ptt"
      checked={mode === 'ptt'}
      onChange={() => {
        setMode('ptt');
        if (isRecording) stopRecording(); // モード切替時は録音停止
      }}
      className="mr-2"
    />
    <span className="text-white text-sm">
      PTT方式（実際のVHF無線と同じ）
    </span>
  </label>
  <label className="flex items-center cursor-pointer">
    <input
      type="radio"
      value="toggle"
      checked={mode === 'toggle'}
      onChange={() => {
        setMode('toggle');
        if (isRecording) stopRecording(); // モード切替時は録音停止
      }}
      className="mr-2"
    />
    <span className="text-white text-sm">
      トグル方式（クリックで開始/停止）
    </span>
  </label>
</div>

// 説明テキストの追加
{mode === 'ptt' && !isRecording && !error && (
  <div className="text-xs text-gray-400 text-center mt-2">
    <p>🎙️ ボタンを押し続けている間、送信されます</p>
    <p>💡 ヒント: スペースキーも使用できます</p>
  </div>
)}
```

#### 2. キーボードショートカット対応（useAudioRecorder.ts に追加）

```typescript
// スペースキーでPTT操作
useEffect(() => {
  if (mode !== 'ptt') return;
  
  const handleKeyDown = (e: KeyboardEvent) => {
    // テキスト入力中は無効
    if (e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    if (e.code === 'Space' && !isRecording) {
      e.preventDefault();
      startRecording();
      websocketService.startTranscription();
    }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && isRecording) {
      e.preventDefault();
      stopRecording();
      websocketService.stopTranscription();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, [mode, isRecording, startRecording, stopRecording]);
```

---

## 🔇 Phase 3: エコーキャンセレーション対策

### 実装方法

#### 1. AIResponsePanel.tsx の修正

```typescript
// グローバル録音状態の管理
useEffect(() => {
  // 音声出力状態をグローバルに公開
  (window as any).isSpeaking = isSpeaking;
}, [isSpeaking]);

const speak = (text: string) => {
  // 録音中なら一時停止を通知
  if ((window as any).isRecording) {
    console.log('音声出力開始のため録音を一時停止');
    (window as any).pauseRecording?.();
  }
  
  // 既存の音声を停止
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  utterance.volume = 0.9;
  
  utterance.onstart = () => {
    setIsSpeaking(true);
    // エコー防止フラグ
    (window as any).blockRecording = true;
  };
  
  utterance.onend = () => {
    setIsSpeaking(false);
    // エコー防止フラグ解除
    (window as any).blockRecording = false;
    // 録音再開を通知
    (window as any).resumeRecording?.();
  };
  
  utterance.onerror = () => {
    setIsSpeaking(false);
    (window as any).blockRecording = false;
  };
  
  window.speechSynthesis.speak(utterance);
};
```

#### 2. useAudioRecorder.ts の修正

```typescript
// エコーキャンセレーション設定の最適化
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: true,    // エコーキャンセレーション有効
    noiseSuppression: true,    // ノイズ抑制有効
    autoGainControl: true,     // 自動ゲイン制御有効
    channelCount: 1,
    sampleRate: 16000
  } 
});

// グローバル録音状態の公開
useEffect(() => {
  (window as any).isRecording = isRecording;
  
  // 録音一時停止/再開関数の提供
  (window as any).pauseRecording = () => {
    if (workletRef.current && isRecording) {
      workletRef.current.port.postMessage({ command: 'pause' });
    }
  };
  
  (window as any).resumeRecording = () => {
    if (workletRef.current && isRecording && !(window as any).blockRecording) {
      workletRef.current.port.postMessage({ command: 'resume' });
    }
  };
  
  return () => {
    delete (window as any).isRecording;
    delete (window as any).pauseRecording;
    delete (window as any).resumeRecording;
  };
}, [isRecording]);

// AudioWorkletでのメッセージ処理を更新
workletRef.current.port.onmessage = (event) => {
  // エコー防止チェック
  if ((window as any).blockRecording) {
    console.log('音声出力中のため音声データをスキップ');
    return;
  }
  
  if (event.data.type === 'audioData') {
    const pcmData = event.data.data;
    const uint8Array = new Uint8Array(pcmData.buffer);
    const base64 = btoa(String.fromCharCode(...uint8Array));
    onAudioData(base64);
  }
};
```

#### 3. audio-processor-worklet.js の更新

```javascript
class AudioPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.isPaused = false; // 一時停止フラグ追加
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    
    this.port.onmessage = (event) => {
      if (event.data.command === 'start') {
        this.isRecording = true;
        this.isPaused = false;
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        this.isPaused = false;
      } else if (event.data.command === 'pause') {
        this.isPaused = true;
      } else if (event.data.command === 'resume') {
        this.isPaused = false;
      }
    };
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!this.isRecording || this.isPaused || !input || !input[0]) {
      return true;
    }
    
    // 既存の処理...
  }
}
```

---

## 📊 テスト項目

### Phase 2 テスト
1. PTTボタンの押下で録音開始
2. PTTボタンの解放で録音停止
3. マウスがボタンから外れた時の録音停止
4. モード切替時の録音状態リセット
5. スペースキーでのPTT操作
6. モバイルでのタッチ操作

### Phase 3 テスト
1. 音声出力中の録音一時停止
2. 音声出力終了後の録音再開
3. エコーキャンセレーション効果
4. PTTモードでのエコー防止

---

## 🎯 本日の目標

### 午前中（〜12:00）
- [ ] Phase 2: 基本PTT機能の実装
- [ ] モード切替UIの実装

### 午後（12:00〜18:00）
- [ ] Phase 2: キーボードショートカット実装
- [ ] Phase 3: エコーキャンセレーション対策
- [ ] 統合テスト

### 夕方（18:00〜）
- [ ] 本番環境へのデプロイ
- [ ] 動作確認

---

## 💡 実装のポイント

1. **PTTボタンの視覚的フィードバック**
   - 押下中は明確に分かるようにスケールやカラーを変更
   - アニメーションで録音中を表現

2. **エラーハンドリング**
   - PTT中の接続エラー対策
   - モード切替時の状態管理

3. **ユーザビリティ**
   - 初回利用者向けのツールチップ
   - モード説明の表示

---

## 📝 注意事項

- 既存のトグル機能を壊さないよう注意
- モバイル対応を忘れずに（タッチイベント）
- エコー対策は段階的に実装・テスト

頑張ってください！質問があれば随時ご連絡ください。

Product Manager
2025年8月15日