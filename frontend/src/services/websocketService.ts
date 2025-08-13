import ReconnectingWebSocket from 'reconnecting-websocket';
import type { WebSocketMessage } from '../types';

class WebSocketService {
  private ws: ReconnectingWebSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private connectionId: string | null = null;

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.ws = new ReconnectingWebSocket(url, [], {
      maxRetries: 5,
      minReconnectionDelay: 3000,
      maxReconnectionDelay: 30000,
      reconnectionDelayGrowFactor: 1.5,
    });

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.emit('connected');
      this.sendPing();
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected');
      this.connectionId = null;
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        
        if (data.connectionId) {
          this.connectionId = data.connectionId;
        }
        
        this.emit('message', data);
        
        if (data.type === 'transcription') {
          this.emit('transcription', data.payload);
        } else if (data.type === 'aiResponse') {
          this.emit('aiResponse', data.payload);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    return () => {
      this.off(event, callback);
    };
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const messageWithTimestamp = {
        ...message,
        timestamp: new Date().toISOString(),
        connectionId: this.connectionId,
      };
      this.ws.send(JSON.stringify(messageWithTimestamp));
      console.log('WebSocket message sent:', messageWithTimestamp);
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  sendPing() {
    this.send({
      action: 'ping',
      payload: {},
      timestamp: new Date().toISOString(),
    });
  }

  startTranscription() {
    this.send({
      action: 'startTranscription',
      payload: {
        languageCode: 'ja-JP',
        vocabularyName: 'maritime-vts-vocabulary',
      },
      timestamp: new Date().toISOString(),
    });
  }

  stopTranscription() {
    this.send({
      action: 'stopTranscription',
      payload: {},
      timestamp: new Date().toISOString(),
    });
  }

  sendAudioData(audioData: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get readyState(): number | undefined {
    return this.ws?.readyState;
  }
}

export default new WebSocketService();