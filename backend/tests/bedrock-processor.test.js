const BedrockProcessor = require('../lambda/websocket-handler/shared/bedrock-processor');

jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');

describe('BedrockProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new BedrockProcessor();
  });

  describe('processVTSCommunication', () => {
    it('should classify emergency correctly', async () => {
      const transcript = 'メーデー、メーデー、メーデー、機関故障';
      
      const result = await processor.processVTSCommunication(transcript);
      
      expect(result.classification).toBe('RED');
      expect(result.suggestedResponse).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify warning correctly', async () => {
      const transcript = '強風により操船困難です';
      
      const result = await processor.processVTSCommunication(transcript);
      
      expect(result.classification).toBe('AMBER');
    });

    it('should classify normal communication correctly', async () => {
      const transcript = '博多港への入港許可を要請します';
      
      const result = await processor.processVTSCommunication(transcript);
      
      expect(result.classification).toBe('GREEN');
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON response', () => {
      const responseText = `
        分析結果：
        {
          "classification": "GREEN",
          "suggestedResponse": "入港を許可します",
          "confidence": 0.95,
          "riskFactors": [],
          "recommendedActions": []
        }
      `;
      
      const result = processor.parseAIResponse(responseText);
      
      expect(result.classification).toBe('GREEN');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle invalid JSON with fallback', () => {
      const responseText = 'Invalid response';
      
      const result = processor.parseAIResponse(responseText);
      
      expect(result.classification).toBeDefined();
      expect(result.suggestedResponse).toBeDefined();
    });
  });

  describe('getFallbackResponse', () => {
    it('should detect emergency keywords', () => {
      const result = processor.getFallbackResponse('メーデー、火災発生');
      
      expect(result.classification).toBe('RED');
    });

    it('should detect warning keywords', () => {
      const result = processor.getFallbackResponse('強風のため注意が必要');
      
      expect(result.classification).toBe('AMBER');
    });

    it('should default to GREEN for normal text', () => {
      const result = processor.getFallbackResponse('通常の航行です');
      
      expect(result.classification).toBe('GREEN');
    });
  });

  describe('generateEmergencyResponse', () => {
    it('should detect MAYDAY calls', async () => {
      const result = await processor.generateEmergencyResponse('MAYDAY MAYDAY MAYDAY');
      
      expect(result.classification).toBe('RED');
      expect(result.isEmergency).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should detect PAN-PAN calls', async () => {
      const result = await processor.generateEmergencyResponse('パンパン、機関故障');
      
      expect(result.classification).toBe('RED');
      expect(result.isEmergency).toBe(true);
    });

    it('should process normal communication', async () => {
      processor.processVTSCommunication = jest.fn().mockResolvedValue({
        classification: 'GREEN',
        suggestedResponse: 'テスト応答'
      });
      
      const result = await processor.generateEmergencyResponse('通常の通信');
      
      expect(processor.processVTSCommunication).toHaveBeenCalled();
    });
  });

  describe('processBatch', () => {
    it('should process multiple communications', async () => {
      const communications = [
        { id: '1', text: 'テスト1', context: {} },
        { id: '2', text: 'テスト2', context: {} }
      ];
      
      processor.processVTSCommunication = jest.fn()
        .mockResolvedValueOnce({ classification: 'GREEN' })
        .mockResolvedValueOnce({ classification: 'AMBER' });
      
      const results = await processor.processBatch(communications);
      
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
    });

    it('should handle errors in batch processing', async () => {
      const communications = [
        { id: '1', text: 'テスト1', context: {} }
      ];
      
      processor.processVTSCommunication = jest.fn()
        .mockRejectedValue(new Error('Processing error'));
      
      const results = await processor.processBatch(communications);
      
      expect(results[0].error).toBeDefined();
    });
  });

  describe('processWithHistory', () => {
    it('should include conversation history in processing', async () => {
      const history = [
        { role: 'vessel', text: '入港要請' },
        { role: 'vts', text: '了解' }
      ];
      
      processor.processVTSCommunication = jest.fn()
        .mockResolvedValue({ classification: 'GREEN' });
      
      await processor.processWithHistory('新しい通信', history);
      
      expect(processor.processVTSCommunication).toHaveBeenCalledWith(
        expect.stringContaining('過去の通信履歴'),
        expect.any(Object)
      );
    });

    it('should limit history to 5 entries', async () => {
      const history = Array(10).fill({ role: 'vessel', text: 'test' });
      
      processor.processVTSCommunication = jest.fn()
        .mockResolvedValue({ classification: 'GREEN' });
      
      await processor.processWithHistory('新しい通信', history);
      
      const call = processor.processVTSCommunication.mock.calls[0];
      const historyCount = (call[0].match(/- vessel:/g) || []).length;
      
      expect(historyCount).toBe(5);
    });
  });
});