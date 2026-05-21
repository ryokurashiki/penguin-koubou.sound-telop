"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogOut, Settings, ShieldAlert, Loader2, HelpCircle, X, Sun, Moon, Construction } from "lucide-react";

interface UserProfile {
  username: string;
  display_name: string | null;
  role: string;
  avatar_url: string | null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("username, display_name, role, avatar_url")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setDebugError(`Profile error: ${profileError.code} - ${profileError.message} | hint: ${profileError.hint} | userId: ${user.id}`);
      }
      if (data) setProfile(data);

      // メンテナンスモードのチェック
      const { data: settingData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .single();
      if (settingData?.value === "true" && data?.role !== "admin") {
        setIsMaintenanceMode(true);
      } else {
        setIsMaintenanceMode(false);
      }
    } catch (err: any) {
      setDebugError(`Catch error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();

    // 設定画面からの更新イベントを受け取ってヘッダーを即時更新する
    const handleProfileUpdated = () => fetchProfile();
    window.addEventListener("profile-updated", handleProfileUpdated);

    // テーマの初期化
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }

    // ヘルプモーダルのショートカット
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" || e.key === "F1") {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // カスタムイベントによるヘルプ開閉
    const handleToggleHelp = () => setShowHelp(prev => !prev);
    window.addEventListener("toggle-help", handleToggleHelp);

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdated);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("toggle-help", handleToggleHelp);
    };
  }, [router]);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      window.dispatchEvent(new CustomEvent("theme-changed", { detail: next }));
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const isAdmin = profile?.role === "admin";
  const isAdminPage = pathname?.startsWith("/dashboard/admin");

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 font-sans selection:bg-indigo-500/30">
      {/* デバッグ用エラー表示 */}
      {debugError && (
        <div className="bg-red-900/80 text-red-200 text-xs p-3 font-mono break-all">
          🐛 DEBUG: {debugError}
        </div>
      )}

      <header className={`border-b sticky top-0 z-50 backdrop-blur-md ${
        isAdmin && isAdminPage
          ? "bg-neutral-50 dark:bg-neutral-900/50 border-amber-500/30"
          : "bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800"
      }`}>
        {/* 管理者モード時のアクセントライン */}
        {isAdmin && isAdminPage && (
          <div className="h-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"></div>
        )}
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-bold text-xl tracking-tight text-neutral-900 dark:text-white hover:text-indigo-400 transition-colors">
              Sound Telop
            </Link>
            {isAdmin && isAdminPage && (
              <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                👑 管理者モード
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-neutral-500 dark:text-neutral-500" />
            ) : profile && (
              <>
                {/* アバター */}
                <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-400 shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    profile.username.charAt(0).toUpperCase()
                  )}
                </div>

                <span className="text-sm text-neutral-700 dark:text-neutral-300 font-medium hidden sm:inline">
                  {profile.display_name || profile.username}
                </span>

                {/* 管理者：管理画面リンク */}
                {isAdmin && !isAdminPage && (
                  <Link
                    href="/dashboard/admin"
                    className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-amber-400 transition-colors"
                    title="管理者ダッシュボード"
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </Link>
                )}

                {/* テーマ切替 */}
                <button
                  onClick={toggleTheme}
                  className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-amber-400 transition-colors"
                  title="テーマの切り替え"
                >
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* ヘルプ */}
                <button
                  onClick={() => setShowHelp(true)}
                  className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 transition-colors"
                  title="ショートカットとヘルプ (?)"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                {/* 設定 */}
                <Link
                  href="/dashboard/settings"
                  className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 transition-colors"
                  title="アカウント設定"
                >
                  <Settings className="w-4 h-4" />
                </Link>

                {/* ログアウト */}
                <button
                  onClick={handleLogout}
                  className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-red-400 transition-colors"
                  title="ログアウト"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {isMaintenanceMode ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="p-6 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 mb-6">
              <Construction className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">メンテナンス中</h2>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm max-w-md leading-relaxed">
              現在メンテナンスを実施中のため、一時的にご利用いただけません。<br/>
              しばらくお待ちいただき、再度アクセスしてください。
            </p>
          </div>
        ) : (
          children
        )}
      </main>

      {/* ヘルプモーダル */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 text-neutral-800 dark:text-neutral-200">
          <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle className="w-5 h-5 text-indigo-400" /> 操作ヘルプ・ショートカット</h2>
              <button onClick={() => setShowHelp(false)} className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white rounded-lg hover:bg-neutral-100 dark:bg-neutral-800 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 text-sm">
              <section>
                <h3 className="font-semibold text-emerald-400 mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">共通のショートカット</h3>
                <ul className="space-y-2 text-neutral-700 dark:text-neutral-300">
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">ヘルプを開く/閉じる</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">?</kbd> または <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">F1</kbd></span></li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-emerald-400 mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">音声切り分けツール</h3>
                <ul className="space-y-2 text-neutral-700 dark:text-neutral-300">
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">再生 / 一時停止</span> <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Space</kbd></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">操作を元に戻す</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Z</kbd></span></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">操作をやり直す</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Y</kbd></span></li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-emerald-400 mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">歌詞テロップ生成ツール</h3>
                <ul className="space-y-2 text-neutral-700 dark:text-neutral-300">
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">ルビ記号を挿入</span> <span>選択範囲を囲んで</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Enter</kbd></span></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">段落区切り</span> <span>一括生成時、テキストの</span> <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs font-mono">空行</span></li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-emerald-400 mb-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">レイアウト配置モード</h3>
                <ul className="space-y-2 text-neutral-700 dark:text-neutral-300">
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">元に戻す</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Z</kbd></span></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">やり直し</span> <span className="flex items-center gap-1"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Shift</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Z</kbd> または <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Ctrl</kbd>+<kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Y</kbd></span></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">アイテムを削除</span> <span className="flex items-center gap-1"><span>選択して</span> <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Delete</kbd> または <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">Backspace</kbd></span></li>
                  <li className="flex justify-between items-center"><span className="text-neutral-600 dark:text-neutral-400">改行 / 解除</span> <span className="flex items-center gap-1"><span>選択して</span> <kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-xs border border-neutral-300 dark:border-neutral-700">B</kbd></span></li>
                </ul>
              </section>
            </div>
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex justify-end">
              <button onClick={() => setShowHelp(false)} className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white rounded-lg text-sm font-medium transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
