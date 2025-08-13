/**
 * WebSocket Connection Manager
 * WebSocket接続の管理とDynamoDBへの永続化を担当
 */

const dynamodbClient = require('../shared/dynamodb-client');
const Logger = require('../shared/logger');

class ConnectionManager {
  constructor() {
    this.logger = new Logger({ component: 'ConnectionManager' });
    this.connectionsTable = process.env.CONNECTIONS_TABLE || 'vts-connections';
  }

  /**
   * 新規接続を登録
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} metadata - 接続メタデータ
   * @returns {Promise<Object>} - 保存された接続情報
   */
  async registerConnection(connectionId, metadata = {}) {
    const connectionData = {
      connectionId,
      connectedAt: new Date().toISOString(),
      status: 'CONNECTED',
      clientIp: metadata.clientIp || 'unknown',
      userAgent: metadata.userAgent || 'unknown',
      lastActivity: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 86400, // 24時間後に自動削除
      ...metadata
    };

    try {
      await dynamodbClient.putItem(this.connectionsTable, connectionData);
      
      this.logger.info('Connection registered', {
        connectionId,
        clientIp: connectionData.clientIp
      });
      
      this.logger.audit('CONNECTION_ESTABLISHED', {
        connectionId,
        clientIp: connectionData.clientIp,
        timestamp: connectionData.connectedAt
      });
      
      this.logger.metric('WebSocketConnections', 1, 'Count', {
        action: 'connect'
      });
      
      return connectionData;
    } catch (error) {
      this.logger.error('Failed to register connection', error);
      throw new Error(`Failed to register connection: ${error.message}`);
    }
  }

  /**
   * 接続を削除
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<void>}
   */
  async removeConnection(connectionId) {
    try {
      // 接続情報を取得してから削除（監査ログ用）
      const connection = await this.getConnection(connectionId);
      
      await dynamodbClient.deleteItem(this.connectionsTable, { connectionId });
      
      this.logger.info('Connection removed', { connectionId });
      
      if (connection) {
        const connectionDuration = Date.now() - new Date(connection.connectedAt).getTime();
        
        this.logger.audit('CONNECTION_CLOSED', {
          connectionId,
          clientIp: connection.clientIp,
          duration: connectionDuration,
          timestamp: new Date().toISOString()
        });
        
        this.logger.metric('ConnectionDuration', connectionDuration, 'Milliseconds', {
          status: 'closed'
        });
      }
      
      this.logger.metric('WebSocketConnections', 1, 'Count', {
        action: 'disconnect'
      });
    } catch (error) {
      this.logger.error('Failed to remove connection', error);
      // 削除に失敗しても例外を投げない（接続は既に切断されている）
    }
  }

  /**
   * 接続情報を取得
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<Object|null>} - 接続情報
   */
  async getConnection(connectionId) {
    try {
      const connection = await dynamodbClient.getItem(this.connectionsTable, { connectionId });
      
      if (connection) {
        this.logger.debug('Connection retrieved', { connectionId });
      } else {
        this.logger.warn('Connection not found', { connectionId });
      }
      
      return connection;
    } catch (error) {
      this.logger.error('Failed to get connection', error);
      return null;
    }
  }

  /**
   * 接続のアクティビティを更新
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<Object>} - 更新された接続情報
   */
  async updateActivity(connectionId) {
    try {
      const updates = {
        lastActivity: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 86400 // TTLを延長
      };
      
      const updatedConnection = await dynamodbClient.updateItem(
        this.connectionsTable,
        { connectionId },
        updates
      );
      
      this.logger.debug('Connection activity updated', { connectionId });
      
      return updatedConnection;
    } catch (error) {
      this.logger.error('Failed to update connection activity', error);
      throw error;
    }
  }

  /**
   * 接続にメタデータを追加
   * @param {string} connectionId - WebSocket接続ID
   * @param {Object} metadata - 追加するメタデータ
   * @returns {Promise<Object>} - 更新された接続情報
   */
  async addMetadata(connectionId, metadata) {
    try {
      const updatedConnection = await dynamodbClient.updateItem(
        this.connectionsTable,
        { connectionId },
        metadata
      );
      
      this.logger.info('Connection metadata added', { 
        connectionId,
        metadataKeys: Object.keys(metadata)
      });
      
      return updatedConnection;
    } catch (error) {
      this.logger.error('Failed to add connection metadata', error);
      throw error;
    }
  }

  /**
   * アクティブな接続を全て取得
   * @returns {Promise<Array>} - アクティブな接続のリスト
   */
  async getActiveConnections() {
    try {
      // ステータスがCONNECTEDの接続を取得
      const connections = await dynamodbClient.query(this.connectionsTable, {
        IndexName: 'StatusIndex', // GSIを使用（要インフラ更新）
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'CONNECTED'
        }
      });
      
      this.logger.info('Active connections retrieved', {
        count: connections.length
      });
      
      return connections;
    } catch (error) {
      this.logger.error('Failed to get active connections', error);
      return [];
    }
  }

  /**
   * 接続の健全性をチェック
   * @param {string} connectionId - WebSocket接続ID
   * @returns {Promise<boolean>} - 接続が健全かどうか
   */
  async isConnectionHealthy(connectionId) {
    try {
      const connection = await this.getConnection(connectionId);
      
      if (!connection) {
        return false;
      }
      
      // 最後のアクティビティから5分以上経過していたら不健全とみなす
      const lastActivityTime = new Date(connection.lastActivity).getTime();
      const currentTime = Date.now();
      const inactivityThreshold = 5 * 60 * 1000; // 5分
      
      const isHealthy = (currentTime - lastActivityTime) < inactivityThreshold;
      
      if (!isHealthy) {
        this.logger.warn('Unhealthy connection detected', {
          connectionId,
          lastActivity: connection.lastActivity,
          inactivityMinutes: Math.floor((currentTime - lastActivityTime) / 60000)
        });
      }
      
      return isHealthy;
    } catch (error) {
      this.logger.error('Failed to check connection health', error);
      return false;
    }
  }
}

module.exports = ConnectionManager;