-- ==========================================
-- 管理者権限対応：Profilesテーブル作成スクリプト
-- ==========================================
-- このスクリプトをコピーし、Supabaseコンソールの「SQL Editor」に貼り付けて実行してください。

-- 1. profiles テーブルの作成
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  role text default 'user' check (role in ('admin', 'user'))
);

-- 2. RLS（Row Level Security）の有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. アクセスポリシーの作成
-- 自分自身のプロフィールを読み取れる
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 管理者（role='admin'）は全員のプロフィールを読み取れる
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. ユーザー登録時（SignUp時）の自動プロフィール作成トリガー
-- ※ emailが「username@dummy.local」として登録される想定のため、@の前の部分をusernameとして抽出します。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id, 
    split_part(new.email, '@', 1), 
    'user'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- 💡 実行後の手順
-- 最初の一人を管理者にしたい場合は、SupabaseのTable Editorから
-- public.profiles を開き、該当ユーザーの role を 'admin' に手動で書き換えてください。
-- ==========================================
