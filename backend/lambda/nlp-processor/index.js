/**
 * VTS NLP Processor
 * Bedrock APIを使用した自然言語処理とAI応答生成
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const Logger = require('../shared/logger');
const dynamodbClient = require('../shared/dynamodb-client');

// グローバルインスタンス
let bedrockClient;
let logger;

/**
 * Lambda ハンドラー関数
 * @param {Object} event - Lambda イベント
 * @param {Object} context - Lambda コンテキスト
 * @returns {Promise<Object>} - 処理結果
 */
exports.handler = async (event, context) => {
  // 初回実行時のみ初期化
  if (!logger) {
    logger = new Logger({ 
      component: 'NLPProcessor',
      requestId: context.requestId 
    });
  }

  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
  }

  const startTime = Date.now();

  try {
    logger.info('NLP Processor invoked', {
      eventType: event.type,
      requestId: context.requestId
    });

    let result;
    switch (event.type) {
      case 'CLASSIFY_INTENT':
        result = await classifyIntent(event);
        break;
      
      case 'GENERATE_RESPONSE':
        result = await generateResponse(event);
        break;
      
      case 'ANALYZE_SAFETY':
        result = await analyzeSafety(event);
        break;
      
      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }

    const processingTime = Date.now() - startTime;
    logger.metric('NLPProcessingTime', processingTime, 'Milliseconds', {
      eventType: event.type
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    logger.error('NLP Processor failed', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        requestId: context.requestId
      })
    };
  }
};

/**
 * 意図分類（GREEN/YELLOW/RED）
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 分類結果
 */
async function classifyIntent(event) {
  const { transcript, sessionId } = event;

  const prompt = `あなたは海上交通管制官のアシスタントです。以下のVHF無線通信の内容を分析し、緊急度を分類してください。

通信内容: "${transcript}"

以下の基準で分類してください：
- GREEN: 通常の航行報告、定期連絡
- YELLOW: 注意が必要な状況、軽微な問題
- RED: 緊急事態、即座の対応が必要

応答は以下のJSON形式で返してください：
{
  "classification": "GREEN/YELLOW/RED",
  "confidence": 0.0-1.0,
  "reason": "分類理由",
  "suggestedAction": "推奨される対応"
}`;

  try {
    const response = await invokeBedrockModel(prompt);
    const result = JSON.parse(response);

    // 結果をDynamoDBに保存
    await saveClassificationResult(sessionId, transcript, result);

    logger.info('Intent classified', {
      sessionId,
      classification: result.classification,
      confidence: result.confidence
    });

    return result;

  } catch (error) {
    logger.error('Failed to classify intent', error);
    throw error;
  }
}

/**
 * 応答生成
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 生成された応答
 */
async function generateResponse(event) {
  const { transcript, context, sessionId } = event;

  const prompt = `あなたは海上交通管制官のアシスタントです。以下のVHF無線通信に対する適切な応答を生成してください。

通信内容: "${transcript}"
コンテキスト: ${JSON.stringify(context || {})}

海事通信の標準プロトコルに従い、明確で簡潔な応答を日本語で生成してください。
応答には以下を含めてください：
1. 受信確認
2. 必要な指示または情報
3. 次のアクション

応答:`;

  try {
    const response = await invokeBedrockModel(prompt);

    const result = {
      suggestedResponse: response,
      timestamp: new Date().toISOString(),
      sessionId
    };

    logger.info('Response generated', {
      sessionId,
      responseLength: response.length
    });

    return result;

  } catch (error) {
    logger.error('Failed to generate response', error);
    throw error;
  }
}

/**
 * 安全性分析
 * @param {Object} event - イベントデータ
 * @returns {Promise<Object>} - 安全性分析結果
 */
async function analyzeSafety(event) {
  const { transcript, vesselData, sessionId } = event;

  const prompt = `海上交通の安全性を分析してください。

通信内容: "${transcript}"
船舶データ: ${JSON.stringify(vesselData || {})}

以下の観点から安全性を評価してください：
1. 衝突リスク
2. 航行規則遵守
3. 気象条件への対応
4. 通信プロトコル遵守

評価結果をJSON形式で返してください：
{
  "safetyScore": 0-100,
  "risks": ["識別されたリスク"],
  "recommendations": ["推奨事項"]
}`;

  try {
    const response = await invokeBedrockModel(prompt);
    const result = JSON.parse(response);

    logger.info('Safety analyzed', {
      sessionId,
      safetyScore: result.safetyScore
    });

    return result;

  } catch (error) {
    logger.error('Failed to analyze safety', error);
    throw error;
  }
}

/**
 * Bedrockモデルを呼び出し
 * @param {string} prompt - プロンプト
 * @returns {Promise<string>} - モデルの応答
 */
async function invokeBedrockModel(prompt) {
  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.7,
    top_p: 0.9
  };

  const command = new InvokeModelCommand({
    modelId,
    body: JSON.stringify(payload),
    contentType: 'application/json',
    accept: 'application/json'
  });

  try {
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    logger.debug('Bedrock model invoked', {
      modelId,
      promptLength: prompt.length,
      responseLength: responseBody.content[0].text.length
    });

    logger.metric('BedrockInvocations', 1, 'Count', {
      modelId
    });

    return responseBody.content[0].text;

  } catch (error) {
    logger.error('Failed to invoke Bedrock model', error);
    throw error;
  }
}

/**
 * 分類結果をDynamoDBに保存
 * @param {string} sessionId - セッションID
 * @param {string} transcript - 文字起こしテキスト
 * @param {Object} classification - 分類結果
 */
async function saveClassificationResult(sessionId, transcript, classification) {
  const item = {
    ConversationID: sessionId,
    ItemTimestamp: `CLASSIFY#${new Date().toISOString()}`,
    ItemType: 'CLASSIFICATION',
    TranscriptText: transcript,
    Classification: classification.classification,
    Confidence: classification.confidence,
    Reason: classification.reason,
    SuggestedAction: classification.suggestedAction,
    Timestamp: new Date().toISOString()
  };

  await dynamodbClient.putItem(
    process.env.CONVERSATIONS_TABLE || 'vts-conversations',
    item
  );

  logger.info('Classification saved', {
    sessionId,
    classification: classification.classification
  });
}