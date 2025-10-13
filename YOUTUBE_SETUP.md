# YouTube自動アップロード設定ガイド

## 概要

このシステムは、EventBridgeのスケジュールに従って自動的に：
1. 人物を選択
2. 名言を生成
3. 動画を作成
4. YouTubeにアップロード

を実行します。

## 事前準備（人間が行うこと）

### 1. 人物の肖像画を配置

```bash
# ディレクトリ作成
mkdir -p portraits

# 肖像画を配置（jpg/png/webp対応）
# 例: portraits/織田信長.jpg
# 例: portraits/坂本龍馬.png
```

**アップロード:**
```bash
./scripts/upload_portraits.sh
```

### 2. YouTubeサムネイルを配置

```bash
# ディレクトリ作成
mkdir -p thumbnails

# サムネイルを配置（{人物名}_サムネ.png）
# 例: thumbnails/織田信長_サムネ.png
# 例: thumbnails/坂本龍馬_サムネ.png
```

**推奨サイズ:** 1280x720 (YouTube推奨)

**アップロード:**
```bash
./scripts/upload_thumbnails.sh
```

### 3. YouTubeタイトルを設定

各人物ごとにYouTubeタイトルをDynamoDBに設定します：

```bash
# 使い方
./scripts/set_youtube_title.sh <人物名> <YouTubeタイトル>

# 例
./scripts/set_youtube_title.sh 織田信長 '【織田信長の名言】天下統一への道 #shorts'
./scripts/set_youtube_title.sh 坂本龍馬 '【坂本龍馬】幕末の志士が残した名言集 #shorts'
./scripts/set_youtube_title.sh 徳川家康 '【徳川家康の名言】江戸幕府を築いた英知 #shorts'
```

**タイトル設定のベストプラクティス:**
- `#shorts` タグを含める（YouTube Shorts用）
- 人物名を含める
- 50文字以内推奨
- 魅力的で検索されやすいキーワードを含める

## 自動生成される内容

### 概要欄（固定テンプレート）

```
この動画では、歴史上の偉人が残した名言をご紹介します。

🎯 この動画について
先人の知恵から学び、現代に活かすヒントを見つけてください。

📚 チャンネル登録・高評価もよろしくお願いします！

#shorts #歴史 #名言 #偉人 #{人物名}
```

### タグ（固定 + 人物名）

- 歴史
- 名言
- 偉人
- 日本史
- shorts
- 名言集
- {人物名}（動的に追加）

## デプロイ

Lambda関数を更新してデプロイ：

```bash
cd cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never
```

## EventBridgeスケジュール

### SelectFigureRule（自動実行）
- **スケジュール:** 毎日 00:00 UTC (09:00 JST)
- **処理:** 人物を選択 → 名言生成 → 動画作成 → YouTubeアップロード

### LockAutoReleaseRule（自動実行）
- **スケジュール:** 1時間ごと
- **処理:** 長時間ロックされた人物を自動解放

### RenderVideoRule（手動有効化が必要）
- **スケジュール:** 毎日 01:30 UTC (10:30 JST)
- **処理:** 動画レンダリングのみ
- **デフォルト:** 無効（必要に応じて有効化）

## 手動テスト

### 全体フローのテスト

```bash
export AWS_PROFILE=histrical

# 1. 人物をavailableに設定
aws dynamodb update-item \
    --table-name figures \
    --key '{"pk":{"S":"figure#001"}}' \
    --update-expression "SET #status = :status" \
    --expression-attribute-names '{"#status":"status"}' \
    --expression-attribute-values '{":status":{"S":"available"}}'

# 2. SelectAndLockFigureを実行（全体フロー開始）
aws lambda invoke \
    --function-name HistricalPersonStack-SelectAndLockFigure9D5F80DC-uNXrV6pP6wIw \
    --invocation-type Event \
    response.json

# 3. ログ監視
aws logs tail /aws/lambda/HistricalPersonStack-SelectAndLockFigure9D5F80DC-uNXrV6pP6wIw --follow
aws logs tail /aws/lambda/HistricalPersonStack-GenerateSnippets* --follow
aws logs tail /aws/lambda/HistricalPersonStack-RenderAudioVideo* --follow
aws logs tail /aws/lambda/HistricalPersonStack-UploadYoutube* --follow
```

### YouTubeアップロードのみテスト

```bash
printf '{"figurePk":"figure#001","name":"織田信長"}' | \
aws lambda invoke \
    --function-name HistricalPersonStack-UploadYoutube415510E3-dPntebXqGNNH \
    --invocation-type Event \
    --cli-binary-format raw-in-base64-out \
    --payload file:///dev/stdin \
    response.json
```

## トラブルシューティング

### サムネイルがアップロードされない

1. S3バケットにファイルが存在するか確認：
```bash
aws s3 ls s3://histrical-person-thumbnails/
```

2. ファイル名が正しいか確認：
   - 正: `織田信長_サムネ.png`
   - 誤: `織田信長.png`

### YouTubeタイトルが設定されていないエラー

```bash
# エラー: youtubeTitle not set for 織田信長
./scripts/set_youtube_title.sh 織田信長 '【織田信長の名言】天下統一への道 #shorts'
```

### YouTubeアップロードが401エラー

1. リフレッシュトークンが有効か確認
2. YouTubeチャンネルが作成されているか確認
3. OAuth 2.0スコープに `youtube.upload` が含まれているか確認

## ディレクトリ構造

```
/develop/project/histrical-person/
├── portraits/              # 人物の肖像画（jpg/png/webp）
│   ├── 織田信長.jpg
│   └── 坂本龍馬.png
├── thumbnails/             # YouTubeサムネイル（png）
│   ├── 織田信長_サムネ.png
│   └── 坂本龍馬_サムネ.png
└── scripts/
    ├── upload_portraits.sh      # 肖像画アップロード
    ├── upload_thumbnails.sh     # サムネイルアップロード
    └── set_youtube_title.sh     # YouTubeタイトル設定
```

## S3バケット構造

```
histricalpersonstack-artifactsbucket2aac5544-7he0t3nctpwx/
├── portraits/              # 肖像画
│   ├── 織田信長.jpg
│   └── 坂本龍馬.png
├── out/                    # 生成された動画
│   └── 織田信長/
│       └── final.mp4
└── bgm/                    # BGM
    └── bgm.mp3

histrical-person-thumbnails/
├── 織田信長_サムネ.png
└── 坂本龍馬_サムネ.png
```

## DynamoDBスキーマ

### figures テーブル

```json
{
  "pk": "figure#001",
  "name": "織田信長",
  "status": "available",
  "youtubeTitle": "【織田信長の名言】天下統一への道 #shorts",
  "video": {
    "s3Key": "out/織田信長/final.mp4",
    "youtubeId": "XUcbLrHLjV0",
    "durationMs": 180000,
    "updatedAt": 1697234567890
  }
}
```

## 運用フロー

1. **初回セットアップ**
   - 肖像画を配置 → `upload_portraits.sh`
   - サムネイルを配置 → `upload_thumbnails.sh`
   - YouTubeタイトル設定 → `set_youtube_title.sh`
   - CDKデプロイ

2. **日次運用（自動）**
   - 毎日09:00 JST: EventBridgeが自動実行
   - SelectAndLockFigure → GenerateSnippets → RenderAudioVideo → UploadYoutube
   - YouTubeに動画が自動投稿される

3. **新しい人物を追加**
   - DynamoDBに人物データを追加
   - 肖像画を配置 → `upload_portraits.sh`
   - サムネイルを配置 → `upload_thumbnails.sh`
   - YouTubeタイトル設定 → `set_youtube_title.sh`
   - ステータスを `available` に設定

完璧な自動化システムの完成です！🎉

