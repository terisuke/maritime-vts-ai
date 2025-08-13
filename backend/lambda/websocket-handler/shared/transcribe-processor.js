/**
 * Amazon Transcribe Streaming Processor
 * リアルタイム音声文字起こし処理を担当
 */

const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { PassThrough } = require('stream');
const Logger = require('./logger');

class TranscribeProcessor {
  constructor() {
    this.logger = new Logger({ component: 'TranscribeProcessor' });
    this.client = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
    this.sessions = new Map(); // connectionIdごとのセッション管理
  }

  /**
   * Transcribeセッションを開始
   * @param {string} connectionId - WebSocket接続ID
   * @param {string} languageCode - 言語コード
   * @returns {Promise<void>}
   */
  async startSession(connectionId, languageCode = 'ja-JP') {
    try {
      // 既存セッションがある場合は停止
      if (this.sessions.has(connectionId)) {
        this.logger.warn('Session already exists, stopping existing session', { connectionId });
        await this.stopSession(connectionId);
      }

      // 音声ストリーム作成
      const audioStream = new PassThrough();
      
      // Transcribe設定
      const params = {
        LanguageCode: languageCode,
        MediaSampleRateHertz: 16000,
        MediaEncoding: 'pcm',
        AudioStream: this.createAudioStreamGenerator(audioStream)
        // ShowSpeakerLabel: false, // 日本語では未サポート
        // EnableChannelIdentification: false,
        // NumberOfChannels は EnableChannelIdentification が true の場合のみ必要
      };

      // カスタム語彙がある場合は追加
      if (process.env.TRANSCRIBE_VOCABULARY_NAME) {
        params.VocabularyName = process.env.TRANSCRIBE_VOCABULARY_NAME;
        this.logger.info('Using custom vocabulary', { 
          vocabularyName: params.VocabularyName 
        });
      }

      const command = new StartStreamTranscriptionCommand(params);

      const transcribeSession = {
        audioStream,
        command,
        isActive: true,
        startTime: Date.now(),
        chunksProcessed: 0
      };

      this.sessions.set(connectionId, transcribeSession);
      
      this.logger.info('Transcribe session started', { 
        connectionId, 
        languageCode,
        vocabularyName: params.VocabularyName 
      });

      // Transcribe結果の処理を非同期で開始
      this.processTranscribeStream(connectionId, command).catch(error => {
        this.logger.error('Transcribe stream processing error', error);
        this.stopSession(connectionId);
      });

      this.logger.metric('TranscribeSessionsStarted', 1, 'Count', {
        languageCode
      });

    } catch (error) {
      this.logger.error('Failed to start Transcribe session', error);
      throw error;
    }
  }

  /**
   * 音声ストリームジェネレーター作成
   * @param {PassThrough} audioStream - 音声ストリーム
   * @returns {AsyncGenerator}
   */
  async *createAudioStreamGenerator(audioStream) {
    try {
      for await (const chunk of audioStream) {
        yield { AudioEvent: { AudioChunk: chunk } };
      }
    } catch (error) {
      this.logger.error('Audio stream generator error', error);
    }
  }

  /**
   * Transcribeストリームを処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {StartStreamTranscriptionCommand} command - Transcribeコマンド
   * @returns {Promise<void>}
   */
  async processTranscribeStream(connectionId, command) {
    try {
      const session = this.sessions.get(connectionId);
      if (!session) return;

      const response = await this.client.send(command);
      
      this.logger.info('Transcribe stream started', { connectionId });

      for await (const event of response.TranscriptResultStream) {
        // セッションが非アクティブになったら終了
        if (!this.sessions.get(connectionId)?.isActive) {
          this.logger.info('Session became inactive, stopping stream', { connectionId });
          break;
        }
        
        if (event.TranscriptEvent) {
          const transcript = event.TranscriptEvent.Transcript;
          
          if (transcript.Results && transcript.Results.length > 0) {
            for (const result of transcript.Results) {
              if (result.Alternatives && result.Alternatives.length > 0) {
                const alternative = result.Alternatives[0];
                
                // 信頼度スコアの計算
                let confidence = 0.9; // デフォルト値
                if (alternative.Items && alternative.Items.length > 0) {
                  const confidenceSum = alternative.Items.reduce((acc, item) => {
                    return acc + (item.Confidence || 0);
                  }, 0);
                  confidence = confidenceSum / alternative.Items.length;
                }

                // 結果オブジェクト作成
                const transcriptionResult = {
                  text: alternative.Transcript || '',
                  isPartial: result.IsPartial === true,
                  confidence: confidence,
                  timestamp: new Date().toISOString(),
                  resultId: result.ResultId,
                  startTime: result.StartTime,
                  endTime: result.EndTime
                };

                // 結果をコールバックで通知
                if (this.onTranscriptionResult) {
                  await this.onTranscriptionResult(connectionId, transcriptionResult);
                }

                this.logger.debug('Transcription result', {
                  connectionId,
                  isPartial: transcriptionResult.isPartial,
                  textLength: transcriptionResult.text.length,
                  confidence: transcriptionResult.confidence
                });

                // メトリクス記録
                if (!transcriptionResult.isPartial) {
                  this.logger.metric('TranscriptionCompleted', 1, 'Count', {
                    confidence: Math.round(confidence * 100)
                  });
                }
              }
            }
          }
        } else if (event.BadRequestException) {
          this.logger.error('Transcribe bad request', event.BadRequestException);
          throw new Error(event.BadRequestException.Message);
        }
      }

      this.logger.info('Transcribe stream ended', { connectionId });

    } catch (error) {
      this.logger.error('Transcribe stream processing error', error);
      
      // エラーメトリクス
      this.logger.metric('TranscribeErrors', 1, 'Count', {
        errorType: error.name || 'UnknownError'
      });
      
      // セッションをクリーンアップ
      this.stopSession(connectionId);
      
      throw error;
    }
  }

  /**
   * 音声チャンクを処理
   * @param {string} connectionId - WebSocket接続ID
   * @param {string} base64Audio - Base64エンコードされた音声データ
   * @returns {Promise<void>}
   */
  async processAudioChunk(connectionId, base64Audio) {
    const session = this.sessions.get(connectionId);
    
    if (!session || !session.isActive) {
      this.logger.warn('No active session for connection', { connectionId });
      return;
    }

    try {
      // Base64をバイナリに変換
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      
      // 音声フォーマットの検証（PCM 16kHz 16bit mono想定）
      if (audioBuffer.length === 0) {
        this.logger.warn('Empty audio buffer received', { connectionId });
        return;
      }

      // ストリームに書き込み
      session.audioStream.write(audioBuffer);
      session.chunksProcessed++;

      this.logger.debug('Audio chunk processed', {
        connectionId,
        bufferSize: audioBuffer.length,
        chunksProcessed: session.chunksProcessed
      });

      // メトリクス記録
      this.logger.metric('AudioChunksProcessed', 1, 'Count');
      this.logger.metric('AudioBytesProcessed', audioBuffer.length, 'Bytes');

    } catch (error) {
      this.logger.error('Failed to process audio chunk', error);
      throw error;
    }
  }

  /**
   * セッションを停止
   * @param {string} connectionId - WebSocket接続ID
   * @returns {void}
   */
  stopSession(connectionId) {
    const session = this.sessions.get(connectionId);
    
    if (session) {
      session.isActive = false;
      
      // ストリームを終了
      if (session.audioStream) {
        session.audioStream.end();
      }

      // セッション時間を記録
      const sessionDuration = Date.now() - session.startTime;
      
      this.logger.info('Transcribe session stopped', {
        connectionId,
        duration: sessionDuration,
        chunksProcessed: session.chunksProcessed
      });

      // メトリクス記録
      this.logger.metric('TranscribeSessionDuration', sessionDuration, 'Milliseconds');
      this.logger.metric('TranscribeSessionsStopped', 1, 'Count');

      // セッションを削除
      this.sessions.delete(connectionId);
    }
  }

  /**
   * アクティブなセッション数を取得
   * @returns {number}
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * セッション情報を取得
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Object|null}
   */
  getSessionInfo(connectionId) {
    const session = this.sessions.get(connectionId);
    
    if (session) {
      return {
        isActive: session.isActive,
        startTime: session.startTime,
        chunksProcessed: session.chunksProcessed,
        duration: Date.now() - session.startTime
      };
    }
    
    return null;
  }

  /**
   * 全セッションを停止
   * @returns {void}
   */
  stopAllSessions() {
    this.logger.info('Stopping all Transcribe sessions', {
      count: this.sessions.size
    });

    for (const connectionId of this.sessions.keys()) {
      this.stopSession(connectionId);
    }
  }

  // 結果処理用のコールバック（message-routerから設定）
  onTranscriptionResult = null;
}

module.exports = TranscribeProcessor;