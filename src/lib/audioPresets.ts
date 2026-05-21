import { supabase } from "./supabase";

export const saveClipToSupabase = async (
  blob: Blob,
  fileName: string,
  clipName: string
) => {
  // 現在のユーザーを取得
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("ログインしていません。保存するにはログインが必要です。");
  }

  // Storageにアップロード
  // パス例: audio_presets/user_id/123456789_fileName.mp3
  const filePath = `${user.id}/${Date.now()}_${fileName}`;
  
  const { error: uploadError, data: uploadData } = await supabase.storage
    .from("audio-presets")
    .upload(filePath, blob, {
      contentType: "audio/mp3",
    });

  if (uploadError) {
    throw new Error(`Storageへのアップロードに失敗しました: ${uploadError.message}`);
  }

  // アップロードしたファイルの公開URLを取得
  const { data: { publicUrl } } = supabase.storage
    .from("audio-presets")
    .getPublicUrl(filePath);

  // Databaseの audio_presets テーブルにレコードを保存
  const { error: dbError } = await supabase
    .from("audio_presets")
    .insert([
      {
        user_id: user.id,
        name: clipName,
        audio_url: publicUrl,
      }
    ]);

  if (dbError) {
    throw new Error(`データベースへの保存に失敗しました: ${dbError.message}`);
  }

  return publicUrl;
};
