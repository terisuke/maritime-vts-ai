/**
 * Amazon Transcribe Client
 * Transcribe Streaming APIとの連携を管理
 */

const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { PassThrough } = require('stream');
const Logger = require('../shared/logger');

class TranscribeClient {
  constructor() {
    this.logger = new Logger({ component: 'TranscribeClient' });
    
    // Transcribe Streaming Client
    this.client = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });

    // アクティブなストリーミングセッションを管理
    this.activeSessions = new Map();
  }

  /**
   * ストリーミング文字起こしを開始
   * @param {string} sessionId - セッションID
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} - ストリーミングセッション
   */
  async startStreamingTranscription(sessionId, options = {}) {
    const {
      languageCode = 'ja-JP',
      mediaSampleRateHertz = 16000,
      mediaEncoding = 'pcm',
      vocabularyName = null,
      vocabularyFilterName = null,
      showSpeakerLabel = false
    } = options;

    try {
      // 既存のセッションがある場合は終了
      if (this.activeSessions.has(sessionId)) {
        await this.stopStreamingTranscription(sessionId);
      }

      // 音声入力用のストリーム
      const audioStream = new PassThrough();
      
      // Transcribeコマンドのパラメータ
      const params = {
        LanguageCode: languageCode,
        MediaSampleRateHertz: mediaSampleRateHertz,
        MediaEncoding: mediaEncoding,
        AudioStream: this.createAudioStreamGenerator(audioStream),
        EnableChannelIdentification: false,
        ShowSpeakerLabel: showSpeakerLabel
      };

      // カスタム語彙が指定されている場合
      if (vocabularyName) {
        params.VocabularyName = vocabularyName;
      }

      // 語彙フィルターが指定されている場合
      if (vocabularyFilterName) {
        params.VocabularyFilterName = vocabularyFilterName;
        params.VocabularyFilterMethod = 'mask'; // 不適切な単語をマスク
      }

      // Transcribeストリーミングを開始
      const command = new StartStreamTranscriptionCommand(params);
      const response = await this.client.send(command);

      // セッション情報を保存
      const session = {
        sessionId,
        audioStream,
        transcriptStream: response.TranscriptResultStream,
        startTime: Date.now(),
        languageCode,
        mediaSampleRateHertz,
        mediaEncoding
      };

      this.activeSessions.set(sessionId, session);

      this.logger.info('Streaming transcription started', {
        sessionId,
        languageCode,
        sampleRate: mediaSampleRateHertz
      });

      this.logger.metric('TranscriptionSessionsStarted', 1, 'Count', {
        languageCode
      });

      return session;

    } catch (error) {
      this.logger.error('Failed to start streaming transcription', error);
      throw new Error(`Failed to start transcription: ${error.message}`);
    }
  }

  /**
   * 音声ストリームジェネレーターを作成
   * @param {PassThrough} audioStream - 音声ストリーム
   * @returns {AsyncGenerator} - 音声チャンクのジェネレーター
   */
  async *createAudioStreamGenerator(audioStream) {
    for await (const chunk of audioStream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  /**
   * ストリーミング文字起こしを停止
   * @param {string} sessionId - セッションID
   * @returns {Promise<void>}
   */
  async stopStreamingTranscription(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      
      if (!session) {
        this.logger.warn('Session not found for stopping', { sessionId });
        return;
      }

      // 音声ストリームを終了
      if (session.audioStream) {
        session.audioStream.end();
      }

      // セッション情報を削除
      this.activeSessions.delete(sessionId);

      const duration = Date.now() - session.startTime;
      
      this.logger.info('Streaming transcription stopped', {
        sessionId,
        duration
      });

      this.logger.metric('TranscriptionSessionDuration', duration, 'Milliseconds', {
        languageCode: session.languageCode
      });

      this.logger.metric('TranscriptionSessionsStopped', 1, 'Count', {
        languageCode: session.languageCode
      });

    } catch (error) {
      this.logger.error('Failed to stop streaming transcription', error);
      throw new Error(`Failed to stop transcription: ${error.message}`);
    }
  }

  /**
   * 音声データをストリームに送信
   * @param {string} sessionId - セッションID
   * @param {Buffer} audioData - 音声データ
   * @returns {Promise<void>}
   */
  async sendAudioData(sessionId, audioData) {
    try {
      const session = this.activeSessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // 音声データをストリームに書き込み
      session.audioStream.write(audioData);
      
      this.logger.debug('Audio data sent to stream', {
        sessionId,
        dataSize: audioData.length
      });

      this.logger.metric('AudioDataSent', audioData.length, 'Bytes', {
        sessionId
      });

    } catch (error) {
      this.logger.error('Failed to send audio data', error);
      throw error;
    }
  }

  /**
   * 文字起こし結果を処理
   * @param {string} sessionId - セッションID
   * @param {Function} callback - 結果処理用のコールバック
   * @returns {Promise<void>}
   */
  async processTranscriptionResults(sessionId, callback) {
    try {
      const session = this.activeSessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Transcribeからの結果をストリーミング処理
      for await (const event of session.transcriptStream) {
        if (event.TranscriptEvent) {
          const results = event.TranscriptEvent.Transcript.Results;
          
          for (const result of results) {
            // 最終結果のみ処理（中間結果は無視）
            if (!result.IsPartial) {
              const transcript = result.Alternatives[0].Transcript;
              const confidence = result.Alternatives[0].Items
                ?.reduce((sum, item) => sum + (item.Confidence || 0), 0) 
                / (result.Alternatives[0].Items?.length || 1);

              const transcriptionResult = {
                sessionId,
                transcript,
                confidence: confidence || 0,
                timestamp: new Date().toISOString(),
                startTime: result.StartTime,
                endTime: result.EndTime
              };

              // コールバック関数を実行
              await callback(transcriptionResult);

              this.logger.info('Transcription result processed', {
                sessionId,
                transcriptLength: transcript.length,
                confidence
              });

              this.logger.metric('TranscriptionResults', 1, 'Count', {
                sessionId,
                isFinal: true
              });
            } else {
              // 中間結果のログ（デバッグ用）
              this.logger.debug('Partial transcription result', {
                sessionId,
                partial: result.Alternatives[0].Transcript
              });

              this.logger.metric('TranscriptionResults', 1, 'Count', {
                sessionId,
                isFinal: false
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to process transcription results', error);
      throw error;
    }
  }

  /**
   * アクティブなセッションの数を取得
   * @returns {number} - アクティブなセッション数
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * セッション情報を取得
   * @param {string} sessionId - セッションID
   * @returns {Object|null} - セッション情報
   */
  getSessionInfo(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
      languageCode: session.languageCode,
      mediaSampleRateHertz: session.mediaSampleRateHertz,
      mediaEncoding: session.mediaEncoding
    };
  }

  /**
   * 全セッションをクリーンアップ
   * @returns {Promise<void>}
   */
  async cleanupAllSessions() {
    this.logger.info('Cleaning up all transcription sessions', {
      count: this.activeSessions.size
    });

    for (const [sessionId] of this.activeSessions) {
      await this.stopStreamingTranscription(sessionId);
    }

    this.logger.info('All transcription sessions cleaned up');
  }
}

module.exports = TranscribeClient;