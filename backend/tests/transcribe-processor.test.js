const TranscribeProcessor = require('../lambda/websocket-handler/shared/transcribe-processor');

jest.mock('@aws-sdk/client-transcribe-streaming');

describe('TranscribeProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new TranscribeProcessor();
    process.env.AWS_REGION = 'ap-northeast-1';
  });

  describe('startSession', () => {
    it('should create a new transcription session', async () => {
      const connectionId = 'test-connection-123';
      
      await processor.startSession(connectionId, 'ja-JP');
      
      expect(processor.sessions.has(connectionId)).toBe(true);
    });

    it('should stop existing session before starting new one', async () => {
      const connectionId = 'test-connection-123';
      
      await processor.startSession(connectionId);
      const firstSession = processor.sessions.get(connectionId);
      
      await processor.startSession(connectionId);
      const secondSession = processor.sessions.get(connectionId);
      
      expect(firstSession).not.toBe(secondSession);
    });
  });

  describe('processAudioChunk', () => {
    it('should handle base64 audio data', async () => {
      const connectionId = 'test-connection-123';
      const base64Audio = 'dGVzdCBhdWRpbyBkYXRh'; // "test audio data"
      
      await processor.startSession(connectionId);
      await processor.processAudioChunk(connectionId, base64Audio);
      
      // セッションがアクティブであることを確認
      expect(processor.sessions.get(connectionId).isActive).toBe(true);
    });

    it('should ignore audio without active session', async () => {
      const connectionId = 'no-session';
      const base64Audio = 'dGVzdCBhdWRpbyBkYXRh';
      
      // エラーが発生しないことを確認
      await expect(processor.processAudioChunk(connectionId, base64Audio))
        .resolves.not.toThrow();
    });
  });

  describe('stopSession', () => {
    it('should clean up session resources', async () => {
      const connectionId = 'test-connection-123';
      
      await processor.startSession(connectionId);
      processor.stopSession(connectionId);
      
      expect(processor.sessions.has(connectionId)).toBe(false);
    });
  });
});