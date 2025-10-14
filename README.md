# 偉人スニペット自動生成システム

このリポジトリは、偉人ごとに 40 文字以内の短文（30 本）を自動生成し、音声・動画化して YouTube に公開するまでをフル自動化するワークロードを管理します。EventBridge による無人運用、OpenAI API を用いたテキスト／TTS 生成、ffmpeg による動画レンダリング、YouTube Data API を使った自動投稿を含みます。

## 構成概要

- **DynamoDB**  
  - `figures`: 対象人物の状態管理（`ready` → `available` → `locked` → `completed`）  
  - `sayings`: 各人物の短文ストック（正規化ハッシュ／近似排除）
- **Lambda (Python 3.13)**  
  - `select_and_lock_figure`: `status=available` の人物をロック  
  - `generate_snippets_for_figure`: OpenAI Chat Completions で短文生成・30 本蓄積  
  - `lock_auto_release`: ロック期限切れの人物を `available` に復帰  
  - `render_audio_video`: OpenAI TTS + ffmpeg で 1080x1920 の字幕付き動画生成  
  - `upload_youtube`: 生成動画を YouTube に投稿し、`figures.video.youtubeId` を保存
- **Lambda Layers**  
  - `ffmpeg`: `ffmpeg` / `ffprobe` の静的バイナリ  
  - `fonts`: 字幕用フォント（例: Noto Sans CJK JP）とデフォルトポートレート画像
- **S3 バケット**  
  - TTS 音声・字幕・最終動画、自動生成したモノクロ人物画像（`portraits/<name>.jpg` にキャッシュ）
- **EventBridge ルール**  
  1. 毎日 09:00 JST に `select_and_lock_figure` を起動  
  2. 成功時のレスポンスを `generate_snippets_for_figure` に連鎖呼び出し  
  3. 毎時の `lock_auto_release` バッチ  
  4. （任意）動画レンダリング → YouTube 投稿チェーン  
- **テスト**  
  - `pytest` による日本語正規化・近似判定ユーティリティの単体テスト  
  - Lint/Format: Python は `ruff`／`black`、CDK(TypeScript) は `eslint`／`prettier`

## 事前準備

1. **OpenAI API Key**  
   - [OpenAI](https://platform.openai.com/) で API キーを発行し、`.env` へ `OPENAI_API_KEY` として設定します。
2. **YouTube OAuth2**  
   - GCP プロジェクトで YouTube Data API を有効化  
   - OAuth クライアント (Installed App) を作成  
   - CLI 等で `refresh_token` を取得し、`YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN` を `.env` に記載
3. **ffmpeg / ffprobe を Lambda Layer 化**  
   - 例: [ffmpeg-static build](https://johnvansickle.com/ffmpeg/) などから Linux x86_64 用を取得  
   - `layers/ffmpeg` 直下に `bin/ffmpeg`, `bin/ffprobe` を配置し ZIP 化 (`zip -r ffmpeg-layer.zip .`)  
   - README の手順に従って CDK で Layer としてデプロイ
4. **フォント & 画像レイヤー**  
   - Noto Sans CJK (SIL Open Font License) などを `layers/fonts` に配置 (`fonts/NotoSansCJKjp-Regular.otf` 等)  
   - 同階層に `default_portrait.jpg`（著作権クリアなデフォルト画像）を置く  
   - `layers/fonts` を ZIP 化して Lambda Layer として利用
5. **（任意）S3 画像の上書き**  
   - デフォルトでは OpenAI 画像生成でモノクロ肖像を自動生成し、`portraits/<人物名>.jpg` として S3 にキャッシュします。  
   - 独自画像を使いたい場合のみ、同キーに手動でアップロードしてください。

`.env.sample` をコピーして `.env` を作成し、上記の認証情報・設定値を入力してください。

```bash
cp .env.sample .env
# 必要なキーを埋める
```

## ディレクトリ構成

```
├── cdk/                        # AWS CDK (TypeScript)
├── lambdas/                    # 各 Lambda 関数（Python 3.13）
│   ├── .../requirements.txt
│   └── generate_snippets_for_figure/tests
├── layers/
│   ├── ffmpeg/                 # 静的 ffmpeg/ffprobe （ZIP 化して Layer に）
│   └── fonts/                  # 字幕フォントとデフォルト画像
├── apps/
│   └── figures-app/            # Next.js (App Router) ベースの管理用Webアプリ
├── Makefile
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## セットアップ / デプロイ手順

1. 依存ライブラリのインストール
   ```bash
   make install
   ```
2. CDK ブートストラップ（初回のみ）
   ```bash
   make bootstrap
   ```
3. デプロイ
   ```bash
   make deploy
   ```

## Web管理アプリ (Next.js)

`apps/figures-app` は Vercel へのデプロイを想定した管理UIです。主な機能は以下の通りです。

- `figures` テーブルの一覧表示・ステータスフィルタ・詳細編集
- OpenAI を利用した偉人候補／YouTubeタイトルの自動提案と `status=ready` での登録
- サムネイル (`histrical-person-thumbnails`) と肖像画 (`artifacts/portraits/`) のS3アップロード

### 開発サーバー

```bash
pnpm install            # まだの場合
pnpm --filter figures-app dev
```

`AWS_REGION / FIGURES_TABLE_NAME / ARTIFACTS_BUCKET_NAME / THUMBNAIL_BUCKET_NAME / PORTRAIT_PREFIX / OPENAI_API_KEY` などを `.env` に設定してください。`OPENAI_MODEL` は `OPENAI_COMPLETION_MODEL` の値を自動で利用します。

### Vercel デプロイ時の環境変数

| 変数名 | 説明 |
| --- | --- |
| `AWS_REGION` | 例: `ap-northeast-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | DynamoDB / S3 へアクセスできるIAMユーザー |
| `FIGURES_TABLE_NAME` | `figures` |
| `ARTIFACTS_BUCKET_NAME` | 例: `histricalpersonstack-artifactsbucket2aac5544-7he0t3nctpwx` |
| `THUMBNAIL_BUCKET_NAME` | `histrical-person-thumbnails` |
| `PORTRAIT_PREFIX` | `portraits` |
| `OPENAI_API_KEY` | AI提案用。Lambdaと同じキーを共有可能 |
| `OPENAI_MODEL` (任意) | 例: `gpt-4o-mini` |
| `OPENAI_TEMPERATURE` (任意) | 例: `0.2` |

Vercel では Node.js 18 以上のランタイムを選択してください。`pnpm --filter figures-app build` が成功するよう依存関係をインストールします。

## 初期データ投入例

`figures` テーブルに初期の人物レコードを投入します（ステータスは `ready`）。

```bash
aws dynamodb put-item \
  --table-name figures \
  --item '{
    "pk": {"S": "figure#Confucius"},
    "name": {"S": "孔子"},
    "status": {"S": "ready"},
    "createdAt": {"N": "'$(date +%s%3N)'"},
    "updatedAt": {"N": "'$(date +%s%3N)'"},
    "lockedUntil": {"N": "0"}
  }'
```

同様に複数の人物を登録してください。

## 運用

- サムネイルと肖像画が揃い `status=available` になった人物は、EventBridge で 09:00 JST に `select_and_lock_figure` が起動し、成功時に `generate_snippets_for_figure` が自動呼び出しされます。
- `generate_snippets_for_figure` は既存数を確認し、30 本に達すると `figures.status=completed` へ条件付き更新し終了します。
- `lock_auto_release` が毎時ロック期限切れを解放します。
- （任意）`RenderVideoRule` を有効化すると字幕付き動画を生成し、成功時に `upload_youtube` が発火します。必要に応じて enable してください。
- CloudWatch Logs で各 Lambda の実行状況を監視し、失敗時のリトライを確認します。

## テスト

```bash
make test
```

`pytest` により `text_utils` の正規化・近似判定ロジックを検証します。重複排除が失敗した場合はテストで検知できます。

## 受け入れ基準

- `cdk deploy` 後、EventBridge → Lambda のチェーンが動作し、`figures` レコードが `ready`（資産準備中）→ `available`（生成キュー投入可）→ `locked` → `completed` へ遷移する。
- `sayings` に 40 文字以内の短文が 30 本保存され、完全重複やレーベンシュタイン距離 ≤ 3 の近似が混入しない。
- `render_audio_video` が OpenAI TTS (`gpt-4o-mini-tts`, voice `ash`) と自動生成したモノクロ肖像を用い、右半分に人物画像・左半分の黒背景に字幕を表示する 1080x1920 の mp4 を S3 へ出力する。
- `upload_youtube` が動画を投稿し、`figures.video.youtubeId` を保存する。
- `pytest` による文字処理ユーティリティの単体テストが成功する。
- README / 設定ファイル / Lambda コード / CDK 構成 / テストがすべて出力済みである。

## 補足

- ElevenLabs 等の他社 TTS は使用していません。音声合成は OpenAI `gpt-4o-mini-tts` 固定です。
- Lambda Layer に配置したフォントを `ffmpeg subtitles` フィルタから参照するため、`fontsdir=/opt/fonts` を指定しています。フォント名とファイル名が一致していることを確認してください。
- `render_audio_video` は肖像生成に失敗した場合のみ `/opt/fonts/default_portrait.jpg` を利用します。ネットワークエラー等に備えて Layer 側へファイルを配置してください。
