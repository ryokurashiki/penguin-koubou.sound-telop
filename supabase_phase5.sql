-- ==========================================
-- アプリケーション設定（メンテナンスモード等）のテーブル作成
-- ==========================================
-- メンテナンスモードを機能させるため、以下のSQLをSupabaseの「SQL Editor」で実行してください。

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS（Row Level Security）の有効化
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 全ユーザー（未ログイン含む）が読み取れる
CREATE POLICY "Anyone can read app settings" ON public.app_settings
  FOR SELECT USING (true);

-- 管理者（role='admin'）のみ更新可能
CREATE POLICY "Admins can update app settings" ON public.app_settings
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 管理者（role='admin'）のみ挿入可能
CREATE POLICY "Admins can insert app settings" ON public.app_settings
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- メンテナンスモードの初期データ（デフォルトはOFF）を挿入
INSERT INTO public.app_settings (key, value, description)
VALUES ('maintenance_mode', 'false', 'システムメンテナンス中はtrueに設定')
ON CONFLICT (key) DO NOTHING;
