# Fonts Layer

このLayerには日本語フォントとデフォルト画像を配置します。

## 構造

```
layers/fonts/
  fonts/
    NotoSansCJKjp-Regular.otf  # または他の日本語フォント
  default.jpg                   # デフォルトの肖像画像
```

## セットアップ手順

1. 日本語フォントをダウンロード:
   ```bash
   cd layers/fonts
   mkdir -p fonts
   cd fonts
   
   # 例: Noto Sans CJK JPをダウンロード
   wget https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf
   ```

2. デフォルト画像を配置:
   ```bash
   cd layers/fonts
   # 適当な肖像画像をdefault.jpgとして配置
   # サイズ: 640x1920推奨（縦長）
   cp /path/to/your/portrait.jpg default.jpg
   ```

   または、シンプルな黒背景画像を作成:
   ```bash
   # ImageMagickがある場合
   convert -size 640x1920 xc:black default.jpg
   ```

## デプロイ

CDKが自動的にこのディレクトリをZIP化してLambda Layerとして登録します。

## 注意事項

- フォント名はASS字幕ファイルの設定と一致させる必要があります
- render_audio_videoのコードでは "Noto Sans CJK JP" を指定しています
- デフォルト画像は肖像画がS3にない場合のフォールバックとして使用されます


