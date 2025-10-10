# GitHub セットアップガイド

## リポジトリ作成とPush手順

### 1. GitHubでリポジトリを作成

1. https://github.com/new にアクセス
2. 以下を設定：
   - **Repository name**: `histrical-person`
   - **Description**: `Historical Person YouTube Automation System - AWS CDK project for automated historical figure content generation`
   - **Visibility**: Public または Private
   - ⚠️ **"Add a README file"、".gitignore"、"license"のチェックは外す**
3. "Create repository" をクリック

### 2. リモートリポジトリを追加

GitHubユーザー名を `YOUR_USERNAME` に置き換えて実行：

```bash
cd /develop/project/histrical-person
git remote add origin https://github.com/YOUR_USERNAME/histrical-person.git
git branch -M main
git push -u origin main
```

### 3. 確認

```bash
git remote -v
```

出力例：
```
origin  https://github.com/YOUR_USERNAME/histrical-person.git (fetch)
origin  https://github.com/YOUR_USERNAME/histrical-person.git (push)
```

## リポジトリ説明の例

GitHubリポジトリのREADMEには以下のような説明があります：

### 機能
- ✅ 歴史的人物のランダム選択とロック機構
- ✅ OpenAI APIを使用した格言生成（30個/人物）
- ✅ 音声合成とビデオレンダリング（FFmpeg使用）
- ✅ YouTube自動アップロード
- ✅ EventBridge による自動スケジューリング
- ✅ DynamoDB でのデータ管理
- ✅ S3 でのアーティファクト保存

### 技術スタック
- **Infrastructure**: AWS CDK (TypeScript)
- **Runtime**: Python 3.13
- **Services**: Lambda, DynamoDB, S3, EventBridge
- **APIs**: OpenAI API, YouTube Data API v3
- **Tools**: FFmpeg, Noto Sans CJK JP

## GitHub Secrets の設定（GitHub Actionsを使う場合）

CI/CD パイプラインを構築する場合は、以下のSecretsを設定してください：

1. リポジトリの Settings → Secrets and variables → Actions
2. 以下のSecretsを追加：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (例: ap-northeast-1)
- `OPENAI_API_KEY`
- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REFRESH_TOKEN`

## トピックタグ（推奨）

リポジトリのトピックとして以下を追加すると見つけやすくなります：

```
aws-cdk
aws-lambda
python
typescript
dynamodb
eventbridge
openai
youtube-api
automation
serverless
infrastructure-as-code
```

## ライセンス

必要に応じて LICENSE ファイルを追加してください：

```bash
# MIT Licenseの例
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2025 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

git add LICENSE
git commit -m "Add MIT License"
git push
```

