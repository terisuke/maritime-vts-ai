/**
 * Amazon Transcribe カスタム語彙作成スクリプト
 * 福岡港湾と海事用語の語彙を登録
 */

const { TranscribeClient, CreateVocabularyCommand, GetVocabularyCommand, DeleteVocabularyCommand } = require('@aws-sdk/client-transcribe');
const fs = require('fs').promises;

const client = new TranscribeClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

/**
 * 福岡港湾・海事用語のカスタム語彙
 * 注：日本語のカスタム語彙では、CreateVocabularyコマンドで簡易的なフレーズリストを使用できない場合があるため、
 * テーブル形式のファイルをS3にアップロードする方法を推奨しますが、ここではAPI経由での登録を試みます。
 */
const vocabularyPhrases = [
  // 福岡の港湾・地名（英数字も含めてシンプルに）
  'ハカタコウ',
  'キタキュウシュウコウ',
  'モジコウ',
  'カンモンカイキョウ',
  'ゲンカイナダ',
  'ヒビキナダ',
  'ドウカイワン',
  'ハカタワン',
  
  // 海事用語（英語・アルファベット）
  'VTS',
  'AIS',
  'VHF',
  'SOLAS',
  'IMO',
  'MARPOL',
  'ETA',
  'ETD',
  'LOA',
  'DWT',
  'GT',
  'TEU',
  'FEU',
  'IMDG',
  'LNG',
  'RORO',
  
  // 海事用語（カタカナ）
  'パイロット',
  'タグボート',
  'ノット',
  'メーデー',
  'パンパン',
  'セキュリテ',
  'コンテナ',
  'タンカー',
  'フェリー',
  'クルーズ',
  'オーバー'
];

/**
 * カスタム語彙を作成
 */
async function createFukuokaVocabulary() {
  const vocabularyName = 'maritime-vts-vocabulary-ja';
  
  console.log('📝 カスタム語彙を作成中...');
  console.log(`   語彙名: ${vocabularyName}`);
  console.log(`   フレーズ数: ${vocabularyPhrases.length}`);

  try {
    // 既存の語彙を確認
    try {
      const getCommand = new GetVocabularyCommand({ VocabularyName: vocabularyName });
      const existingVocabulary = await client.send(getCommand);
      
      console.log('⚠️  既存の語彙が見つかりました');
      console.log(`   状態: ${existingVocabulary.VocabularyState}`);
      
      // 既存の語彙を削除するか確認
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('既存の語彙を削除して新規作成しますか? (y/n): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() === 'y') {
        console.log('🗑️  既存の語彙を削除中...');
        const deleteCommand = new DeleteVocabularyCommand({ VocabularyName: vocabularyName });
        await client.send(deleteCommand);
        
        // 削除が完了するまで待機
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('✅ 削除完了');
      } else {
        console.log('ℹ️  既存の語彙を保持します');
        return;
      }
    } catch (error) {
      if (error.name !== 'NotFoundException') {
        throw error;
      }
      // 語彙が存在しない場合は続行
    }

    // カスタム語彙を作成
    const createCommand = new CreateVocabularyCommand({
      VocabularyName: vocabularyName,
      LanguageCode: 'ja-JP',
      Phrases: vocabularyPhrases
    });

    const response = await client.send(createCommand);
    
    console.log('✅ カスタム語彙の作成を開始しました');
    console.log(`   語彙名: ${response.VocabularyName}`);
    console.log(`   状態: ${response.VocabularyState}`);
    console.log(`   言語: ${response.LanguageCode}`);
    
    // 作成状態を確認
    console.log('\n⏳ 語彙の作成状態を確認中...');
    
    let attempts = 0;
    const maxAttempts = 30; // 最大5分待機
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒待機
      
      const getCommand = new GetVocabularyCommand({ VocabularyName: vocabularyName });
      const vocabulary = await client.send(getCommand);
      
      console.log(`   状態: ${vocabulary.VocabularyState} (${attempts + 1}/${maxAttempts})`);
      
      if (vocabulary.VocabularyState === 'READY') {
        console.log('\n🎉 カスタム語彙の作成が完了しました！');
        console.log(`   語彙名: ${vocabulary.VocabularyName}`);
        console.log(`   最終更新: ${vocabulary.LastModifiedTime}`);
        break;
      } else if (vocabulary.VocabularyState === 'FAILED') {
        console.error('❌ カスタム語彙の作成に失敗しました');
        console.error(`   失敗理由: ${vocabulary.FailureReason}`);
        process.exit(1);
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('⚠️  タイムアウト: 語彙の作成に時間がかかっています');
      console.log('   AWS コンソールで状態を確認してください');
    }

    // 語彙リストをファイルに保存
    const vocabularyData = {
      name: vocabularyName,
      languageCode: 'ja-JP',
      phrases: vocabularyPhrases,
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      'vocabulary-backup.json',
      JSON.stringify(vocabularyData, null, 2)
    );
    
    console.log('\n📁 語彙リストをvocabulary-backup.jsonに保存しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    
    if (error.name === 'ConflictException') {
      console.log('ℹ️  語彙が既に存在します。削除してから再実行してください。');
    } else if (error.name === 'BadRequestException') {
      console.log('ℹ️  リクエストが無効です。語彙の内容を確認してください。');
    } else if (error.name === 'LimitExceededException') {
      console.log('ℹ️  API制限に達しました。しばらく待ってから再実行してください。');
    }
    
    process.exit(1);
  }
}

// 環境変数の確認
if (!process.env.AWS_REGION) {
  console.log('ℹ️  AWS_REGIONが設定されていません。ap-northeast-1を使用します。');
}

// スクリプト実行
console.log('🚢 福岡港湾VTSカスタム語彙作成スクリプト');
console.log('=====================================\n');

createFukuokaVocabulary().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});