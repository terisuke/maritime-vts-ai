/**
 * カスタム語彙の状態確認スクリプト
 */

const { TranscribeClient, GetVocabularyCommand, ListVocabulariesCommand } = require('@aws-sdk/client-transcribe');

const client = new TranscribeClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

/**
 * 特定の語彙の詳細を取得
 */
async function checkVocabulary(vocabularyName) {
  try {
    const command = new GetVocabularyCommand({ VocabularyName: vocabularyName });
    const vocabulary = await client.send(command);
    
    console.log('\n📋 語彙の詳細情報:');
    console.log(`   名前: ${vocabulary.VocabularyName}`);
    console.log(`   状態: ${vocabulary.VocabularyState}`);
    console.log(`   言語: ${vocabulary.LanguageCode}`);
    console.log(`   最終更新: ${vocabulary.LastModifiedTime}`);
    
    if (vocabulary.FailureReason) {
      console.log(`   ❌ 失敗理由: ${vocabulary.FailureReason}`);
    }
    
    if (vocabulary.DownloadUri) {
      console.log(`   📥 ダウンロードURI: ${vocabulary.DownloadUri}`);
    }
    
    return vocabulary;
    
  } catch (error) {
    if (error.name === 'NotFoundException') {
      console.log(`❌ 語彙 "${vocabularyName}" が見つかりません`);
    } else {
      console.error('❌ エラー:', error.message);
    }
    return null;
  }
}

/**
 * 全ての語彙をリスト表示
 */
async function listAllVocabularies() {
  try {
    const command = new ListVocabulariesCommand({
      MaxResults: 100,
      StateEquals: undefined // 全ての状態を取得
    });
    
    const response = await client.send(command);
    
    if (response.Vocabularies && response.Vocabularies.length > 0) {
      console.log('\n📚 登録済みのカスタム語彙一覧:');
      console.log('================================');
      
      response.Vocabularies.forEach((vocab, index) => {
        console.log(`\n${index + 1}. ${vocab.VocabularyName}`);
        console.log(`   状態: ${vocab.VocabularyState}`);
        console.log(`   言語: ${vocab.LanguageCode}`);
        console.log(`   最終更新: ${vocab.LastModifiedTime}`);
      });
      
      console.log(`\n合計: ${response.Vocabularies.length} 個の語彙`);
    } else {
      console.log('\nℹ️ カスタム語彙が登録されていません');
    }
    
  } catch (error) {
    console.error('❌ 語彙リストの取得に失敗しました:', error.message);
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('🔍 Amazon Transcribe カスタム語彙確認ツール');
  console.log('=========================================\n');
  
  // コマンドライン引数を取得
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] !== 'list') {
    // 特定の語彙を確認
    const vocabularyName = args[0];
    console.log(`🔎 語彙 "${vocabularyName}" を確認中...`);
    await checkVocabulary(vocabularyName);
  } else {
    // 全ての語彙をリスト表示
    await listAllVocabularies();
    
    // VTS用語彙の詳細も表示
    console.log('\n🔎 VTS語彙の詳細確認...');
    await checkVocabulary('maritime-vts-vocabulary-ja');
  }
}

// 使用方法の表示
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('使用方法:');
  console.log('  node check-vocabulary.js              # 全ての語彙をリスト表示');
  console.log('  node check-vocabulary.js list         # 全ての語彙をリスト表示');
  console.log('  node check-vocabulary.js <語彙名>     # 特定の語彙の詳細を表示');
  console.log('  node check-vocabulary.js --help       # ヘルプを表示');
  process.exit(0);
}

// スクリプト実行
main().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});