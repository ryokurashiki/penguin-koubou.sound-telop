-- ==========================================
-- 招待コード機能の追加：invite_codesテーブルとトリガーの更新
-- ==========================================
-- このスクリプトをコピーし、Supabaseコンソールの「SQL Editor」に貼り付けて実行してください。

-- 1. invite_codes テーブルの作成
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  created_by uuid references auth.users on delete cascade not null,
  used_by uuid references auth.users on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  used_at timestamp with time zone
);

-- 2. RLS（Row Level Security）の有効化
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- 3. アクセスポリシーの作成
-- 管理者（role='admin'）は全ての招待コードを読み取れる
CREATE POLICY "Admins can read all invite codes" ON public.invite_codes
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 管理者（role='admin'）は招待コードを作成できる
CREATE POLICY "Admins can insert invite codes" ON public.invite_codes
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- ※ update, delete 権限はシステム（関数）のみが行うため不要です。

-- 4. ユーザー登録時（SignUp時）の自動プロフィール作成トリガーの更新
-- 招待コードの検証と消費を組み込みます
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  invite_code_val text;
  valid_code_id uuid;
BEGIN
  -- メタデータから招待コードを取得
  invite_code_val := new.raw_user_meta_data->>'invite_code';
  
  -- 招待コードが送られてきていない場合はエラー
  IF invite_code_val IS NULL OR invite_code_val = '' THEN
    RAISE EXCEPTION '招待コードが必要です。 (Invite code is required)';
  END IF;

  -- 招待コードが有効（存在し、かつ未使用）か検証
  SELECT id INTO valid_code_id
  FROM public.invite_codes
  WHERE code = invite_code_val
    AND used_at IS NULL;
    
  IF valid_code_id IS NULL THEN
    RAISE EXCEPTION 'この招待コードは無効または既に使用されています。 (Invalid or already used invite code)';
  END IF;

  -- 招待コードを使用済みに更新（SECURITY DEFINER なので権限をバイパスして実行可能）
  UPDATE public.invite_codes
  SET used_at = now(), used_by = new.id
  WHERE id = valid_code_id;

  -- プロフィールの作成
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id, 
    split_part(new.email, '@', 1), 
    'user'
  );
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
