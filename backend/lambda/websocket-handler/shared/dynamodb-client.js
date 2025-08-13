/**
 * VTS DynamoDB Client
 * DynamoDBへのアクセスを管理し、リトライ機構を提供
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const Logger = require('./logger');

class DynamoDBManager {
  constructor() {
    this.logger = new Logger({ component: 'DynamoDBManager' });
    
    // DynamoDB Clientの初期化
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-northeast-1',
      maxAttempts: 3,
      retryMode: 'adaptive'
    });

    // DocumentClientでラップ（自動的にマーシャリング/アンマーシャリング）
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: false
      }
    });
  }

  /**
   * アイテムを保存
   * @param {string} tableName - テーブル名
   * @param {Object} item - 保存するアイテム
   * @returns {Promise<Object>} - 保存結果
   */
  async putItem(tableName, item) {
    const params = {
      TableName: tableName,
      Item: item
    };

    try {
      this.logger.debug('DynamoDB putItem', { tableName, item });
      const result = await this.docClient.send(new PutCommand(params));
      this.logger.info('Item saved successfully', { tableName, itemId: item.id || item.connectionId });
      return result;
    } catch (error) {
      this.logger.error('Failed to save item to DynamoDB', error);
      throw error;
    }
  }

  /**
   * アイテムを取得
   * @param {string} tableName - テーブル名
   * @param {Object} key - プライマリキー
   * @returns {Promise<Object|null>} - 取得したアイテム
   */
  async getItem(tableName, key) {
    const params = {
      TableName: tableName,
      Key: key
    };

    try {
      this.logger.debug('DynamoDB getItem', { tableName, key });
      const result = await this.docClient.send(new GetCommand(params));
      if (result.Item) {
        this.logger.info('Item retrieved successfully', { tableName, key });
        return result.Item;
      }
      this.logger.info('Item not found', { tableName, key });
      return null;
    } catch (error) {
      this.logger.error('Failed to get item from DynamoDB', error);
      throw error;
    }
  }

  /**
   * アイテムを削除
   * @param {string} tableName - テーブル名
   * @param {Object} key - プライマリキー
   * @returns {Promise<Object>} - 削除結果
   */
  async deleteItem(tableName, key) {
    const params = {
      TableName: tableName,
      Key: key
    };

    try {
      this.logger.debug('DynamoDB deleteItem', { tableName, key });
      const result = await this.docClient.send(new DeleteCommand(params));
      this.logger.info('Item deleted successfully', { tableName, key });
      return result;
    } catch (error) {
      this.logger.error('Failed to delete item from DynamoDB', error);
      throw error;
    }
  }

  /**
   * アイテムを更新
   * @param {string} tableName - テーブル名
   * @param {Object} key - プライマリキー
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object>} - 更新結果
   */
  async updateItem(tableName, key, updates) {
    // 更新式を動的に構築
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updates).forEach((field, index) => {
      const placeholder = `#field${index}`;
      const valuePlaceholder = `:value${index}`;
      
      updateExpression.push(`${placeholder} = ${valuePlaceholder}`);
      expressionAttributeNames[placeholder] = field;
      expressionAttributeValues[valuePlaceholder] = updates[field];
    });

    const params = {
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    try {
      this.logger.debug('DynamoDB updateItem', { tableName, key, updates });
      const result = await this.docClient.send(new UpdateCommand(params));
      this.logger.info('Item updated successfully', { tableName, key });
      return result.Attributes;
    } catch (error) {
      this.logger.error('Failed to update item in DynamoDB', error);
      throw error;
    }
  }

  /**
   * クエリ実行
   * @param {string} tableName - テーブル名
   * @param {Object} queryParams - クエリパラメータ
   * @returns {Promise<Array>} - クエリ結果
   */
  async query(tableName, queryParams) {
    const params = {
      TableName: tableName,
      ...queryParams
    };

    try {
      this.logger.debug('DynamoDB query', { tableName, queryParams });
      const result = await this.docClient.send(new QueryCommand(params));
      this.logger.info('Query executed successfully', { 
        tableName, 
        itemCount: result.Items?.length || 0 
      });
      return result.Items || [];
    } catch (error) {
      this.logger.error('Failed to query DynamoDB', error);
      throw error;
    }
  }

  /**
   * バッチ書き込み（複数アイテムの一括保存）
   * @param {string} tableName - テーブル名
   * @param {Array} items - 保存するアイテムの配列
   * @returns {Promise<Object>} - 保存結果
   */
  async batchWrite(tableName, items) {
    // 25個ずつのバッチに分割（DynamoDBの制限）
    const chunks = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }

    const results = [];
    for (const chunk of chunks) {
      const params = {
        RequestItems: {
          [tableName]: chunk.map(item => ({
            PutRequest: { Item: item }
          }))
        }
      };

      try {
        const result = await this.docClient.send(new BatchWriteCommand(params));
        results.push(result);
      } catch (error) {
        this.logger.error('Batch write failed', error);
        throw error;
      }
    }

    this.logger.info('Batch write completed', { 
      tableName, 
      totalItems: items.length,
      batches: chunks.length 
    });
    return results;
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new DynamoDBManager();