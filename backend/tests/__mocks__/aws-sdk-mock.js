// AWS SDK Mock for testing
module.exports = {
  TranscribeStreamingClient: jest.fn(() => ({
    send: jest.fn()
  })),
  StartStreamTranscriptionCommand: jest.fn(),
  
  BedrockRuntimeClient: jest.fn(() => ({
    send: jest.fn()
  })),
  InvokeModelCommand: jest.fn(),
  
  DynamoDBClient: jest.fn(() => ({
    send: jest.fn()
  })),
  PutItemCommand: jest.fn(),
  
  ApiGatewayManagementApiClient: jest.fn(() => ({
    send: jest.fn()
  })),
  PostToConnectionCommand: jest.fn(),
  
  S3Client: jest.fn(() => ({
    send: jest.fn()
  })),
  PutObjectCommand: jest.fn()
};