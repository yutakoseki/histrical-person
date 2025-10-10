#!/bin/bash
# Lambda Layer セットアップスクリプト
# FFmpeg、フォント、デフォルト画像を自動的にダウンロード・配置します

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FFMPEG_DIR="${PROJECT_ROOT}/layers/ffmpeg"
FONTS_DIR="${PROJECT_ROOT}/layers/fonts"

echo "=================================================="
echo "Lambda Layer セットアップスクリプト"
echo "=================================================="
echo ""

# FFmpegのセットアップ
setup_ffmpeg() {
    echo "📦 FFmpeg バイナリをダウンロード中..."
    
    mkdir -p "${FFMPEG_DIR}/bin"
    cd "${FFMPEG_DIR}/bin"
    
    if [ -f "ffmpeg" ] && [ -f "ffprobe" ]; then
        echo "✅ FFmpegは既に存在します（スキップ）"
        ./ffmpeg -version | head -1
        return 0
    fi
    
    echo "   ダウンロード中..."
    wget -q --show-progress https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
    
    echo "   展開中..."
    tar xf ffmpeg-release-amd64-static.tar.xz
    
    echo "   配置中..."
    mv ffmpeg-*-static/ffmpeg .
    mv ffmpeg-*-static/ffprobe .
    
    echo "   クリーンアップ中..."
    rm -rf ffmpeg-*-static*
    
    echo "   実行権限を付与中..."
    chmod +x ffmpeg ffprobe
    
    echo "✅ FFmpeg セットアップ完了"
    ./ffmpeg -version | head -1
    echo ""
}

# フォントのセットアップ
setup_fonts() {
    echo "🔤 フォントファイルをダウンロード中..."
    
    mkdir -p "${FONTS_DIR}/fonts"
    cd "${FONTS_DIR}/fonts"
    
    if [ -f "NotoSansCJKjp-Regular.otf" ]; then
        echo "✅ フォントは既に存在します（スキップ）"
        ls -lh NotoSansCJKjp-Regular.otf
        return 0
    fi
    
    echo "   ダウンロード中（約10MB、時間がかかります）..."
    wget -q --show-progress https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf
    
    echo "✅ フォント セットアップ完了"
    ls -lh NotoSansCJKjp-Regular.otf
    echo ""
}

# デフォルト画像の作成
setup_default_image() {
    echo "🖼️  デフォルト画像を作成中..."
    
    cd "${FONTS_DIR}"
    
    if [ -f "default.jpg" ]; then
        echo "✅ デフォルト画像は既に存在します（スキップ）"
        ls -lh default.jpg
        return 0
    fi
    
    # Pythonで黒背景の画像を作成
    python3 << 'EOF'
try:
    from PIL import Image
    img = Image.new('RGB', (640, 1920), color='black')
    img.save('default.jpg', quality=85)
    print("   Pillowで作成しました")
except ImportError:
    print("   ⚠️  Pillowがインストールされていません")
    print("   代替方法を試しています...")
    # ImageMagickを試す
    import subprocess
    try:
        subprocess.run(['convert', '-size', '640x1920', 'xc:black', 'default.jpg'], check=True)
        print("   ImageMagickで作成しました")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("   ⚠️  ImageMagickもインストールされていません")
        print("   最小限のJPEGを作成します...")
        # 最小限のダミーファイルを作成
        with open('default.jpg', 'wb') as f:
            # 1x1の黒いJPEG（最小）
            f.write(bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb0043000302020302020303030304030304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b1016101113141515150c0f171816141812141514ffdb00430103040405040509050509140d0b0d1414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414ffc00011080001000103012200021101031101ffc4001500010100000000000000000000000000000000ffda000c03010002110311003f00bfff00ffc40014100100000000000000000000000000000000ffda00080101000105027fff00ffc40014110100000000000000000000000000000000ffda0008010301013f017fff00ffc40014110100000000000000000000000000000000ffda0008010201013f017fff00ffc40014100100000000000000000000000000000000ffda0008010100063f027fff00ffc40014100100000000000000000000000000000000ffda0008010100013f217fffd9'))
        print("   最小限のJPEG画像を作成しました")
EOF
    
    echo "✅ デフォルト画像 セットアップ完了"
    ls -lh default.jpg
    echo ""
}

# 確認サマリー
show_summary() {
    echo "=================================================="
    echo "✅ セットアップ完了サマリー"
    echo "=================================================="
    echo ""
    echo "📁 FFmpeg Layer:"
    if [ -f "${FFMPEG_DIR}/bin/ffmpeg" ]; then
        echo "   ✅ ffmpeg: $(${FFMPEG_DIR}/bin/ffmpeg -version | head -1 | awk '{print $3}')"
    else
        echo "   ❌ ffmpeg: 未配置"
    fi
    if [ -f "${FFMPEG_DIR}/bin/ffprobe" ]; then
        echo "   ✅ ffprobe: 配置済み"
    else
        echo "   ❌ ffprobe: 未配置"
    fi
    echo ""
    
    echo "📁 Fonts Layer:"
    if [ -f "${FONTS_DIR}/fonts/NotoSansCJKjp-Regular.otf" ]; then
        FONT_SIZE=$(du -h "${FONTS_DIR}/fonts/NotoSansCJKjp-Regular.otf" | cut -f1)
        echo "   ✅ フォント: ${FONT_SIZE}"
    else
        echo "   ❌ フォント: 未配置"
    fi
    if [ -f "${FONTS_DIR}/default.jpg" ]; then
        IMG_SIZE=$(du -h "${FONTS_DIR}/default.jpg" | cut -f1)
        echo "   ✅ デフォルト画像: ${IMG_SIZE}"
    else
        echo "   ❌ デフォルト画像: 未配置"
    fi
    echo ""
    
    echo "🚀 次のステップ:"
    echo "   1. cd /develop/project/histrical-person/cdk"
    echo "   2. export AWS_PROFILE=histrical"
    echo "   3. npx cdk deploy --require-approval never"
    echo ""
    echo "   デプロイ後、RenderAudioVideoをテストできます！"
    echo ""
}

# メイン処理
main() {
    echo "作業ディレクトリ: ${PROJECT_ROOT}"
    echo ""
    
    setup_ffmpeg
    setup_fonts
    setup_default_image
    show_summary
    
    echo "=================================================="
    echo "✨ すべて完了しました！"
    echo "=================================================="
}

main

