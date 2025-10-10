# Lambda 実行フロー詳細

## 🔄 実行フローの全体像

Lambda関数は**2種類の方法**で起動されます：
1. **EventBridge（スケジュール実行）** - 定期的に自動実行
2. **Lambda Destination（連鎖実行）** - 前のLambdaが成功したら自動的に次を実行

## 📊 実行フロー図

```
┌─────────────────────────────────────────────────────────────────────┐
│                      毎日 0:00 UTC (9:00 JST)                       │
│                        EventBridge トリガー                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ SelectAndLockFigure    │
                    │                        │
                    │ - ランダムに人物選択   │
                    │ - ロック設定           │
                    └────────────┬───────────┘
                                 │
                                 │ ✅ 成功時に自動連鎖
                                 │ (Lambda Destination)
                                 ▼
                    ┌────────────────────────┐
                    │ GenerateSnippets       │
                    │                        │
                    │ - OpenAI APIで格言生成 │
                    │ - 30個の格言を作成     │
                    │ - DynamoDBに保存       │
                    └────────────────────────┘
                                 
                                 ⏸️ ここで自動フローは停止


┌─────────────────────────────────────────────────────────────────────┐
│                 手動実行 または EventBridge (無効)                   │
│                      毎日 1:30 UTC (10:30 JST)                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ RenderAudioVideo       │
                    │                        │
                    │ - 格言を取得           │
                    │ - 音声合成 (OpenAI TTS)│
                    │ - 動画レンダリング     │
                    │ - S3に保存             │
                    └────────────┬───────────┘
                                 │
                                 │ ✅ 成功時に自動連鎖
                                 │ (Lambda Destination)
                                 ▼
                    ┌────────────────────────┐
                    │ UploadYoutube          │
                    │                        │
                    │ - S3から動画取得       │
                    │ - YouTubeにアップロード│
                    └────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                         1時間ごと自動実行                           │
│                        EventBridge トリガー                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ LockAutoRelease        │
                    │                        │
                    │ - タイムアウトした     │
                    │   ロックを解放         │
                    └────────────────────────┘
                                 
                         （独立実行・連鎖なし）
```

## 🎯 詳細な実行メカニズム

### チェーン1: 人物選択 → 格言生成（毎日自動）

```javascript
// CDKの設定（cdk/lib/stack.ts より）
const selectAndLock = this.createPythonFunction("SelectAndLockFigure", {
  onSuccess: new destinations.LambdaDestination(generateSnippets), // ✅ 連鎖設定
});

// EventBridge
const selectRule = new events.Rule(this, "SelectFigureRule", {
  schedule: events.Schedule.cron({ minute: "0", hour: "0" }), // 毎日0:00 UTC
});
selectRule.addTarget(new targets.LambdaFunction(selectAndLock));
```

**実行タイミング:**
- 毎日 0:00 UTC (9:00 JST) に EventBridge が SelectAndLockFigure を起動
- SelectAndLockFigure が成功すると、**自動的に** GenerateSnippets を起動
- 失敗した場合は GenerateSnippets は実行されない

**待ち時間:**
- SelectAndLockFigure: 約5秒
- GenerateSnippets: 約2-3分（OpenAI APIの応答時間による）
- **合計: 約3分で完了**

### チェーン2: 動画レンダリング → YouTube投稿（手動または自動）

```javascript
// CDKの設定（cdk/lib/stack.ts より）
const renderAudioVideo = this.createPythonFunction("RenderAudioVideo", {
  onSuccess: new destinations.LambdaDestination(uploadYoutube), // ✅ 連鎖設定
});

// EventBridge（デフォルトで無効）
const renderRule = new events.Rule(this, "RenderVideoRule", {
  enabled: false, // ⚠️ 無効
  schedule: events.Schedule.cron({ minute: "30", hour: "1" }), // 毎日1:30 UTC
});
renderRule.addTarget(new targets.LambdaFunction(renderAudioVideo));
```

**実行タイミング:**
- **手動実行**: AWS CLIまたはコンソールから手動で起動
- **自動実行**: RenderVideoRule を有効化すると毎日1:30 UTC (10:30 JST) に起動
- RenderAudioVideo が成功すると、**自動的に** UploadYoutube を起動

**待ち時間:**
- RenderAudioVideo: 約3-5分（動画の長さによる）
- UploadYoutube: 約1-2分（動画サイズによる）
- **合計: 約5-7分で完了**

### 独立実行: ロック解放（1時間ごと）

```javascript
// CDKの設定（cdk/lib/stack.ts より）
const lockAutoRelease = this.createPythonFunction("LockAutoRelease", {
  // 連鎖なし
});

const lockRule = new events.Rule(this, "LockAutoReleaseRule", {
  schedule: events.Schedule.rate(cdk.Duration.hours(1)), // 1時間ごと
});
lockRule.addTarget(new targets.LambdaFunction(lockAutoRelease));
```

**実行タイミング:**
- 1時間ごとに自動実行
- 他のLambdaとは独立して動作
- 連鎖なし

---

## 🔍 Lambda Destination vs EventBridge

### Lambda Destination（連鎖実行）

**メリット:**
- ✅ 前のLambdaが成功した場合のみ実行
- ✅ データを引き継げる（figurePk, nameなど）
- ✅ リトライ機能付き
- ✅ 待ち時間なし（即座に次を実行）

**使用箇所:**
- SelectAndLockFigure → GenerateSnippets
- RenderAudioVideo → UploadYoutube

### EventBridge（スケジュール実行）

**メリット:**
- ✅ 定期的に自動実行
- ✅ 複数のターゲットを同時起動可能
- ✅ 実行タイミングを柔軟に設定

**使用箇所:**
- SelectFigureRule → SelectAndLockFigure（毎日0:00 UTC）
- LockAutoReleaseRule → LockAutoRelease（1時間ごと）
- RenderVideoRule → RenderAudioVideo（無効・任意で有効化）

---

## 📝 実行パターン別の動作

### パターン1: 完全自動化（RenderVideoRule 有効化）

```
0:00 UTC (9:00 JST)
  → SelectAndLockFigure 実行
  → GenerateSnippets 自動実行
  → 格言30個生成完了

1:30 UTC (10:30 JST)
  → RenderAudioVideo 実行
  → UploadYoutube 自動実行
  → YouTube投稿完了

毎時0分
  → LockAutoRelease 実行
```

### パターン2: 半自動化（RenderVideoRule 無効・デフォルト）

```
0:00 UTC (9:00 JST)
  → SelectAndLockFigure 実行
  → GenerateSnippets 自動実行
  → 格言30個生成完了
  → ⏸️ ここで停止

（手動でRenderAudioVideoを実行）
  → RenderAudioVideo 実行
  → UploadYoutube 自動実行
  → YouTube投稿完了

毎時0分
  → LockAutoRelease 実行
```

### パターン3: 格言生成のみ（OpenAI API設定済み）

```
0:00 UTC (9:00 JST)
  → SelectAndLockFigure 実行
  → GenerateSnippets 自動実行
  → 格言30個生成完了
  → ⏸️ ここで終了

毎時0分
  → LockAutoRelease 実行
```

---

## 🚀 手動実行方法

### GenerateSnippetsを手動実行

```bash
export AWS_PROFILE=histrical

# 特定の人物の格言を生成
aws lambda invoke \
  --function-name HistricalPersonStack-GenerateSnippets5DF23CFE-XywxBtOOijPM \
  --payload '{"figurePk":"figure#001","name":"織田信長"}' \
  response.json

cat response.json
```

### RenderAudioVideoを手動実行

```bash
# 特定の人物の動画を作成
aws lambda invoke \
  --function-name HistricalPersonStack-RenderAudioVideo74FC631D-9Q0PeKGJqPP4 \
  --payload '{"figurePk":"figure#001","name":"織田信長"}' \
  response.json

# 成功すると自動的に UploadYoutube が実行される
```

### SelectAndLockFigureを手動実行

```bash
# ランダムに人物を選択して格言生成まで実行
aws lambda invoke \
  --function-name HistricalPersonStack-SelectAndLockFigure6C24D904-nMq21iwyw7wK \
  --payload '{}' \
  response.json

# 成功すると自動的に GenerateSnippets が実行される
```

---

## 🔧 RenderVideoRule を有効化する方法

完全自動化したい場合は、以下のコマンドで有効化できます：

```bash
export AWS_PROFILE=histrical

# ルール名を取得
RULE_NAME=$(aws events list-rules --query 'Rules[?contains(Name, `RenderVideoRule`)].Name' --output text)

# ルールを有効化
aws events enable-rule --name $RULE_NAME

echo "RenderVideoRule を有効化しました"
echo "毎日1:30 UTC (10:30 JST) に動画レンダリングが自動実行されます"
```

---

## 📊 まとめ

| Lambda関数 | 起動方法 | 次のアクション | 実行頻度 |
|-----------|---------|--------------|---------|
| **SelectAndLockFigure** | EventBridge（毎日0:00 UTC） | → GenerateSnippets | 毎日1回 |
| **GenerateSnippets** | Lambda Destination（自動連鎖） | なし（停止） | SelectAndLockFigure成功時 |
| **RenderAudioVideo** | EventBridge（無効）または手動 | → UploadYoutube | 手動 or 有効化で毎日1回 |
| **UploadYoutube** | Lambda Destination（自動連鎖） | なし | RenderAudioVideo成功時 |
| **LockAutoRelease** | EventBridge（1時間ごと） | なし（独立） | 1時間ごと |

**ポイント:**
- ✅ **自動連鎖**: SelectAndLockFigure → GenerateSnippets、RenderAudioVideo → UploadYoutube
- ⏰ **スケジュール実行**: SelectAndLockFigure（毎日）、LockAutoRelease（毎時）
- ⚠️ **手動実行推奨**: RenderAudioVideo（EventBridgeルールは無効）

