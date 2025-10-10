# 実装状況と動作レベル

## 📊 現在の実装状況

### ✅ 完全実装済み・デプロイ済み

#### インフラストラクチャ（100%完了）
- ✅ **DynamoDB テーブル**
  - `figures` テーブル（10人の歴史的人物データ投入済み）
  - `sayings` テーブル（空・運用時に自動投入される）
- ✅ **S3 バケット**
  - `histricalpersonstack-artifactsbucket2aac5544-7he0t3nctpwx`
- ✅ **Lambda 関数** (5つ)
  - SelectAndLockFigure
  - GenerateSnippets
  - LockAutoRelease
  - RenderAudioVideo
  - UploadYoutube
- ✅ **EventBridge ルール** (3つ)
  - SelectFigureRule: 毎日0:00 UTC (有効)
  - LockAutoReleaseRule: 1時間ごと (有効)
  - RenderVideoRule: 毎日1:30 UTC (無効)

#### コード（100%完了）
- ✅ **Lambda関数のコード**: すべて実装済み・デプロイ済み
- ✅ **CDKインフラコード**: 完全実装
- ✅ **テストコード**: 実装済み（全テスト通過）
- ✅ **DynamoDB初期化スクリプト**: 実装済み・実行済み

### ⚠️ 部分的実装（動作に必要なファイルが未配置）

#### Lambda Layer（0%完了）
- ❌ **FFmpeg Layer** - ディレクトリ構造のみ存在（バイナリ未配置）
  - 必要: `layers/ffmpeg/bin/ffmpeg`
  - 必要: `layers/ffmpeg/bin/ffprobe`
- ❌ **Fonts Layer** - ディレクトリ構造のみ存在（ファイル未配置）
  - 必要: `layers/fonts/fonts/NotoSansCJKjp-Regular.otf`
  - 必要: `layers/fonts/default.jpg`

#### 環境変数（50%完了）
- ✅ AWS設定: 完了
- ❌ OpenAI API Key: サンプル値のまま
- ❌ YouTube API認証情報: サンプル値のまま

---

## 🎯 動作レベル別の状況

### レベル1: データ管理機能 ✅ **今すぐ動作可能**

**動くもの:**
```bash
# 人物データの追加・確認
python3 scripts/init_dynamodb.py

# DynamoDBから人物データを取得
aws dynamodb scan --table-name figures --max-items 10
```

**できること:**
- ✅ DynamoDBへの人物データ追加
- ✅ DynamoDBからの人物データ取得
- ✅ 人物データの手動管理

**必要なもの:**
- AWS認証情報のみ（設定済み）

---

### レベル2: 人物選択とロック機能 ✅ **今すぐ動作可能**

**動くもの:**
```bash
# 手動で人物を選択してロック
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `SelectAndLockFigure`)].FunctionName' --output text) \
  --payload '{}' \
  response.json

# ロック解放（タイムアウトした人物）
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `LockAutoRelease`)].FunctionName' --output text) \
  --payload '{}' \
  response.json
```

**できること:**
- ✅ ランダムに人物を選択
- ✅ 選択した人物をロック（他の処理が同時に選ばないようにする）
- ✅ タイムアウトしたロックの自動解放
- ✅ 毎日自動実行（EventBridgeで設定済み）

**必要なもの:**
- AWS認証情報のみ（設定済み）

**制限:**
- 格言生成は次のステップで必要

---

### レベル3: 格言生成機能 ❌ **OpenAI API Key が必要**

**動くもの（API Key設定後）:**
```bash
# SelectAndLockFigure が成功すると自動的に GenerateSnippets が実行される
# または手動実行:
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `GenerateSnippets`)].FunctionName' --output text) \
  --payload '{"figurePk":"figure#001","name":"織田信長"}' \
  response.json
```

**できること（API Key設定後）:**
- ✅ OpenAI APIで30個の格言を生成
- ✅ 重複チェック（レーベンシュタイン距離）
- ✅ DynamoDBへの自動保存
- ✅ SelectAndLockFigure完了後の自動実行

**必要なもの:**
1. ✅ AWS認証情報（設定済み）
2. ❌ **OpenAI API Key**（.envに設定 → 再デプロイ）

**設定手順:**
```bash
# 1. .env ファイルを編集
nano .env
# OPENAI_API_KEY=sk-proj-xxxxx を実際の値に変更

# 2. 再デプロイ
cd cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never
```

---

### レベル4: 動画レンダリング機能 ❌ **Lambda Layer + OpenAI API Key が必要**

**動くもの（すべて設定後）:**
```bash
# 格言生成完了後、手動で動画レンダリングを実行
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `RenderAudioVideo`)].FunctionName' --output text) \
  --payload '{"figurePk":"figure#001","name":"織田信長"}' \
  response.json
```

**できること（すべて設定後）:**
- ✅ OpenAI TTSで音声合成
- ✅ FFmpegで動画レンダリング（音声+字幕+肖像画）
- ✅ S3へのアップロード（動画・字幕ファイル）
- ✅ 字幕ファイル生成（SRT形式、ASS形式）

**必要なもの:**
1. ✅ AWS認証情報（設定済み）
2. ❌ **OpenAI API Key**（.envに設定 → 再デプロイ）
3. ❌ **FFmpeg バイナリ**（Lambda Layerに配置 → 再デプロイ）
4. ❌ **フォントファイル**（Lambda Layerに配置 → 再デプロイ）
5. ❌ **デフォルト画像**（Lambda Layerに配置 → 再デプロイ）

**設定手順:**
```bash
# 1. FFmpegバイナリを配置
cd layers/ffmpeg/bin
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xf ffmpeg-release-amd64-static.tar.xz
mv ffmpeg-*-static/ffmpeg .
mv ffmpeg-*-static/ffprobe .
rm -rf ffmpeg-*-static*
chmod +x ffmpeg ffprobe

# 2. フォントを配置
cd ../../fonts/fonts
wget https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf

# 3. デフォルト画像を配置（Pythonで黒背景を作成）
cd ..
python3 << 'EOF'
from PIL import Image
img = Image.new('RGB', (640, 1920), color='black')
img.save('default.jpg')
EOF

# 4. .env ファイルを編集（OpenAI API Key設定）
cd ../..
nano .env

# 5. 再デプロイ
cd cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never
```

---

### レベル5: YouTube アップロード機能 ❌ **YouTube API 認証情報が必要**

**動くもの（すべて設定後）:**
```bash
# 動画レンダリング完了後、自動的に実行される
# または手動実行:
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `UploadYoutube`)].FunctionName' --output text) \
  --payload '{"figurePk":"figure#001","name":"織田信長"}' \
  response.json
```

**できること（すべて設定後）:**
- ✅ S3から動画ファイルをダウンロード
- ✅ YouTubeへ自動アップロード
- ✅ タイトル・説明・タグの自動設定

**必要なもの:**
1. ✅ AWS認証情報（設定済み）
2. ❌ **YouTube API認証情報**（.envに設定 → 再デプロイ）
3. レベル4がすべて完了していること

**設定手順:**
```bash
# 1. Google Cloud Consoleで OAuth2.0 クライアントを作成
#    https://console.cloud.google.com/apis/credentials

# 2. YouTube Data API v3を有効化

# 3. Refresh Tokenを取得（別途手順が必要）

# 4. .env ファイルを編集
nano .env
# YT_CLIENT_ID=xxxxx.apps.googleusercontent.com
# YT_CLIENT_SECRET=GOCSPX-xxxxx
# YT_REFRESH_TOKEN=1//xxxxx

# 5. 再デプロイ
cd cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never
```

---

## 📋 段階的セットアップのロードマップ

### 🎯 目標レベル別の設定手順

#### **目標: レベル3まで（格言生成）** - 最も簡単・推奨

**必要な作業:**
1. OpenAI API Keyの取得と設定（5分）
2. 再デプロイ（5分）

**総所要時間: 約10分**

**できること:**
- 人物選択（自動）
- 格言生成（自動）
- DynamoDBでデータ確認

---

#### **目標: レベル4まで（動画レンダリング）** - やや複雑

**必要な作業:**
1. OpenAI API Keyの取得と設定（5分）
2. FFmpegバイナリのダウンロードと配置（5分）
3. フォントファイルのダウンロードと配置（3分）
4. デフォルト画像の作成（2分）
5. 再デプロイ（5分）

**総所要時間: 約20分**

**できること:**
- 人物選択（自動）
- 格言生成（自動）
- 音声合成（自動）
- 動画レンダリング（手動または自動）
- S3に動画保存

---

#### **目標: レベル5まで（完全自動化）** - 最も複雑

**必要な作業:**
1. レベル4までの作業をすべて完了
2. YouTube API認証情報の取得（30分〜1時間）
3. 再デプロイ（5分）
4. RenderVideoRuleの有効化（1分）

**総所要時間: 約1〜1.5時間**

**できること:**
- 完全自動化（人物選択 → 格言生成 → 動画作成 → YouTube投稿）
- 毎日自動実行

---

## 🚀 推奨セットアップフロー

### ステップ1: レベル3を目指す（最優先）

これが最も簡単で、システムのコア機能を確認できます。

```bash
# 1. OpenAI API Keyを取得
#    https://platform.openai.com/api-keys

# 2. .envファイルを編集
nano .env
# OPENAI_API_KEY=sk-proj-your-actual-key に変更

# 3. 再デプロイ
cd cdk
export AWS_PROFILE=histrical
npx cdk deploy --require-approval never

# 4. 動作確認
aws lambda invoke \
  --function-name $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `SelectAndLockFigure`)].FunctionName' --output text) \
  --payload '{}' \
  response.json

# 5. ログ確認
aws logs tail /aws/lambda/$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `GenerateSnippets`)].FunctionName' --output text) --follow
```

### ステップ2: レベル4に進む（動画レンダリング）

レベル3が正常に動作したら、次に進みます。

```bash
# DEPLOYMENT.md の「Lambda Layer用ファイルの配置」セクションを参照
```

### ステップ3: レベル5に進む（YouTube自動投稿）

レベル4が正常に動作したら、最終ステップです。

```bash
# YouTube API認証情報を設定
# 詳細は DEPLOYMENT.md を参照
```

---

## 🔍 現状の確認コマンド

### デプロイ済みリソースの確認

```bash
export AWS_PROFILE=histrical

# Lambda関数一覧
aws lambda list-functions --query 'Functions[?contains(FunctionName, `Histrical`)].FunctionName'

# DynamoDBテーブル確認
aws dynamodb scan --table-name figures --max-items 5

# EventBridgeルール確認
aws events list-rules --query 'Rules[?contains(Name, `Histrical`)].{Name:Name,State:State}'

# S3バケット確認
aws s3 ls | grep histrical
```

### 環境変数の確認

```bash
# .envファイルの内容（機密情報は隠す）
grep -v "^#" .env | grep -v "^$" | sed 's/=.*/=***/'
```

---

## 📝 まとめ

### 現在の状態
- ✅ **インフラ**: 100% デプロイ完了
- ✅ **コード**: 100% 実装完了
- ⚠️ **Lambda Layer**: 0% （ファイル未配置）
- ⚠️ **OpenAI API**: 未設定
- ⚠️ **YouTube API**: 未設定

### 次のステップ
1. **最優先**: OpenAI API Keyを設定してレベル3まで動かす（10分）
2. **次**: Lambda Layerを配置してレベル4まで動かす（20分）
3. **最後**: YouTube API を設定して完全自動化（1時間）

### 推奨事項
まずは**レベル3（格言生成）**を目指すことをお勧めします。これだけでもシステムのコア機能が確認でき、DynamoDBに格言データが蓄積されます。動画レンダリングは後からでも追加できます。

