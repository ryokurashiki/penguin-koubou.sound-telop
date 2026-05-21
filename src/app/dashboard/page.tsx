"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Scissors, MessageSquare, Loader2, Library, MonitorPlay } from "lucide-react";

export default function DashboardPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", user.id)
          .single();
        if (data) setUsername(data.username);
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  return (
    <div className="space-y-8">
      {/* ユーザー情報 */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">ツール一覧</h1>
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">
            あなたのユーザーID: <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded text-sm">{username}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 音声切り分けツール */}
        <Link href="/dashboard/audio-tool" className="group block">
          <div className="h-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-all hover:border-indigo-500/50 hover:bg-neutral-100 dark:bg-neutral-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Scissors className="w-32 h-32 text-indigo-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Scissors className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2 group-hover:text-indigo-400 transition-colors">
                音声切り分けツール
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                ブラウザ上で重い音声データを処理し、必要な部分だけを軽量なMP3として切り出して保存します。サーバーへの負担ゼロでサクサク動作します。
              </p>
            </div>
          </div>
        </Link>

        {/* 保存済みクリップ */}
        <Link href="/dashboard/presets" className="group block">
          <div className="h-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-all hover:border-orange-500/50 hover:bg-neutral-100 dark:bg-neutral-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Library className="w-32 h-32 text-orange-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-orange-500/10 text-orange-400 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Library className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2 group-hover:text-orange-400 transition-colors">
                保存済みクリップ
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                切り分けた音声データ（プリセット）の一覧を確認し、再生やURLのコピー、不要なデータの削除を行います。
              </p>
            </div>
          </div>
        </Link>

        {/* チャットルーム (Coming Soon) */}
        <div className="group block cursor-not-allowed opacity-60">
          <div className="h-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <MessageSquare className="w-32 h-32 text-neutral-500 dark:text-neutral-500" />
            </div>
            <div className="absolute top-4 right-4 bg-neutral-100 dark:bg-neutral-800 text-xs font-medium px-2 py-1 rounded text-neutral-600 dark:text-neutral-400">
              Coming Soon
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-xl flex items-center justify-center mb-6">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                チャットルーム
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                セッションを行うためのチャットツールです。ダイスボットやキャラクターシートとの連携機能が実装される予定です。
              </p>
            </div>
          </div>
        </div>

        {/* 歌詞テロップ生成・配置ツール */}
        <Link href="/dashboard/lyric-tool" className="group block">
          <div className="h-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-all hover:border-emerald-500/50 hover:bg-neutral-100 dark:bg-neutral-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <MonitorPlay className="w-32 h-32 text-emerald-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MonitorPlay className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2 group-hover:text-emerald-400 transition-colors">
                歌詞テロップ生成・配置ツール
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                テキストと音声を元に歌詞テロップ画像を生成し、ココフォリア用ZIPデータを出力するためのサポートツールです。
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
