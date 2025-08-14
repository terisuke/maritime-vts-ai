// audio-processor-worklet.js
// PCM形式への変換とバッファリングを行うAudioWorkletProcessor

class AudioPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.buffer = [];
    this.bufferSize = 4096; // 256ms分のバッファ (16kHz * 0.256s)
    this.processCallCount = 0;
    
    // メインスレッドからのメッセージ受信
    this.port.onmessage = (event) => {
      console.log('AudioWorklet: Message received from main thread:', event.data);
      
      if (event.data.command === 'start') {
        this.isRecording = true;
        this.processCallCount = 0;
        this.buffer = [];
        console.log('AudioWorklet: Recording STARTED immediately');
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        this.flushBuffer(); // 停止時に残りのバッファを送信
        console.log('AudioWorklet: Recording STOPPED by command');
      }
    };
    
    console.log('AudioWorklet: AudioPCMProcessor initialized');
  }
  
  // バッファを統合して送信
  flushBuffer() {
    if (this.buffer.length > 0) {
      const mergedBuffer = this.mergeBuffers(this.buffer);
      
      // デバッグ: 音声レベルを計算
      let maxAmplitude = 0;
      let sumAmplitude = 0;
      for (let i = 0; i < mergedBuffer.length; i++) {
        const amplitude = Math.abs(mergedBuffer[i] / 32768);
        maxAmplitude = Math.max(maxAmplitude, amplitude);
        sumAmplitude += amplitude;
      }
      const avgAmplitude = sumAmplitude / mergedBuffer.length;
      
      console.log(`AudioWorklet: Flushing buffer, length = ${mergedBuffer.length}, maxAmplitude = ${maxAmplitude.toFixed(4)}, avgAmplitude = ${avgAmplitude.toFixed(6)}`);
      
      // データを送信
      this.port.postMessage({
        type: 'audioData',
        data: mergedBuffer
      });
      
      this.buffer = [];
    }
  }
  
  // 複数のバッファを1つに統合
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
    // 最初の5回のprocess呼び出しをデバッグ
    this.processCallCount++;
    if (this.processCallCount <= 5) {
      console.log(`AudioWorklet: process() call #${this.processCallCount}, inputs:`, inputs, 'isRecording:', this.isRecording);
    }
    
    // 録音中でない場合は処理をスキップ
    if (!this.isRecording) {
      return true;
    }
    
    const input = inputs[0];
    
    // 入力がない場合はスキップ
    if (!input || !input[0] || input[0].length === 0) {
      if (this.processCallCount <= 10) {
        console.log('AudioWorklet: No input data available');
      }
      return true;
    }
    
    const float32Data = input[0];
    
    // Float32からInt16（PCM）に変換
    const int16Data = new Int16Array(float32Data.length);
    let hasAudio = false;
    
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      
      // 音声があるかチェック（閾値を下げる）
      const abs = Math.abs(s);
      if (abs > 0.0001) { // 非常に小さい閾値
        hasAudio = true;
      }
    }
    
    // バッファに追加
    this.buffer.push(int16Data);
    
    // バッファサイズを計算
    const totalSamples = this.buffer.reduce((acc, buf) => acc + buf.length, 0);
    
    // デバッグ出力（最初の10回のみ）
    if (this.processCallCount <= 10) {
      console.log(`AudioWorklet: Buffer size = ${totalSamples}/${this.bufferSize}, hasAudio = ${hasAudio}`);
    }
    
    // バッファが満杯になったら送信
    if (totalSamples >= this.bufferSize) {
      this.flushBuffer();
    }
    
    return true;
  }
}

// AudioWorkletProcessorを登録
registerProcessor('audio-pcm-processor', AudioPCMProcessor);

console.log('AudioWorklet: audio-processor-worklet.js loaded and registered');