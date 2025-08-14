/**
 * AudioWorklet Processor for PCM audio conversion
 * This runs in the AudioWorklet thread for efficient real-time audio processing
 */
class AudioPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.processCallCount = 0;
    
    console.log('AudioWorklet: Constructor called - AudioPCMProcessor initialized');
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      console.log('AudioWorklet: Message received from main thread:', event.data);
      
      if (event.data.command === 'start') {
        this.isRecording = true;
        console.log('AudioWorklet: Recording STARTED by command');
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        console.log('AudioWorklet: Recording STOPPED by command');
      }
    };
  }

  process(inputs, outputs, parameters) {
    // CRITICAL DEBUG: Count every single call to process()
    this.processCallCount++;
    
    // Debug: Log recording state every 1000 calls (about every second)
    if (this.processCount === undefined) this.processCount = 0;
    this.processCount++;
    
    // CRITICAL: Log first 5 calls to confirm process() is working
    if (this.processCallCount <= 5) {
      console.log(`AudioWorklet: process() call #${this.processCallCount}, inputs:`, inputs, 'isRecording:', this.isRecording);
    }
    
    if (this.processCount % 1000 === 0) {
      console.log('AudioWorklet: isRecording =', this.isRecording, 'processCount =', this.processCount);
    }
    
    if (!this.isRecording) {
      return true; // Keep processor alive
    }

    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0]; // Use first channel (mono)
      
      if (channelData && channelData.length > 0) {
        // Check if there's actual audio data (lowered threshold)
        let hasAudio = false;
        let maxAmplitude = 0;
        let totalAmplitude = 0;
        
        for (let i = 0; i < channelData.length; i++) {
          const abs = Math.abs(channelData[i]);
          totalAmplitude += abs;
          if (abs > 0.0001) { // Lowered threshold for better sensitivity
            hasAudio = true;
          }
          if (abs > maxAmplitude) {
            maxAmplitude = abs;
          }
        }
        
        const avgAmplitude = totalAmplitude / channelData.length;
        
        if (hasAudio) {
          // Convert Float32Array to Int16Array (PCM 16-bit)
          const pcmData = new Int16Array(channelData.length);
          
          for (let i = 0; i < channelData.length; i++) {
            // Convert float (-1.0 to 1.0) to 16-bit integer (-32768 to 32767)
            const clampedValue = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i] = Math.floor(clampedValue * 32767);
          }
          
          console.log('AudioWorklet: Sending PCM data, length =', pcmData.length, 'maxAmplitude =', maxAmplitude.toFixed(4), 'avgAmplitude =', avgAmplitude.toFixed(6));
          
          // Send PCM data to main thread
          this.port.postMessage({
            type: 'audioData',
            data: pcmData
          });
        } else if (maxAmplitude > 0 && this.processCount % 2000 === 0) {
          // Log when there's some audio but below threshold
          console.log('AudioWorklet: Audio detected but below threshold, maxAmplitude =', maxAmplitude.toFixed(6), 'avgAmplitude =', avgAmplitude.toFixed(6));
        }
      }
    } else {
      // Log when no input is available
      if (this.processCount % 1000 === 0) {
        console.log('AudioWorklet: No input available');
      }
    }
    
    return true; // Keep processor alive
  }
}

// Register the processor
registerProcessor('audio-pcm-processor', AudioPCMProcessor);