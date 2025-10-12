#!/bin/bash
# 肖像画を一括アップロードするスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
S3_BUCKET="histricalpersonstack-artifactsbucket2aac5544-7he0t3nctpwx"
PORTRAITS_DIR="${PROJECT_ROOT}/portraits"

echo "=================================================="
echo "肖像画アップロードスクリプト"
echo "=================================================="
echo ""
echo "S3バケット: ${S3_BUCKET}"
echo "ローカルディレクトリ: ${PORTRAITS_DIR}"
echo ""

# portraitsディレクトリが存在するか確認
if [ ! -d "$PORTRAITS_DIR" ]; then
    echo "📁 portraitsディレクトリを作成します..."
    mkdir -p "$PORTRAITS_DIR"
    echo ""
fi

# 必要な人物名リスト
FIGURES=(
    "坂本龍馬"
    "織田信長"
    "豊臣秀吉"
    "徳川家康"
    "西郷隆盛"
    "伊達政宗"
    "武田信玄"
    "上杉謙信"
    "真田幸村"
    "源義経"
)

echo "📋 必要な肖像画ファイル（jpg、png、webp対応）:"
for name in "${FIGURES[@]}"; do
    FOUND=false
    for ext in jpg png webp; do
        FILE="${PORTRAITS_DIR}/${name}.${ext}"
        if [ -f "$FILE" ]; then
            SIZE=$(du -h "$FILE" | cut -f1)
            echo "  ✅ ${name}.${ext} (${SIZE})"
            FOUND=true
            break
        fi
    done
    if [ "$FOUND" = false ]; then
        echo "  ❌ ${name}.jpg/png/webp（未配置）"
    fi
done
echo ""

# アップロード
echo "=================================================="
echo "S3へのアップロード"
echo "=================================================="
echo ""

UPLOADED=0
SKIPPED=0
MISSING=0

for name in "${FIGURES[@]}"; do
    FOUND=false
    
    # jpg、png、webpの順で探す
    for ext in jpg png webp; do
        FILE="${PORTRAITS_DIR}/${name}.${ext}"
        
        if [ ! -f "$FILE" ]; then
            continue
        fi
        
        S3_KEY="portraits/${name}.${ext}"
        
        # S3にアップロード
        if aws s3 cp "$FILE" "s3://${S3_BUCKET}/${S3_KEY}"; then
            echo "✅ アップロード完了: ${name}.${ext} → s3://${S3_BUCKET}/${S3_KEY}"
            UPLOADED=$((UPLOADED + 1))
            FOUND=true
            break
        else
            echo "❌ アップロード失敗: ${name}.${ext}"
        fi
    done
    
    if [ "$FOUND" = false ]; then
        echo "⏩ スキップ: ${name}（jpg/png/webpファイルなし）"
        MISSING=$((MISSING + 1))
    fi
done

echo ""
echo "=================================================="
echo "完了"
echo "=================================================="
echo "アップロード: ${UPLOADED}件"
echo "未配置: ${MISSING}件"
echo ""

if [ $UPLOADED -gt 0 ]; then
    echo "✨ S3に保存された肖像画を確認:"
    aws s3 ls s3://${S3_BUCKET}/portraits/ --human-readable
fi

echo ""
echo "📝 肖像画の配置方法:"
echo "  1. ${PORTRAITS_DIR}/ に {人物名}.jpg または .png または .webp を配置"
echo "  2. このスクリプトを実行: ./scripts/upload_portraits.sh"
echo ""
echo "対応形式: JPG、PNG、WebP（優先順位: jpg → png → webp）"
echo "例: ${PORTRAITS_DIR}/坂本龍馬.jpg または ${PORTRAITS_DIR}/坂本龍馬.png"
echo ""

