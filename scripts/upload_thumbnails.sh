#!/bin/bash

# AWS CLIプロファイルを指定
export AWS_PROFILE=${AWS_PROFILE:-histrical}

# S3バケット名
THUMBNAIL_BUCKET="histrical-person-thumbnails"
THUMBNAILS_DIR="./thumbnails"

echo "=================================================="
echo "サムネイルバケット: ${THUMBNAIL_BUCKET}"
echo "ローカルのサムネイルディレクトリ: ${THUMBNAILS_DIR}"
echo "=================================================="
echo ""

# DynamoDBから人物名を取得
FIGURES=$(aws dynamodb scan --table-name figures --query 'Items[].name.S' --output text)

if [ -z "$FIGURES" ]; then
    echo "⚠️ DynamoDB 'figures' テーブルに人物データがありません。"
    exit 0
fi

# 配列に変換
IFS=$'\n' read -r -d '' -a FIGURES_ARRAY <<< "$FIGURES"

echo "📋 必要なサムネイルファイル（.png）:"
for name in "${FIGURES_ARRAY[@]}"; do
    FILE="${THUMBNAILS_DIR}/${name}_サムネ.png"
    if [ -f "$FILE" ]; then
        SIZE=$(du -h "$FILE" | cut -f1)
        echo "  ✅ ${name}_サムネ.png (${SIZE})"
    else
        echo "  ❌ ${name}_サムネ.png（未配置）"
    fi
done
echo ""

# アップロード
echo "=================================================="
echo "S3へのアップロード"
echo "=================================================="

UPLOADED=0
MISSING=0

for name in "${FIGURES_ARRAY[@]}"; do
    FILE="${THUMBNAILS_DIR}/${name}_サムネ.png"
    
    if [ ! -f "$FILE" ]; then
        echo "⏩ スキップ: ${name}（pngファイルなし）"
        MISSING=$((MISSING + 1))
        continue
    fi
    
    S3_KEY="${name}_サムネ.png"
    
    # S3にアップロード
    if aws s3 cp "$FILE" "s3://${THUMBNAIL_BUCKET}/${S3_KEY}"; then
        echo "✅ アップロード完了: ${name}_サムネ.png → s3://${THUMBNAIL_BUCKET}/${S3_KEY}"
        UPLOADED=$((UPLOADED + 1))
    else
        echo "❌ アップロード失敗: ${name}_サムネ.png"
    fi
done

echo ""
echo "=================================================="
echo "完了"
echo "=================================================="
echo "アップロード数: ${UPLOADED}"
echo "スキップ数（ファイルなし）: ${MISSING}"
echo ""

if [ "$UPLOADED" -gt 0 ]; then
    echo "✨ S3に保存されたサムネイルを確認:"
    aws s3 ls s3://${THUMBNAIL_BUCKET}/ --human-readable
fi

echo ""
echo "📝 サムネイルの配置方法:"
echo "  1. ${THUMBNAILS_DIR}/ に {人物名}_サムネ.png を配置"
echo "  2. このスクリプトを実行: ./scripts/upload_thumbnails.sh"
echo ""
echo "例: ${THUMBNAILS_DIR}/織田信長_サムネ.png"
echo "推奨サイズ: 1280x720 (YouTube推奨)"

