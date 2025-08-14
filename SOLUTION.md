# 推奨ソリューション: シンプルな実装への移行

## 方法1: AWS Amplify Predictionsを使った簡単な実装

### セットアップ
```bash
# 新しいプロジェクトフォルダ
mkdir vts-amplify && cd vts-amplify

# Reactアプリ作成
npx create-react-app . --template typescript

# Amplify CLI インストール
npm install -g @aws-amplify/cli

# Amplify初期化
amplify init

# Predictions（文字起こし）追加
amplify add predictions
# ? Please select from one of the categories below: Convert
# ? What would you like to convert? Transcribe text from audio
# ? Provide a friendly name for your resource: transcription
# ? What is the source language? Japanese
# ? Who should have access? Auth and Guest users

# バックエンドをデプロイ
amplify push
```

### フロントエンド実装（超シンプル）
```typescript
// App.tsx
import { Amplify, Predictions } from 'aws-amplify';
import { AmazonAIPredictionsProvider } from '@aws-amplify/predictions';
import awsconfig from './aws-exports';
import mic from 'microphone-stream';

Amplify.configure(awsconfig);
Amplify.addPluggable(new AmazonAIPredictionsProvider());

function App() {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const micStreamRef = useRef<any>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = new mic();
    micStreamRef.current.setStream(stream);
    
    micStreamRef.current.on('data', (buffer: Buffer) => {
      Predictions.convert({
        transcription: {
          source: { bytes: buffer },
          language: "ja-JP"
        }
      }).then(({ transcription: { fullText } }) => {
        setTranscript(prev => prev + ' ' + fullText);
      });
    });
    
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (micStreamRef.current) {
      micStreamRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? '停止' : '録音開始'}
      </button>
      <div>{transcript}</div>
    </div>
  );
}
```

## 方法2: Amazon Transcribe WebSocket直接接続

### 実装例
```typescript
// transcribe-client.ts
import { 
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand 
} from "@aws-sdk/client-transcribe-streaming";

class TranscribeClient {
  private client: TranscribeStreamingClient;
  
  constructor() {
    this.client = new TranscribeStreamingClient({
      region: "ap-northeast-1",
      credentials: {
        accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY!,
        secretAccessKey: process.env.REACT_APP_AWS_SECRET_KEY!
      }
    });
  }

  async startTranscription(audioStream: ReadableStream) {
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "ja-JP",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: this.createAudioGenerator(audioStream)
    });

    const response = await this.client.send(command);
    
    // 結果を処理
    for await (const event of response.TranscriptResultStream!) {
      if (event.TranscriptEvent) {
        const message = event.TranscriptEvent.Transcript?.Results?.[0]
          ?.Alternatives?.[0]?.Transcript;
        if (message) {
          console.log("Transcript:", message);
        }
      }
    }
  }

  private async *createAudioGenerator(stream: ReadableStream) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield { AudioEvent: { AudioChunk: value } };
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

## 方法3: シンプルなREST API方式（最も簡単）

### バックエンド（Lambda）
```javascript
// lambda/transcribe-audio.js
const { TranscribeClient, StartTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

exports.handler = async (event) => {
  const audioData = Buffer.from(event.body, 'base64');
  const fileName = `audio-${Date.now()}.wav`;
  
  // S3に保存
  const s3 = new S3Client();
  await s3.send(new PutObjectCommand({
    Bucket: 'your-audio-bucket',
    Key: fileName,
    Body: audioData
  }));
  
  // Transcribeジョブ開始
  const transcribe = new TranscribeClient();
  const jobName = `job-${Date.now()}`;
  
  await transcribe.send(new StartTranscriptionJobCommand({
    TranscriptionJobName: jobName,
    LanguageCode: 'ja-JP',
    Media: {
      MediaFileUri: `s3://your-audio-bucket/${fileName}`
    },
    OutputBucketName: 'your-output-bucket'
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ jobName })
  };
};
```

### フロントエンド
```typescript
// Simple REST API call
const recordAndTranscribe = async () => {
  // MediaRecorder APIで録音
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  
  recorder.ondataavailable = (e) => chunks.push(e.data);
  
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/wav' });
    const base64 = await blobToBase64(blob);
    
    // Lambda関数を呼び出し
    const response = await fetch('https://your-api.execute-api.amazonaws.com/prod/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audio: base64 })
    });
    
    const { jobName } = await response.json();
    console.log('Transcription job started:', jobName);
  };
  
  recorder.start();
  setTimeout(() => recorder.stop(), 5000); // 5秒録音
};
```

## 比較表

| 方式 | 複雑度 | リアルタイム性 | コスト | 信頼性 |
|-----|-------|------------|--------|--------|
| Amplify Predictions | ★☆☆ | ★★★ | $$ | ★★★ |
| Transcribe直接接続 | ★★☆ | ★★★ | $ | ★★☆ |
| REST API方式 | ★☆☆ | ★☆☆ | $ | ★★★ |
| 現在のシステム | ★★★ | ★★☆ | $$ | ★☆☆ |

## 推奨事項

### 海上管制用途の場合
**Amazon Chime SDK** または **Amazon Connect**の採用を強く推奨

理由：
- 音声品質の保証
- 録音機能の内蔵
- コンプライアンス対応
- エンタープライズサポート

### プロトタイプの場合
**Amplify Predictions**で迅速に実装

理由：
- 1日で実装可能
- AWSのベストプラクティス
- スケーラブル
- 管理が容易

## 実装にかかる時間

- Amplify Predictions: **1-2日**
- Transcribe直接接続: **3-5日**
- REST API方式: **1日**
- 現在のシステム修正: **不明（1週間以上？）**

## 結論

現在のシステムの修正に時間をかけるより、**Amplify Predictions**で新規実装することを強く推奨します。

理由：
1. 実装が圧倒的に簡単
2. AWSの公式サポート
3. 文字起こし以外の機能（翻訳、感情分析）も簡単に追加可能
4. メンテナンスコストが低い