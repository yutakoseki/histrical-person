# FFmpeg Layer

このLayerにはffmpegとffprobeのバイナリを配置します。

## 構造

```
layers/ffmpeg/
  bin/
    ffmpeg      # 実行可能ファイル
    ffprobe     # 実行可能ファイル
```

## セットアップ手順

1. Lambda用の静的リンクされたffmpegバイナリをダウンロード:
   ```bash
   cd layers/ffmpeg
   mkdir -p bin
   cd bin
   
   # 例: johnvansickle.com からダウンロード (Linux x86_64用)
   wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
   tar xf ffmpeg-release-amd64-static.tar.xz
   mv ffmpeg-*-static/ffmpeg .
   mv ffmpeg-*-static/ffprobe .
   rm -rf ffmpeg-*-static*
   
   # 実行権限を付与
   chmod +x ffmpeg ffprobe
   ```

2. 動作確認:
   ```bash
   ./ffmpeg -version
   ./ffprobe -version
   ```

## デプロイ

CDKが自動的にこのディレクトリをZIP化してLambda Layerとして登録します。


