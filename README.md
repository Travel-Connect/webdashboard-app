# webdashboard-app

コルディオグループ向け Web ダッシュボードの設計・実装リポジトリです。

## Scope

- minpakuIN、ねっぱん、手間いらずの予約データを共通テンプレートへ変換する
- Supabase Storage/Postgres/Auth/RLS を使って raw 保管、正規化、施設別権限、集計マートを構成する
- Next.js + Vercel で 7 指標の Web ダッシュボードを提供する

## Documents

- `docs/web-dashboard-requirements.md`
- `docs/web-dashboard-detail-design.md`
- `docs/kpi-definitions.md`
- `docs/api-contract.md`
- `docs/master-data-spec.md`
- `docs/import-processing-spec.md`
- `docs/claude-design-prompt.md`

## Data Handling

Raw CSV、Excel、ログ、`.env` は個人情報や認証情報を含む可能性があるため Git 管理対象外です。テスト用データを追加する場合は、個人情報を除去した `*.sanitized.csv` のみを `fixtures/` 配下に配置します。
