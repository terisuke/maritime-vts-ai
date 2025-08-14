import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
}

export const useAudioRecorder = (onAudioData: (data: string) => void): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateAudioLevel = useCallback(() => {
    // Fix race condition by directly checking if analyser exists and is connected
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // 音声レベルの計算（より正確な計算）
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalizedLevel = Math.min(average / 128, 1); // 0-1の範囲に正規化
      
      console.log('Audio level update:', { average, normalizedLevel, dataLength: dataArray.length });
      setAudioLevel(normalizedLevel);
      
      // Continue animation loop while analyser exists (not dependent on isRecording state)
      if (analyserRef.current) {
        animationIdRef.current = requestAnimationFrame(updateAudioLevel);
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      console.log('音声録音を開始します（PCM形式 - AudioWorklet）...');
      
      // マイクへのアクセス許可を取得（エコーキャンセレーション設定を最適化）
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,    // エコーキャンセレーション有効
          noiseSuppression: true,    // ノイズ抑制有効
          autoGainControl: true,     // 自動ゲイン制御有効
          channelCount: 1,
          sampleRate: 16000
        } 
      });
      
      console.log('マイクアクセス許可を取得しました');
      streamRef.current = stream;

      // AudioContext を16kHzで作成（Transcribeの期待に合わせる）
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      
      console.log('AudioContext created, state:', audioContextRef.current.state);
      
      // AudioContextを確実に開始 (Chrome requires user interaction)
      if (audioContextRef.current.state === 'suspended') {
        console.log('AudioContext is suspended, attempting to resume...');
        await audioContextRef.current.resume();
        console.log('AudioContext resumed, state:', audioContextRef.current.state);
      }
      
      // AudioWorkletモジュールを登録
      try {
        await audioContextRef.current.audioWorklet.addModule('/audio-processor-worklet.js');
        console.log('AudioWorklet モジュールを登録しました');
      } catch (workletError) {
        console.warn('AudioWorkletの登録に失敗しました:', workletError);
        throw new Error('AudioWorkletの初期化に失敗しました');
      }
      
      // メディアストリームから音声ソースを作成
      const source = audioContextRef.current.createMediaStreamSource(stream);
      console.log('MediaStreamSource created, stream active:', stream.active, 'tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      
      // 音声レベル監視用アナライザー
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      console.log('Analyser created, connecting source...');
      source.connect(analyserRef.current);
      console.log('Source connected to analyser successfully');
      
      // AudioWorkletNode を作成
      workletRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-pcm-processor');
      
      // AudioWorkletからのメッセージを処理
      workletRef.current.port.onmessage = (event) => {
        console.log('AudioWorkletからメッセージ受信:', event.data.type, 'currentIsRecording:', isRecording);
        
        // エコー防止チェック
        if ((window as any).blockRecording) {
          console.log('音声出力中のため音声データをスキップ');
          return;
        }
        
        if (event.data.type === 'audioData') {
          const pcmData = event.data.data; // Int16Array
          
          console.log('PCMデータを処理開始:', pcmData.length, 'samples');
          
          // PCMデータをBase64に変換して送信
          const uint8Array = new Uint8Array(pcmData.buffer);
          const base64 = btoa(String.fromCharCode(...uint8Array));
          
          console.log('PCMデータを送信:', uint8Array.length, 'bytes', 'サンプルレート:', audioContextRef.current?.sampleRate);
          onAudioData(base64);
        }
      };
      
      // 音声処理チェーンを接続
      console.log('CRITICAL: Connecting audio source to AudioWorklet...');
      source.connect(workletRef.current);
      console.log('CRITICAL: Audio source connected to AudioWorklet successfully');
      
      setIsRecording(true);
      
      // AudioWorkletに録音開始を即座に通知
      console.log('CRITICAL: Sending start command to AudioWorklet immediately');
      if (workletRef.current) {
        workletRef.current.port.postMessage({ command: 'start' });
        console.log('CRITICAL: Start command sent to AudioWorklet successfully');
      } else {
        console.error('CRITICAL: workletRef.current is null!');
      }
      
      // 音声レベル監視開始
      updateAudioLevel();
      
      console.log('PCM録音を開始しました（AudioWorklet・16kHz）');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラー';
      console.error('Recording start error:', err);
      
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('Permission')) {
        setError('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
      } else if (errorMessage.includes('NotFoundError')) {
        setError('マイクが見つかりません。デバイスを確認してください。');
      } else {
        setError(`録音開始エラー: ${errorMessage}`);
      }
    }
  }, [onAudioData, updateAudioLevel]);

  const stopRecording = useCallback(() => {
    console.log('PCM録音を停止します（AudioWorklet）...');
    
    setIsRecording(false);
    
    // AudioWorkletに停止を通知
    if (workletRef.current) {
      try {
        workletRef.current.port.postMessage({ command: 'stop' });
        workletRef.current.disconnect();
        console.log('AudioWorklet stopped and disconnected');
      } catch (err) {
        console.warn('AudioWorklet disconnect error:', err);
      }
      workletRef.current = null;
    }
    
    // Analyser停止
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (err) {
        console.warn('Analyser disconnect error:', err);
      }
      analyserRef.current = null;
    }
    
    // ストリーム停止
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Track stopped:', track.kind);
      });
      streamRef.current = null;
    }
    
    // AudioContext停止
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
        console.log('AudioContext closed');
      } catch (err) {
        console.warn('AudioContext close error:', err);
      }
      audioContextRef.current = null;
    }
    
    // アニメーション停止
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    
    // インターバル停止
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    setAudioLevel(0);
    console.log('PCM録音を停止しました（AudioWorklet）');
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

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

  return { 
    isRecording, 
    audioLevel, 
    startRecording, 
    stopRecording, 
    error 
  };
};