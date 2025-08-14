# 🎯 Sprint 4: PTT方式への移行と音声出力UI改善

## 📋 要件定義書

**発行日**: 2025年8月14日  
**作成者**: Product Manager  
**対象**: 開発チーム  
**優先度**: 高  
**期限**: 2025年8月16日

---

## 🔍 背景と現状分析

### 現在の実装の問題点

開発チームからの報告と実装レビューを通じて、以下の問題点を確認しました：

1. **音声出力UIの問題**
   - 音声出力の選択ボタン（再生/停止/自動読み上げ）がAI応答生成後にしか表示されない
   - ユーザーは事前に音声出力設定を変更できない

2. **録音方式の問題**
   - 現在：トグル方式（録音開始ボタン → 録音停止ボタン）
   - 実際のVHF無線：PTT（Push-to-Talk）方式
   - 録音停止を押さないと、自分の音声出力も認識してしまう（エコー問題）

### VHF無線の実際の運用

調査により、海上VHF無線の標準的な運用方法は以下の通りであることを確認しました：

- **PTT（Push-to-Talk）方式**
  - ボタンを押している間だけ送信モード
  - ボタンを離すと自動的に受信モードに切り替わる
  - 半二重通信（送信と受信は同時にできない）
  
- **標準的な通信手順**
  1. PTTボタンを押す
  2. 通信内容を話す  
  3. PTTボタンを離す
  4. 相手の応答を聞く

---

## ✅ 修正要件

### 1. 音声出力UIの常時表示化

**要件ID**: UI-001  
**優先度**: 高

#### 現在の実装
```typescript
// AIResponsePanel.tsx (62行目)
{response && (
  <div className="flex items-center space-x-2">
    {/* ボタン群 */}
  </div>
)}
```

#### 修正後の実装
```typescript
// 音声出力コントロールを常に表示
<div className="flex items-center space-x-2">
  {/* 音声再生ボタン - responseがある時のみ有効化 */}
  <button
    onClick={() => response && speak(response.suggestedResponse)}
    disabled={!response}
    className={`px-3 py-1 rounded text-white text-sm transition-all ${
      !response 
        ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
        : isSpeaking 
          ? 'bg-green-600 animate-pulse' 
          : 'bg-blue-600 hover:bg-blue-700'
    }`}
    title={!response ? "応答待機中" : "応答を読み上げ"}
  >
    {isSpeaking ? '🔊 再生中...' : '🔊 再生'}
  </button>
  
  {/* 停止ボタン - 常に表示 */}
  <button
    onClick={stop}
    disabled={!isSpeaking}
    className={`px-3 py-1 rounded text-white text-sm transition-all ${
      !isSpeaking
        ? 'bg-gray-600 opacity-50 cursor-not-allowed'
        : 'bg-gray-600 hover:bg-gray-700'
    }`}
    title="読み上げを停止"
  >
    ⏹️ 停止
  </button>
  
  {/* 自動読み上げ設定 - 常に表示 */}
  <label className="flex items-center text-white text-sm cursor-pointer">
    <input
      type="checkbox"
      checked={isAutoSpeak}
      onChange={(e) => setIsAutoSpeak(e.target.checked)}
      className="mr-1"
    />
    自動読み上げ
  </label>
</div>
```

#### 期待される動作
- 音声出力コントロールは常に表示
- AI応答がない時はボタンは無効化状態（グレーアウト）
- ユーザーは事前に自動読み上げのON/OFFを設定可能

---

### 2. PTT（Push-to-Talk）方式への移行

**要件ID**: PTT-001  
**優先度**: 高

#### 実装方針

##### オプションA: デフォルトPTT + トグルモード切替（推奨）
```typescript
// AudioRecorder.tsx に追加
interface AudioRecorderProps {
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onChunksProcessedChange?: (chunks: number) => void;
  mode?: 'ptt' | 'toggle'; // 新規追加
}

// PTTモード実装
const handlePTTStart = (e: React.MouseEvent | React.TouchEvent) => {
  e.preventDefault();
  startRecording();
  websocketService.startTranscription();
};

const handlePTTEnd = (e: React.MouseEvent | React.TouchEvent) => {
  e.preventDefault();
  stopRecording();
  websocketService.stopTranscription();
};

// マウスとタッチの両方に対応
<button
  onMouseDown={mode === 'ptt' ? handlePTTStart : undefined}
  onMouseUp={mode === 'ptt' ? handlePTTEnd : undefined}
  onMouseLeave={mode === 'ptt' ? handlePTTEnd : undefined} // マウスが外れた時も停止
  onTouchStart={mode === 'ptt' ? handlePTTStart : undefined}
  onTouchEnd={mode === 'ptt' ? handlePTTEnd : undefined}
  onClick={mode === 'toggle' ? handleToggleRecording : undefined}
  className={`ptt-button ${isRecording ? 'recording' : ''}`}
>
  {mode === 'ptt' 
    ? (isRecording ? '🎙️ 送信中...' : '🎙️ 押して送信')
    : (isRecording ? '🔴 録音停止' : '🎙️ 録音開始')
  }
</button>

// モード切替UI
<div className="mode-selector">
  <label>
    <input 
      type="radio" 
      value="ptt" 
      checked={mode === 'ptt'} 
      onChange={() => setMode('ptt')}
    />
    PTT方式（実際のVHF無線と同じ）
  </label>
  <label>
    <input 
      type="radio" 
      value="toggle" 
      checked={mode === 'toggle'} 
      onChange={() => setMode('toggle')}
    />
    トグル方式（クリックで開始/停止）
  </label>
</div>
```

##### オプションB: キーボードショートカット対応
```typescript
// スペースキーでPTT
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isRecording && mode === 'ptt') {
      e.preventDefault();
      startRecording();
    }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && isRecording && mode === 'ptt') {
      e.preventDefault();
      stopRecording();
    }
  };
  
  if (mode === 'ptt') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, [isRecording, mode]);
```

---

### 3. エコーキャンセレーション対策

**要件ID**: ECHO-001  
**優先度**: 中

#### 実装方針

##### 方法1: 音声出力中の録音無効化
```typescript
// AIResponsePanel.tsx
const speak = (text: string) => {
  // 録音中なら停止
  if (window.isRecording) {
    window.stopRecording?.();
  }
  
  // 既存の音声を停止
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  
  utterance.onstart = () => {
    setIsSpeaking(true);
    // 音声出力中は録音を無効化
    window.disableRecording = true;
  };
  
  utterance.onend = () => {
    setIsSpeaking(false);
    // 音声出力終了後に録音を再有効化
    window.disableRecording = false;
  };
  
  window.speechSynthesis.speak(utterance);
};
```

##### 方法2: エコーキャンセレーション設定の最適化
```typescript
// useAudioRecorder.ts
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: true,  // エコーキャンセレーション有効化
    noiseSuppression: true,  // ノイズ抑制有効化
    autoGainControl: true,   // 自動ゲイン制御有効化
    channelCount: 1
  } 
});
```

---

## 📊 テスト要件

### ユニットテスト
1. PTTボタンの押下/解放イベントのテスト
2. 音声出力UIの常時表示テスト
3. モード切替のテスト

### 統合テスト
1. PTT方式での音声録音フロー
2. 音声出力中の録音制御
3. エコーキャンセレーションの効果確認

### ユーザビリティテスト
1. 実際のVHF無線オペレーターによる操作感の確認
2. PTT方式とトグル方式の切替の使いやすさ
3. エコー問題の解消確認

---

## 🚀 実装手順

### Phase 1: 音声出力UI改善（8月14日）
1. AIResponsePanel.tsxの修正
2. 音声出力コントロールの常時表示化
3. デフォルト設定の見直し（自動読み上げをOFFに）

### Phase 2: PTT方式実装（8月15日）
1. AudioRecorder.tsxの修正
2. useAudioRecorder.tsのイベント処理追加
3. モード切替UIの実装

### Phase 3: エコー対策（8月15日）
1. 音声出力中の録音制御実装
2. エコーキャンセレーション設定の最適化
3. 統合テスト

### Phase 4: デプロイ（8月16日）
1. 本番環境へのデプロイ
2. ユーザビリティテスト
3. ドキュメント更新

---

## 🎯 成功基準

1. **音声出力UI**
   - [ ] 音声出力コントロールが常に表示される
   - [ ] AI応答がない時は適切にグレーアウト
   - [ ] 自動読み上げのON/OFF設定が保持される

2. **PTT方式**
   - [ ] ボタンを押している間だけ録音される
   - [ ] ボタンを離すと即座に録音停止
   - [ ] スペースキーでもPTT操作可能

3. **エコー対策**
   - [ ] 音声出力中の自己音声認識が発生しない
   - [ ] エコーキャンセレーションが適切に動作

4. **ユーザビリティ**
   - [ ] 実際のVHF無線に近い操作感
   - [ ] モード切替がスムーズ
   - [ ] 操作ミスが減少

---

## 📝 注記

- PTT方式をデフォルトとし、トグル方式はオプションとして残す
- モバイル対応も考慮（タッチイベント対応）
- 実装の際は、既存の録音機能を壊さないよう段階的に実装
- ユーザーの操作習慣を急激に変えないよう、移行期間を設ける

---

## 🔗 参考資料

- [Marine VHF Radio - Wikipedia](https://en.wikipedia.org/wiki/Marine_VHF_radio)
- [Push-to-Talk - Wikipedia](https://en.wikipedia.org/wiki/Push-to-talk)
- [How to use a Marine VHF Radio - Icom UK](https://icomuk.co.uk/How-to-use-a-Marine-VHF-Radio/3995/3168/)
- [現在の実装コード](https://github.com/terisuke/maritime-vts-ai)

---

**承認者**: Product Manager  
**承認日**: 2025年8月14日  
**ステータス**: 承認済み・実装開始可