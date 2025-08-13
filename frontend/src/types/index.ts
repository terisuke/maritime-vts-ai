export interface WebSocketMessage {
  action: 'ping' | 'message' | 'startTranscription' | 'stopTranscription' | 'audioData';
  payload: any;
  timestamp: string;
}

export interface TranscriptionResult {
  transcriptText: string;
  confidence: number;
  timestamp: string;
  isPartial: boolean;
  speakerLabel?: string;
}

export interface AIResponse {
  classification: 'GREEN' | 'AMBER' | 'RED';
  suggestedResponse: string;
  confidence: number;
  riskFactors?: string[];
  timestamp: string;
}

export interface VesselInfo {
  mmsi: string;
  name: string;
  callSign?: string;
  type?: string;
  position?: {
    lat: number;
    lon: number;
  };
  speed?: number;
  course?: number;
  status?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AudioStreamConfig {
  sampleRate: number;
  channels: number;
  bufferSize: number;
}