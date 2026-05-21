-- ==========================================
-- フェーズ3：音声プリセット用テーブル・ストレージ作成スクリプト
-- ==========================================
-- このスクリプトをコピーし、Supabaseコンソールの「SQL Editor」に貼り付けて実行してください。

-- 1. audio_presets テーブルの作成
CREATE TABLE IF NOT EXISTS public.audio_presets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  audio_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. RLS（Row Level Security）の有効化
ALTER TABLE public.audio_presets ENABLE ROW LEVEL SECURITY;

-- 3. アクセスポリシーの作成
-- 自分自身のプリセットを読み取れる
CREATE POLICY "Users can read own audio presets" ON public.audio_presets
  FOR SELECT USING (auth.uid() = user_id);

-- 自分自身のプリセットを作成できる
CREATE POLICY "Users can insert own audio presets" ON public.audio_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 自分自身のプリセットを更新できる
CREATE POLICY "Users can update own audio presets" ON public.audio_presets
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 自分自身のプリセットを削除できる
CREATE POLICY "Users can delete own audio presets" ON public.audio_presets
  FOR DELETE USING (auth.uid() = user_id);

-- 4. audio-presets ストレージバケットの作成
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-presets', 'audio-presets', true)
ON CONFLICT (id) DO NOTHING;

-- 5. audio-presetsバケットのストレージポリシー
-- 認証済みユーザーがアップロード可能 (自分のディレクトリ配下のみ)
CREATE POLICY "Authenticated users can upload audio presets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio-presets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 認証済みユーザーが自分のファイルを更新可能
CREATE POLICY "Users can update own audio presets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audio-presets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 認証済みユーザーが自分のファイルを削除可能
CREATE POLICY "Users can delete own audio presets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audio-presets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 誰でも閲覧可能（パブリック）
CREATE POLICY "Anyone can view audio presets" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio-presets');

-- ==========================================
-- 実行完了後、アプリ側で「保存済みクリップ」機能が利用可能になります。
-- ==========================================
