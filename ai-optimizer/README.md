# AI運用最適化シミュレーター

Thompson Sampling + ベイズ更新によるリアルタイム広告推薦エンジンのローカルサンドボックス。

## セットアップ

```bash
make install   # Python依存関係 + npm packages をインストール
make seed      # SQLiteにテスト動画データ25件を投入
make dev       # 全サービスを並列起動
```

## サービス

| URL | 内容 |
|---|---|
| http://localhost:5173 | スワイプUI（ユーザーアプリ） |
| http://localhost:5174 | 管理画面（KPI・アルゴリズム制御） |
| http://localhost:8000/docs | FastAPI 自動生成ドキュメント |

## アーキテクチャ

- **Thompson Sampling**: カテゴリごとに Beta(α,β) からサンプリングし、最大スコアのカテゴリを選定
- **ベイズ更新**: complete/like → α+1、skip → β+1 をリアルタイム反映
- **Virtual Bid**: 管理画面からカテゴリのスコアに乗数を掛けて優先度を強制操作
- **探索率 η**: 0=完全活用（平均値で選定）、1=完全探索（ランダム）
