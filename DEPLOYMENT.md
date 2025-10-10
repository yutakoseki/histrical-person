# デプロイ手順

このドキュメントでは、histrical-personプロジェクトのデプロイ手順を説明します。

## 前提条件

- [x] pytest, ruff, black のインストール完了
- [x] `make test` が成功することを確認済み
- [ ] Lambda Layer用のファイル配置
- [ ] `.env` ファイルの設定
- [ ] AWS認証情報の設定

## 1. Lambda Layer用ファイルの配置

### 1.1 FFmpegバイナリの配置

```bash
cd layers/ffmpeg/bin

# johnvansickle.comから静的リンク版ffmpegをダウンロード
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xf ffmpeg-release-amd64-static.tar.xz
mv ffmpeg-*-static/ffmpeg .
mv ffmpeg-*-static/ffprobe .
rm -rf ffmpeg-*-static*

# 実行権限を付与
chmod +x ffmpeg ffprobe

# 動作確認
./ffmpeg -version
./ffprobe -version

cd ../../..
```

### 1.2 フォントとデフォルト画像の配置

```bash
cd layers/fonts/fonts

# Noto Sans CJK JPフォントをダウンロード
wget https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf

cd ..

# デフォルト画像を配置（640x1920推奨）
# 方法1: 既存の画像をコピー
cp /path/to/your/portrait.jpg default.jpg

# 方法2: ImageMagickで黒背景を作成
convert -size 640x1920 xc:black default.jpg

# 方法3: Pythonで作成
python3 << 'EOF'
from PIL import Image
img = Image.new('RGB', (640, 1920), color='black')
img.save('default.jpg')
EOF

cd ../..
```

## 2. 環境変数の設定

`.env` ファイルを編集して、実際の値を設定します：

```bash
# エディタで.envを開く
nano .env  # または vim .env
```

必須の設定項目：

```bash
# OpenAI API Key (https://platform.openai.com/api-keys から取得)
OPENAI_API_KEY=sk-proj-your-actual-api-key

# AWS設定（aws sts get-caller-identity で確認可能）
AWS_ACCOUNT_ID=123456789012  # あなたのAWSアカウントID
AWS_REGION=ap-northeast-1     # デプロイするリージョン
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=ap-northeast-1

# YouTube API設定（必要な場合）
# https://console.cloud.google.com/apis/credentials でOAuth2.0クライアントを作成
YT_CLIENT_ID=your-client-id.apps.googleusercontent.com
YT_CLIENT_SECRET=GOCSPX-your-client-secret
YT_REFRESH_TOKEN=1//your-refresh-token
```

オプション設定（デフォルト値で問題なければ変更不要）：

```bash
OPENAI_COMPLETION_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
OPENAI_TTS_FORMAT=mp3
LOCK_MINUTES=60
```

## 3. AWS認証情報の設定

AWS CLIの認証情報を設定します：

```bash
# AWS CLIの設定
aws configure

# または環境変数で設定
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=ap-northeast-1

# 認証確認
aws sts get-caller-identity
```

## 4. CDK Bootstrap

初回デプロイ時のみ、CDK Bootstrapを実行します：

```bash
pnpm cdk bootstrap
# または
make bootstrap
```

これにより、CDKが使用するS3バケットやIAMロールなどのリソースが作成されます。

## 5. デプロイ

```bash
pnpm cdk deploy
# または
make deploy
```

デプロイには数分かかります。完了すると、以下のリソースが作成されます：

- DynamoDB テーブル: `figures`, `sayings`
- S3 バケット: `histrical-person-artifacts-*`
- Lambda 関数: 5つ（GenerateSnippets, SelectAndLockFigure, RenderAudioVideo, UploadYoutube, LockAutoRelease）
- Lambda Layer: 2つ（ffmpeg, fonts）
- EventBridge ルール: 3つ（デフォルトで無効）

## 6. EventBridge ルールの有効化

デプロイ後、必要に応じてEventBridgeルールを有効化します：

```bash
# AWSコンソールで手動有効化
# または AWS CLIで有効化

# 1. SelectAndLock を毎日実行（例: 毎日10:00 JST）
aws events enable-rule --name histrical-person-daily-select

# 2. LockAutoRelease を1時間ごとに実行
aws events enable-rule --name histrical-person-hourly-release

# 3. RenderAudioVideo の連鎖トリガー（GenerateSnippets完了後）
# これはLambda Destinationで自動設定されているため手動設定不要
```

## 7. DynamoDB初期データの投入

`figures` テーブルに初期データを投入します：

```bash
# AWS CLIで投入
aws dynamodb put-item \
  --table-name figures \
  --item '{
    "pk": {"S": "figure#001"},
    "name": {"S": "織田信長"},
    "status": {"S": "ready"},
    "bio": {"S": "戦国時代の武将。天下統一を目指した。"},
    "portraitS3Key": {"S": "portraits/oda-nobunaga.jpg"}
  }'

# または Python スクリプトで投入
python3 << 'EOF'
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('figures')

figures = [
    {
        'pk': 'figure#001',
        'name': '織田信長',
        'status': 'ready',
        'bio': '戦国時代の武将。天下統一を目指した。',
    },
    {
        'pk': 'figure#002',
        'name': '豊臣秀吉',
        'status': 'ready',
        'bio': '戦国時代から安土桃山時代の武将。',
    },
    {
        'pk': 'figure#003',
        'name': '徳川家康',
        'status': 'ready',
        'bio': '江戸幕府の初代征夷大将軍。',
    },
]

for figure in figures:
    table.put_item(Item=figure)
    print(f"Added: {figure['name']}")
EOF
```

## 8. 動作確認

### 8.1 CloudWatch Logsで監視

```bash
# SelectAndLockFigure のログを確認
aws logs tail /aws/lambda/HistricalPersonStack-SelectAndLockFigure --follow

# GenerateSnippets のログを確認
aws logs tail /aws/lambda/HistricalPersonStack-GenerateSnippets --follow
```

### 8.2 手動でLambdaを実行

```bash
# SelectAndLockFigure を手動実行
aws lambda invoke \
  --function-name HistricalPersonStack-SelectAndLockFigure \
  --payload '{}' \
  response.json

cat response.json
```

### 8.3 DynamoDBの状態を確認

```bash
# figures テーブルをスキャン
aws dynamodb scan --table-name figures --max-items 10

# sayings テーブルを確認（特定のfigureの格言）
aws dynamodb query \
  --table-name sayings \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"figure#001"}}'
```

## トラブルシューティング

### Lambda Layerのサイズエラー

もしLayerのサイズが大きすぎる場合は、不要なファイルを削除してください：

```bash
# ffmpegのドキュメントなどを削除
cd layers/ffmpeg/bin
strip ffmpeg ffprobe  # バイナリをstrip
```

### OpenAI APIエラー

- API Keyが正しいか確認
- 課金設定が有効か確認
- レート制限に達していないか確認

### YouTube API エラー

- OAuth2.0のRefresh Tokenが有効か確認
- YouTube Data API v3が有効化されているか確認
- スコープが `https://www.googleapis.com/auth/youtube.upload` を含むか確認

## クリーンアップ

全リソースを削除する場合：

```bash
pnpm cdk destroy
# または
make destroy
```

⚠️ 注意: DynamoDBテーブルは `RETAIN` ポリシーのため、手動で削除する必要があります。

## 運用開始

上記の手順が完了すれば、システムは以下のように動作します：

1. **毎日定時**: SelectAndLockFigure が実行され、ランダムな人物を選択
2. **自動連鎖**: GenerateSnippets が実行され、30個の格言を生成
3. **手動トリガー**: 必要に応じて RenderAudioVideo を実行して動画を生成
4. **手動トリガー**: UploadYoutube で YouTube にアップロード
5. **自動解放**: 1時間ごとに LockAutoRelease が実行され、タイムアウトしたロックを解放

CloudWatch Logs を監視して、各Lambda関数が正常に動作していることを確認してください。


