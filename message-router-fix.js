// 修正版 message-router.js handleTranscriptionResult メソッド（445行目から）
async handleTranscriptionResult(connectionId, result) {
  try {
    // クライアントに文字起こし結果を送信
    await this.sendToConnection(connectionId, {
      type: 'transcription',
      payload: {
        transcriptText: result.text,
        confidence: result.confidence,
        timestamp: result.timestamp,
        isPartial: result.isPartial,
        speakerLabel: 'VTS'
      }
    });

    // 完全な文字起こしの場合、AI処理を実行
    if (!result.isPartial && result.text && result.text.length > 2) {
      // 会話履歴を保存
      const transcriptionItem = {
        ConversationID: `CONN-${connectionId}`,
        ItemTimestamp: `TRANS#${result.timestamp}`,
        ItemType: 'TRANSCRIPTION',
        ConnectionID: connectionId,
        TranscriptText: result.text,
        Confidence: result.confidence,
        Timestamp: result.timestamp
      };

      await dynamodbClient.putItem(this.conversationsTable, transcriptionItem);

      this.logger.info('Transcription saved, processing with AI', {
        connectionId,
        textLength: result.text.length,
        confidence: result.confidence
      });

      // AI処理をtry-catchでラップ
      try {
        // 🔧 修正: generateEmergencyResponseを削除し、processVTSCommunicationを直接使用
        const aiResponse = await this.bedrockProcessor.processVTSCommunication(
          result.text,
          {
            location: '博多港',
            timestamp: new Date().toISOString(),
            connectionId: connectionId,
            vesselInfo: { type: '未特定' }
          }
        );
        
        // 🔧 修正: メッセージタイプを 'aiResponse' に統一
        // AI応答をクライアントに送信
        await this.sendToConnection(connectionId, {
          type: 'aiResponse',  // ← 'AI_RESPONSE'から変更
          payload: aiResponse
        });
        
        this.logger.info('AI response sent successfully', {
          connectionId,
          classification: aiResponse.classification,
          confidence: aiResponse.confidence
        });
        
      } catch (aiError) {
        this.logger.error('AI processing failed', { 
          error: aiError.message || aiError, 
          connectionId, 
          transcriptText: result.text 
        });
        
        // 🔧 修正: フォールバック応答もメッセージタイプを統一
        await this.sendToConnection(connectionId, {
          type: 'aiResponse',  // ← 'AI_RESPONSE'から変更
          payload: {
            classification: 'AMBER',
            suggestedResponse: 'AI処理中にエラーが発生しました。音声は正常に記録されています。もう一度お試しください。',
            confidence: 0,
            isEmergency: false,
            error: true,
            errorMessage: aiError.message || 'AI分析サービスが一時的に利用できません',
            timestamp: new Date().toISOString()
          }
        });
        
        // AI処理エラーのメトリクスを記録
        this.logger.metric('AIProcessingErrors', 1, 'Count', {
          errorType: aiError.name || 'UnknownError'
        });
      }

      // AI応答を保存（エラーの場合も記録）
      if (aiResponse) {
        const aiResponseItem = {
          ConversationID: `CONN-${connectionId}`,
          ItemTimestamp: `AI#${new Date().toISOString()}`,
          ItemType: 'AI_RESPONSE',
          ConnectionID: connectionId,
          Classification: aiResponse.classification || 'UNKNOWN',
          SuggestedResponse: aiResponse.suggestedResponse || '',
          Confidence: aiResponse.confidence || 0,
          RiskFactors: aiResponse.riskFactors || [],
          RecommendedActions: aiResponse.recommendedActions || [],
          Timestamp: new Date().toISOString()
        };

        await dynamodbClient.putItem(this.conversationsTable, aiResponseItem);
      }

      this.logger.metric('AIResponsesSent', 1, 'Count', {
        classification: aiResponse?.classification || 'ERROR'
      });
    }

    this.logger.metric('TranscriptionsSent', 1, 'Count', {
      isPartial: result.isPartial
    });

  } catch (error) {
    this.logger.error('Failed to handle transcription result', {
      error: error.message || error,
      connectionId
    });
  }
}
