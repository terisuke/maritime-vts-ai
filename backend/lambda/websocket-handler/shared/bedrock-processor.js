/**
 * Amazon Bedrock Claude Processor
 * 海事通信の分析とAI応答生成
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const Logger = require('./logger');

class BedrockProcessor {
  constructor() {
    this.logger = new Logger({ component: 'BedrockProcessor' });
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
    // Claude Sonnet 4 - 最新モデル（2025年5月リリース）
    // パフォーマンス向上: 応答速度46%向上、精度95%以上
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0';
  }

  /**
   * 海事通信を分析してAI応答を生成
   * @param {string} transcriptText - 文字起こしされたテキスト
   * @param {Object} context - 追加コンテキスト情報
   * @returns {Promise<Object>} - AI応答結果
   */
  async processVTSCommunication(transcriptText, context = {}) {
    try {
      // 入力検証
      if (!transcriptText || typeof transcriptText !== 'string') {
        throw new Error('Invalid transcript text: must be a non-empty string');
      }
      
      // 文字数制限（1000文字）
      const sanitizedText = transcriptText.substring(0, 1000);
      
      // 危険な文字をエスケープ
      const cleanText = sanitizedText
        .replace(/[<>]/g, '') // HTMLタグ除去
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 制御文字除去
        .trim();
      
      if (cleanText.length === 0) {
        throw new Error('Empty transcript after sanitization');
      }
      
      this.logger.info('Processing VTS communication', {
        originalLength: transcriptText.length,
        cleanLength: cleanText.length,
        context
      });

      const prompt = this.createVTSPrompt(cleanText, context);
      
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 300,
          temperature: 0.3, // 安全性重視で低めの温度
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          system: this.getSystemPrompt()
        })
      });

      const startTime = Date.now();
      const response = await this.client.send(command);
      const responseTime = Date.now() - startTime;

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // レスポンスをパース
      const aiAnalysis = this.parseAIResponse(responseBody.content[0].text);
      
      this.logger.info('AI analysis completed', {
        inputLength: transcriptText.length,
        classification: aiAnalysis.classification,
        confidence: aiAnalysis.confidence,
        responseTime
      });

      // メトリクス記録
      this.logger.metric('BedrockResponseTime', responseTime, 'Milliseconds', {
        classification: aiAnalysis.classification
      });

      this.logger.metric('BedrockInvocations', 1, 'Count', {
        modelId: this.modelId
      });

      // 会話履歴を保存
      if (context.connectionId) {
        await this.saveAnalysis(context.connectionId, transcriptText, aiAnalysis);
      }

      return aiAnalysis;
      
    } catch (error) {
      this.logger.error('Bedrock processing error', error);
      
      this.logger.metric('BedrockErrors', 1, 'Count', {
        errorType: error.name || 'UnknownError'
      });
      
      // フォールバック応答
      const fallbackResponse = this.getFallbackResponse(transcriptText);
      fallbackResponse.error = error.message;
      return fallbackResponse;
    }
  }

  /**
   * システムプロンプト（Claudeの役割定義）
   */
  getSystemPrompt() {
    return `あなたは福岡港湾（博多港、北九州港、門司港）のVTS（船舶通航管理）システムのAI管制官支援システムです。

役割：
1. 船舶からの通信を分析し、緊急度を判定
2. 適切な応答を日本語で生成
3. 安全を最優先に判断

重要な港湾：
- 博多港：中央ふ頭、箱崎ふ頭、香椎パークポート、アイランドシティ
- 北九州港：門司港、小倉港、若松港、戸畑港
- 関門海峡：日本有数の海上交通の要衝

リスク分類基準：
- RED（緊急）: メーデー、衝突、火災、浸水、機関故障、人命に関わる事態
- AMBER（注意）: 強風、視界不良、潮流異常、他船接近、軽微な故障
- GREEN（通常）: 入出港申請、位置報告、情報照会、通常航行

応答は簡潔で明確に、船舶が理解しやすい表現を使用してください。`;
  }

  /**
   * VTS通信用プロンプト作成
   */
  createVTSPrompt(transcriptText, context) {
    const location = context.location || '博多港';
    const timestamp = context.timestamp || new Date().toISOString();
    const vesselInfo = context.vesselInfo || '不明';

    return `以下の船舶通信を分析し、適切な応答を生成してください。

船舶通信: "${transcriptText}"
現在位置: ${location}
時刻: ${timestamp}
船舶情報: ${vesselInfo}

以下の形式でJSON形式で応答してください：
{
  "classification": "GREEN/AMBER/RED のいずれか",
  "suggestedResponse": "VTSからの応答文（日本語）",
  "confidence": 信頼度（0.0-1.0）,
  "riskFactors": ["識別されたリスク要因のリスト"],
  "recommendedActions": ["推奨される対応のリスト"]
}`;
  }

  /**
   * AI応答のパース
   */
  parseAIResponse(responseText) {
    try {
      // JSONブロックを抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 分類の検証
        const validClassifications = ['GREEN', 'AMBER', 'RED'];
        const classification = validClassifications.includes(parsed.classification) 
          ? parsed.classification 
          : 'AMBER';
        
        return {
          classification: classification,
          suggestedResponse: parsed.suggestedResponse || '了解しました。',
          confidence: Math.max(0, Math.min(1, parsed.confidence || 0.8)),
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
          timestamp: new Date().toISOString(),
          rawResponse: responseText
        };
      }
    } catch (error) {
      this.logger.error('Failed to parse AI response', { responseText, error });
    }

    // パース失敗時のフォールバック
    return {
      classification: 'AMBER',
      suggestedResponse: responseText.substring(0, 200),
      confidence: 0.6,
      riskFactors: ['応答解析エラー'],
      recommendedActions: ['手動確認推奨'],
      timestamp: new Date().toISOString(),
      rawResponse: responseText
    };
  }

  /**
   * 緊急通信の即時応答生成
   */
  async generateEmergencyResponse(transcriptText) {
    // メーデーコールなどの緊急通信を検出
    const emergencyKeywords = ['メーデー', 'MAYDAY', 'パンパン', 'PAN-PAN', 'セキュリテ', 'SECURITE'];
    const isEmergency = emergencyKeywords.some(keyword => 
      transcriptText.toUpperCase().includes(keyword.toUpperCase())
    );

    if (isEmergency) {
      this.logger.warn('Emergency communication detected', { transcriptText });
      
      return {
        classification: 'RED',
        suggestedResponse: 'こちら福岡VTS。緊急通信を受信しました。位置と状況を報告してください。救助手配を開始します。',
        confidence: 1.0,
        riskFactors: ['緊急通信'],
        recommendedActions: ['即時対応', '救助手配', '周辺船舶への警告'],
        timestamp: new Date().toISOString(),
        isEmergency: true
      };
    }

    // 通常のAI処理を実行
    return this.processVTSCommunication(transcriptText);
  }

  /**
   * バッチ処理（複数の通信をまとめて処理）
   */
  async processBatch(communications) {
    const results = [];
    
    for (const comm of communications) {
      try {
        const result = await this.processVTSCommunication(comm.text, comm.context);
        results.push({
          id: comm.id,
          ...result
        });
      } catch (error) {
        this.logger.error('Batch processing error', { id: comm.id, error });
        results.push({
          id: comm.id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 会話履歴を考慮した応答生成
   */
  async processWithHistory(transcriptText, conversationHistory = []) {
    const context = {
      history: conversationHistory.slice(-5) // 直近5件の履歴を使用
    };
    
    // 履歴を含むプロンプトを作成
    const historyPrompt = conversationHistory.length > 0
      ? `\n\n過去の通信履歴:\n${conversationHistory.map(h => `- ${h.role}: ${h.text}`).join('\n')}`
      : '';
    
    const enhancedText = transcriptText + historyPrompt;
    
    return this.processVTSCommunication(enhancedText, context);
  }

  /**
   * フォールバック応答（キーワードベース）
   */
  getFallbackResponse(transcriptText) {
    // キーワードベースの簡易分類
    const text = transcriptText.toLowerCase();
    
    if (text.includes('メーデー') || text.includes('mayday') || 
        text.includes('緊急') || text.includes('火災')) {
      return {
        classification: 'RED',
        suggestedResponse: '緊急事態確認。直ちに支援を派遣します。現在位置を報告してください。',
        confidence: 0.7,
        riskFactors: ['キーワードベース判定'],
        recommendedActions: ['緊急対応'],
        timestamp: new Date().toISOString()
      };
    }
    
    if (text.includes('強風') || text.includes('注意') || 
        text.includes('困難')) {
      return {
        classification: 'AMBER',
        suggestedResponse: '状況を確認しました。安全を確保し、指示をお待ちください。',
        confidence: 0.6,
        riskFactors: ['キーワードベース判定'],
        recommendedActions: ['状況監視'],
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      classification: 'GREEN',
      suggestedResponse: '了解しました。通信を継続してください。',
      confidence: 0.5,
      riskFactors: [],
      recommendedActions: [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 分析結果を保存（DynamoDB）
   */
  async saveAnalysis(connectionId, transcriptText, analysis) {
    try {
      const DynamoDBClient = require('@aws-sdk/client-dynamodb').DynamoDBClient;
      const PutItemCommand = require('@aws-sdk/client-dynamodb').PutItemCommand;
      
      const dynamoClient = new DynamoDBClient({
        region: process.env.AWS_REGION || 'ap-northeast-1'
      });
      
      const item = {
        connectionId: { S: connectionId },
        timestamp: { S: analysis.timestamp },
        transcriptText: { S: transcriptText },
        classification: { S: analysis.classification },
        suggestedResponse: { S: analysis.suggestedResponse },
        confidence: { N: String(analysis.confidence) },
        riskFactors: { SS: analysis.riskFactors.length > 0 ? analysis.riskFactors : ['none'] },
        recommendedActions: { SS: analysis.recommendedActions.length > 0 ? analysis.recommendedActions : ['none'] },
        ttl: { N: String(Math.floor(Date.now() / 1000) + 86400 * 30) } // 30日間保存
      };
      
      const command = new PutItemCommand({
        TableName: process.env.DYNAMODB_TABLE || 'vts-conversations',
        Item: item
      });
      
      await dynamoClient.send(command);
      
      this.logger.info('Analysis saved to DynamoDB', { connectionId, classification: analysis.classification });
      
    } catch (error) {
      this.logger.error('Failed to save analysis to DynamoDB', { connectionId, error });
      // 保存失敗はAI処理の失敗とはしない
    }
  }
}

module.exports = BedrockProcessor;