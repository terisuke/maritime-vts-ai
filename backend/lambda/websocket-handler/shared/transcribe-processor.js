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
    
    // 1分ごとに非アクティブセッションをクリーンアップ（より積極的な管理）
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 1 * 60 * 1000);
    
    this.logger.info('TranscribeProcessor initialized with periodic cleanup');
  }

  /**
   * Transcribeセッションを開始
   * @param {string} connectionId - WebSocket接続ID
   * @param {string} languageCode - 言語コード
   * @returns {Promise<void>}
   */
  async startSession(connectionId, languageCode = 'ja-JP') {
    try {
      // セッション数制限チェック（安全のために20に制限）
      if (this.sessions.size >= 20) {
        this.logger.error('Too many active sessions, rejecting new session', { 
          connectionId, 
          activeSessionCount: this.sessions.size 
        });
        throw new Error('サーバーが混雑しています。しばらくしてから再試行してください。');
      }

      // 既存セッションがある場合は即座に停止
      if (this.sessions.has(connectionId)) {
        this.logger.warn('Session already exists, stopping existing session immediately', { connectionId });
        await this.stopSession(connectionId);
        
        // 少し待機してリソースを解放
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 音声ストリーム作成
      const audioStream = new PassThrough();
      
      // Transcribe設定（正しいフォーマットに修正）
      const params = {
        LanguageCode: languageCode,
        MediaSampleRateHertz: 16000,
        MediaEncoding: 'pcm', // 正しいPCM形式
        AudioStream: this.createAudioStreamGenerator(audioStream)
      };

      // カスタム語彙がある場合は追加（現在は無効化）
      // TODO: カスタムボキャブラリーを作成後に有効化
      // if (process.env.TRANSCRIBE_VOCABULARY_NAME) {
      //   params.VocabularyName = process.env.TRANSCRIBE_VOCABULARY_NAME;
      //   this.logger.info('Using custom vocabulary', { 
      //     vocabularyName: params.VocabularyName 
      //   });
      // }

      const command = new StartStreamTranscriptionCommand(params);

      const transcribeSession = {
        audioStream,
        command,
        isActive: true,
        startTime: Date.now(),
        chunksProcessed: 0,
        lastActivity: Date.now(),
        retryCount: 0  // リトライ回数を追加
      };

      this.sessions.set(connectionId, transcribeSession);
      
      this.logger.info('Transcribe session started', { 
        connectionId, 
        languageCode,
        activeSessionCount: this.sessions.size
        // vocabularyName: params.VocabularyName  // TODO: ボキャブラリー作成後に有効化
      });

      // Transcribe結果の処理を非同期で開始（すぐに開始）
      setImmediate(() => {
        this.processTranscribeStream(connectionId, command).catch(error => {
          this.logger.error('Transcribe stream processing error', {
            connectionId,
            error: error.message,
            stack: error.stack
          });
          this.stopSession(connectionId);
        });
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
        // TranscribeStreamingの正しい形式に修正
        yield { 
          AudioEvent: { 
            AudioChunk: new Uint8Array(chunk) 
          } 
        };
      }
    } catch (error) {
      this.logger.error('Audio stream generator error', error);
      // ストリーム終了イベントを送信
      yield { AudioEvent: { AudioChunk: new Uint8Array(0) } };
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
          this.logger.error('Transcribe BadRequestException', {
            connectionId,
            error: event.BadRequestException,
            message: event.BadRequestException.Message
          });
          throw new Error(`Transcribe BadRequest: ${event.BadRequestException.Message}`);
        }
      }

      this.logger.info('Transcribe stream ended', { connectionId });

    } catch (error) {
      // 特定のエラータイプに基づいて適切な処理を行う
      const errorMessage = error.message || error.toString();
      const errorName = error.name || 'UnknownError';
      
      this.logger.error('Transcribe stream processing error', {
        connectionId,
        errorMessage,
        errorName,
        errorStack: error.stack
      });
      
      // エラーメトリクス
      this.logger.metric('TranscribeErrors', 1, 'Count', {
        errorType: errorName
      });
      
      // 特定のエラータイプによる処理の分岐
      if (errorMessage.includes('concurrent streams') || errorMessage.includes('limit of concurrent streams')) {
        // 同時接続制限エラー: 即座にクリーンアップして待機
        this.logger.error('Concurrent stream limit exceeded', { 
          connectionId, 
          activeSessionCount: this.sessions.size 
        });
        
        // 即座にセッションクリーンアップ
        await this.stopSession(connectionId);
        
        // 他のセッションも強制的にクリーンアップ（古いセッションから）
        await this.cleanupOldestSessions(Math.min(5, this.sessions.size));
        
        throw new Error('サーバーが混雑しています。しばらく待ってから再試行してください。');
        
      } else if (errorMessage.includes('HTTP/2 stream') || errorMessage.includes('abnormally aborted')) {
        // HTTP/2接続エラー: ネットワーク関連の問題
        this.logger.error('HTTP/2 stream error detected', { connectionId });
        
        await this.stopSession(connectionId);
        throw new Error('ネットワーク接続エラーが発生しました。再接続してください。');
        
      } else if (errorMessage.includes('timed out because no new audio')) {
        // 15秒タイムアウト: 音声データが来ていない
        this.logger.warn('Audio timeout - no audio received for 15 seconds', { connectionId });
        
        await this.stopSession(connectionId);
        throw new Error('音声データが受信されませんでした。マイクの設定を確認してください。');
        
      } else {
        // その他のエラー: 一般的なクリーンアップ
        await this.stopSession(connectionId);
        throw error;
      }
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
      
      // 音声フォーマットの厳密な検証
      if (audioBuffer.length === 0) {
        this.logger.warn('Empty audio buffer received', { connectionId });
        return;
      }

      // PCM 16-bit形式の検証（2の倍数であることを確認）
      if (audioBuffer.length % 2 !== 0) {
        this.logger.warn('Invalid PCM data: buffer length not multiple of 2', {
          connectionId,
          bufferLength: audioBuffer.length
        });
        return;
      }

      // 最小サイズ検証（少なくとも1サンプル分）
      if (audioBuffer.length < 2) {
        this.logger.warn('Audio buffer too small', {
          connectionId,
          bufferLength: audioBuffer.length
        });
        return;
      }

      // ストリームに書き込み
      if (!session.audioStream.destroyed) {
        session.audioStream.write(audioBuffer);
        session.chunksProcessed++;
        session.lastActivity = Date.now();

        this.logger.debug('Audio chunk processed', {
          connectionId,
          bufferSize: audioBuffer.length,
          chunksProcessed: session.chunksProcessed
        });

        // メトリクス記録
        this.logger.metric('AudioChunksProcessed', 1, 'Count');
        this.logger.metric('AudioBytesProcessed', audioBuffer.length, 'Bytes');
      } else {
        this.logger.warn('Audio stream destroyed, cannot write chunk', { connectionId });
      }

    } catch (error) {
      this.logger.error('Failed to process audio chunk', {
        connectionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * セッションを停止
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<void>}
   */
  async stopSession(connectionId) {
    const session = this.sessions.get(connectionId);
    
    if (session) {
      try {
        session.isActive = false;
        
        // ストリームを確実にクローズ
        if (session.audioStream) {
          session.audioStream.end();
          session.audioStream.destroy();
        }

        // セッション時間を記録
        const sessionDuration = Date.now() - session.startTime;
        
        this.logger.info('Transcribe session cleaned up', {
          connectionId,
          duration: sessionDuration,
          chunksProcessed: session.chunksProcessed
        });

        // メトリクス記録
        this.logger.metric('TranscribeSessionDuration', sessionDuration, 'Milliseconds');
        this.logger.metric('TranscribeSessionsStopped', 1, 'Count');

        // メモリから削除
        this.sessions.delete(connectionId);
        
        // ガベージコレクションを促す（利用可能な場合）
        if (global.gc) {
          global.gc();
        }
        
      } catch (error) {
        this.logger.error('Error cleaning up session', { connectionId, error });
      }
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
   * 非アクティブセッションの定期クリーンアップ
   * @returns {void}
   */
  cleanupInactiveSessions() {
    const now = Date.now();
    const timeout = 3 * 60 * 1000; // 3分（より積極的なクリーンアップ）
    let cleanedCount = 0;
    
    this.sessions.forEach((session, connectionId) => {
      // 非アクティブまたは長時間活動がないセッションをクリーンアップ
      const isInactive = !session.isActive;
      const isStale = (now - session.lastActivity) > timeout;
      const isOld = (now - session.startTime) > (15 * 60 * 1000); // 15分以上経過
      
      if (isInactive && isStale || isOld) {
        this.stopSession(connectionId);
        cleanedCount++;
        
        this.logger.debug('Session cleaned up', {
          connectionId,
          reason: isOld ? 'too_old' : 'inactive_and_stale',
          age: now - session.startTime,
          lastActivityAge: now - session.lastActivity
        });
      }
    });
    
    if (cleanedCount > 0) {
      this.logger.info('Cleanup completed', { 
        cleanedSessions: cleanedCount,
        activeSessions: this.sessions.size
      });
      
      this.logger.metric('TranscribeSessionsCleanedUp', cleanedCount, 'Count');
    }
  }

  /**
   * 古いセッションから指定された数だけクリーンアップ
   * @param {number} count - クリーンアップするセッション数
   * @returns {Promise<void>}
   */
  async cleanupOldestSessions(count = 5) {
    if (this.sessions.size === 0) return;
    
    // セッションを開始時刻順にソート（古い順）
    const sessionEntries = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].startTime - b[1].startTime);
    
    const sessionsToCleanup = sessionEntries.slice(0, count);
    
    this.logger.info('Cleaning up oldest sessions due to concurrent limit', {
      totalSessions: this.sessions.size,
      cleanupCount: sessionsToCleanup.length
    });
    
    for (const [connectionId, session] of sessionsToCleanup) {
      try {
        await this.stopSession(connectionId);
        this.logger.info('Cleaned up old session', {
          connectionId,
          sessionAge: Date.now() - session.startTime,
          chunksProcessed: session.chunksProcessed
        });
      } catch (error) {
        this.logger.error('Error cleaning up old session', {
          connectionId,
          error: error.message
        });
      }
    }
    
    // クリーンアップ後の状態をログ
    this.logger.info('Cleanup completed', {
      remainingSessions: this.sessions.size
    });
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