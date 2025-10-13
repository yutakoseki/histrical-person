#!/bin/bash

# AWS CLIプロファイルを指定
export AWS_PROFILE=${AWS_PROFILE:-histrical}

# 引数チェック
if [ $# -lt 2 ]; then
    echo "使い方: $0 <人物名> <YouTubeタイトル>"
    echo ""
    echo "例:"
    echo "  $0 織田信長 '【織田信長の名言】天下統一への道 #shorts'"
    echo "  $0 坂本龍馬 '【坂本龍馬】幕末の志士が残した名言集 #shorts'"
    exit 1
fi

FIGURE_NAME="$1"
YOUTUBE_TITLE="$2"

echo "=================================================="
echo "YouTubeタイトル設定"
echo "=================================================="
echo "人物名: ${FIGURE_NAME}"
echo "タイトル: ${YOUTUBE_TITLE}"
echo ""

# DynamoDBで人物を検索
FIGURE_PK=$(aws dynamodb scan \
    --table-name figures \
    --filter-expression "#name = :name" \
    --expression-attribute-names '{"#name":"name"}' \
    --expression-attribute-values "{\":name\":{\"S\":\"${FIGURE_NAME}\"}}" \
    --query 'Items[0].pk.S' \
    --output text)

if [ -z "$FIGURE_PK" ] || [ "$FIGURE_PK" == "None" ]; then
    echo "❌ エラー: 人物 '${FIGURE_NAME}' が見つかりません。"
    echo ""
    echo "📋 登録されている人物一覧:"
    aws dynamodb scan --table-name figures --query 'Items[].name.S' --output text | tr '\t' '\n' | sort
    exit 1
fi

echo "✅ 人物が見つかりました: ${FIGURE_PK}"
echo ""

# YouTubeタイトルを更新
aws dynamodb update-item \
    --table-name figures \
    --key "{\"pk\":{\"S\":\"${FIGURE_PK}\"}}" \
    --update-expression "SET youtubeTitle = :title" \
    --expression-attribute-values "{\":title\":{\"S\":\"${YOUTUBE_TITLE}\"}}"

if [ $? -eq 0 ]; then
    echo "✅ YouTubeタイトルを設定しました"
    echo ""
    echo "📺 設定内容を確認:"
    aws dynamodb get-item \
        --table-name figures \
        --key "{\"pk\":{\"S\":\"${FIGURE_PK}\"}}" \
        --query 'Item.{name:name.S,youtubeTitle:youtubeTitle.S}' \
        --output json
else
    echo "❌ エラー: YouTubeタイトルの設定に失敗しました"
    exit 1
fi

