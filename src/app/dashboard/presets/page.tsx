"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Library, Loader2, Play, Pause, Trash2, Copy, Check, Clock } from "lucide-react";

interface AudioPreset {
  id: string;
  name: string;
  audio_url: string;
  created_at: string;
}

export default function PresetsPage() {
  const [presets, setPresets] = useState<AudioPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPresets = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("audio_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setPresets(data);
    } catch (err: any) {
      console.error(err);
      alert("データの取得に失敗しました: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const handleDelete = async (id: string, audio_url: string) => {
    if (!confirm("このプリセットを削除しますか？")) return;

    try {
      // audio_urlからstorageのfilePathを抽出
      // 例: https://.../storage/v1/object/public/audio-presets/user_id/123456789_fileName.mp3
      const urlObj = new URL(audio_url);
      const pathParts = urlObj.pathname.split("audio-presets/");
      if (pathParts.length < 2) {
        throw new Error("無効なURL形式です");
      }
      const filePath = pathParts[1];

      // 1. DBから削除
      const { error: dbError } = await supabase
        .from("audio_presets")
        .delete()
        .eq("id", id);
      if (dbError) throw dbError;

      // 2. Storageから削除
      const { error: storageError } = await supabase.storage
        .from("audio-presets")
        .remove([filePath]);
      
      if (storageError) {
        console.warn("Storageのファイル削除に失敗しました（DBからは削除されました）", storageError);
      }

      // ローカルのリストを更新
      setPresets(presets.filter(p => p.id !== id));
    } catch (err: any) {
      console.error(err);
      alert("削除に失敗しました: " + err.message);
    }
  };

  const handleCopyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
      alert("コピーに失敗しました");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
          <Library className="w-6 h-6 text-orange-500" />
          保存済みクリップ
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 text-sm">
          クラウドに保存された音声プリセットの一覧です。セッション等で利用するためのURLをコピーできます。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-500 dark:text-neutral-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <Library className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">保存されたクリップがありません</h3>
          <p className="text-neutral-500 dark:text-neutral-500 text-sm">
            音声切り分けツールからクリップを「アカウントに保存」すると、ここに表示されます。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {presets.map((preset) => (
            <div key={preset.id} className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 hover:border-orange-500/30 transition-colors flex flex-col h-full">
              <div className="flex items-start justify-between mb-4 gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 dark:text-white truncate" title={preset.name}>
                    {preset.name}
                  </h3>
                  <div className="flex items-center gap-1 mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                    <Clock className="w-3 h-3" />
                    {new Date(preset.created_at).toLocaleString("ja-JP", {
                      year: "numeric", month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(preset.id, preset.audio_url)}
                  className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-auto space-y-4">
                {/* 簡易オーディオプレイヤー */}
                <div className="bg-white dark:bg-neutral-950 rounded-xl px-4 py-3 border border-neutral-200 dark:border-neutral-800">
                  <audio
                    controls
                    src={preset.audio_url}
                    className="w-full h-8 outline-none [&::-webkit-media-controls-panel]:bg-white dark:bg-neutral-950 [&::-webkit-media-controls-current-time-display]:text-neutral-700 dark:text-neutral-300 [&::-webkit-media-controls-time-remaining-display]:text-neutral-700 dark:text-neutral-300 [&::-webkit-media-controls-play-button]:invert [&::-webkit-media-controls-play-button]:hover:bg-neutral-100 dark:bg-neutral-800 [&::-webkit-media-controls-mute-button]:invert"
                  />
                </div>

                <button
                  onClick={() => handleCopyUrl(preset.id, preset.audio_url)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    copiedId === preset.id
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:bg-neutral-700 hover:text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700"
                  }`}
                >
                  {copiedId === preset.id ? (
                    <><Check className="w-4 h-4" /> コピーしました！</>
                  ) : (
                    <><Copy className="w-4 h-4" /> URLをコピー</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
