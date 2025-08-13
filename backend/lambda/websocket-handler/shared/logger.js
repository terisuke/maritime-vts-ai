/**
 * VTS Logger Utility
 * CloudWatch Logsへの構造化ログ出力を提供
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

class Logger {
  constructor(context = {}) {
    this.context = context;
    this.logLevel = process.env.LOG_LEVEL || 'INFO';
  }

  _shouldLog(level) {
    const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex <= currentLevelIndex;
  }

  _formatLog(level, message, data = {}) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data
    };

    // CloudWatch Logsに適したJSON形式で出力
    return JSON.stringify(log);
  }

  error(message, error = null) {
    if (this._shouldLog(LOG_LEVELS.ERROR)) {
      const data = error ? {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      } : {};
      console.error(this._formatLog(LOG_LEVELS.ERROR, message, data));
    }
  }

  warn(message, data = {}) {
    if (this._shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this._formatLog(LOG_LEVELS.WARN, message, data));
    }
  }

  info(message, data = {}) {
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      console.info(this._formatLog(LOG_LEVELS.INFO, message, data));
    }
  }

  debug(message, data = {}) {
    if (this._shouldLog(LOG_LEVELS.DEBUG)) {
      console.debug(this._formatLog(LOG_LEVELS.DEBUG, message, data));
    }
  }

  // 監査ログ用の特別なメソッド
  audit(action, data = {}) {
    const auditLog = {
      timestamp: new Date().toISOString(),
      level: 'AUDIT',
      action,
      ...this.context,
      ...data
    };
    console.info(JSON.stringify(auditLog));
  }

  // メトリクス記録用
  metric(metricName, value, unit = 'Count', dimensions = {}) {
    const metric = {
      timestamp: new Date().toISOString(),
      level: 'METRIC',
      metricName,
      value,
      unit,
      dimensions: { ...this.context, ...dimensions }
    };
    console.info(JSON.stringify(metric));
  }

  // 子ロガーを作成（追加のコンテキストを持つ）
  child(additionalContext) {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

module.exports = Logger;