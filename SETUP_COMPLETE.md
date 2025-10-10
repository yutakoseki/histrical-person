# セットアップ完了サマリー

## ✅ 完了した作業

### 1. 開発環境のセットアップ
- ✅ Python仮想環境の作成 (`.venv`)
- ✅ pytest, ruff, black のインストール
- ✅ `make test` の実行確認（全7テスト成功）

### 2. Lambda Layer の準備
- ✅ `layers/ffmpeg/` ディレクトリ構造の作成
- ✅ `layers/fonts/` ディレクトリ構造の作成
- ✅ READMEファイルの作成（セットアップ手順付き）

### 3. 環境設定
- ✅ `.env.sample` の作成
- ✅ `.env` の作成（AWSアカウントID: 938360562433）

### 4. 依存関係のインストール
- ✅ `pnpm install --recursive` の実行

### 5. CDK デプロイ
- ✅ `pnpm cdk bootstrap` の実行
- ✅ `pnpm cdk deploy` の実行（Lambda memorySize問題を修正）
- ✅ スタックのデプロイ成功

### 6. DynamoDB 初期データ投入
- ✅ 10人の歴史的人物データを投入
  - 織田信長、豊臣秀吉、徳川家康、坂本龍馬、西郷隆盛
  - 伊達政宗、武田信玄、上杉謙信、真田幸村、源義経

## 📊 デプロイされたリソース

### DynamoDB テーブル
- `figures` - 人物データ（10件投入済み）
- `sayings` - 格言データ

### S3 バケット
- `histricalpersonstack-artifactsbucket2aac5544-7he0t3nctpwx`

### Lambda 関数
1. **SelectAndLockFigure** - 人物を選択してロック
2. **GenerateSnippets** - 格言を生成（30個）
3. **RenderAudioVideo** - 音声と動画をレンダリング
4. **UploadYoutube** - YouTubeにアップロード
5. **LockAutoRelease** - ロックを自動解放

### Lambda Layer
1. **FfmpegLayer** - ffmpeg/ffprobeバイナリ
2. **FontsLayer** - フォントとデフォルト画像

### EventBridge ルール
1. **SelectFigureRule** - 毎日0:00 UTC（有効）
2. **LockAutoReleaseRule** - 1時間ごと（有効）
3. **RenderVideoRule** - 毎日1:30 UTC（**無効**）

## ⚠️ 残作業

### 1. Lambda Layer ファイルの配置

#### FFmpegバイナリ
```bash
cd /develop/project/histrical-person/layers/ffmpeg/bin

# 静的リンク版ffmpegをダウンロード
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xf ffmpeg-release-amd64-static.tar.xz
mv ffmpeg-*-static/ffmpeg .
mv ffmpeg-*-static/ffprobe .
rm -rf ffmpeg-*-static*
chmod +x ffmpeg ffprobe

# 動作確認
./ffmpeg -version
./ffprobe -version
```

#### フォントとデフォルト画像
```bash
cd /develop/project/histrical-person/layers/fonts

# 日本語フォントをダウンロード
cd fonts
wget https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf

# デフォルト画像を配置（640x1920推奨）
cd ..
# 方法1: 既存画像をコピー
cp /path/to/portrait.jpg default.jpg

# 方法2: Pythonで黒背景を作成
python3 << 'EOF'
from PIL import Image
img = Image.new('RGB', (640, 1920), color='black')
img.save('default.jpg')
EOF
```

**⚠️ 重要**: Lambda Layerファイルを配置した後は、再デプロイが必要です：
```bash
cd /develop/project/histrical-person/cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never
```

### 2. 環境変数の設定

`.env` ファイルを編集して実際の値を設定してください：

```bash
# OpenAI API Key（必須）
OPENAI_API_KEY=sk-proj-your-actual-api-key

# YouTube API設定（YouTubeアップロード機能を使う場合）
YT_CLIENT_ID=your-client-id.apps.googleusercontent.com
YT_CLIENT_SECRET=GOCSPX-your-client-secret
YT_REFRESH_TOKEN=1//your-refresh-token
```

設定後は再デプロイが必要です。

### 3. EventBridge ルールの有効化（オプション）

必要に応じて `RenderVideoRule` を有効化：

```bash
export AWS_PROFILE=histrical

# ルール名を取得
RULE_NAME=$(aws events list-rules --query 'Rules[?contains(Name, `RenderVideoRule`)].Name' --output text)

# ルールを有効化
aws events enable-rule --name $RULE_NAME

echo "RenderVideoRule を有効化しました"
```

## 🚀 動作確認

### 1. Lambda関数の手動実行

```bash
export AWS_PROFILE=histrical

# SelectAndLockFigure を手動実行
FUNCTION_NAME=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `SelectAndLockFigure`)].FunctionName' --output text)
aws lambda invoke --function-name $FUNCTION_NAME --payload '{}' response.json
cat response.json
```

### 2. CloudWatch Logs で監視

```bash
# SelectAndLockFigure のログ
aws logs tail /aws/lambda/$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `SelectAndLockFigure`)].FunctionName' --output text) --follow

# GenerateSnippets のログ
aws logs tail /aws/lambda/$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `GenerateSnippets`)].FunctionName' --output text) --follow
```

### 3. DynamoDB データ確認

```bash
# figures テーブルをスキャン
aws dynamodb scan --table-name figures --max-items 10

# 特定の人物の格言を確認
aws dynamodb query \
  --table-name sayings \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"figure#001"}}'
```

## 📝 運用フロー

1. **毎日0:00 UTC（9:00 JST）**: SelectAndLockFigure が実行され、ランダムな人物を選択
2. **自動連鎖**: GenerateSnippets が実行され、30個の格言を生成（OpenAI API使用）
3. **毎日1:30 UTC（10:30 JST）**: RenderVideoRule（有効化した場合）が RenderAudioVideo を実行
4. **自動連鎖**: 動画生成完了後、UploadYoutube が自動実行（YouTube API設定済みの場合）
5. **1時間ごと**: LockAutoRelease がタイムアウトしたロックを解放

## 🔧 トラブルシューティング

### Lambda関数がタイムアウトする
- メモリサイズを増やす（最大3008 MB）
- タイムアウト時間を延長する
- CloudWatch Logs でエラーを確認

### OpenAI APIエラー
- API Keyが正しいか確認
- 課金設定が有効か確認
- レート制限に達していないか確認

### YouTube APIエラー
- OAuth2.0 Refresh Tokenが有効か確認
- YouTube Data API v3が有効化されているか確認
- スコープに `https://www.googleapis.com/auth/youtube.upload` が含まれるか確認

## 📚 参考資料

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 詳細なデプロイ手順
- [layers/ffmpeg/README.md](./layers/ffmpeg/README.md) - FFmpeg Layerのセットアップ
- [layers/fonts/README.md](./layers/fonts/README.md) - Fonts Layerのセットアップ

## 🎉 完了

上記の残作業を完了すれば、システムは完全に運用可能です！

