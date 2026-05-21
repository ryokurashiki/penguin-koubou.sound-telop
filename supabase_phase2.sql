-- ==========================================
-- フェーズ2.5：Profilesテーブル拡張スクリプト
-- ==========================================
-- このスクリプトをコピーし、Supabaseコンソールの「SQL Editor」に貼り付けて実行してください。

-- 1. display_name カラムの追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;

-- 既存レコードに対し、display_name が null なら username をコピー
UPDATE public.profiles SET display_name = username WHERE display_name IS NULL;

-- 2. avatar_url カラムの追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 3. プロフィール更新ポリシーの追加（ユーザーが自身を更新可能に）
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. 管理者は全プロフィールを更新可能
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5. プロフィール新規作成ポリシー（サインアップトリガー用）
CREATE POLICY "Allow insert for auth trigger" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 6. Avatars ストレージバケットの作成
-- ※ Supabaseコンソール → Storage → 「New bucket」から手動で作成する場合は
--   バケット名: avatars / Public: ON にしてください。
-- SQLで作成する場合:
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Avatarsバケットのストレージポリシー
-- 認証済みユーザーがアップロード可能
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- 認証済みユーザーが自分のファイルを更新可能
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

-- 誰でも閲覧可能（パブリック）
CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
