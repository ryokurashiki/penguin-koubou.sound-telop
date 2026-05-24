"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogIn, UserPlus, Info, Construction } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const forceAdminLogin = searchParams.get("admin") === "true";

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    const checkMaintenance = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .single();
      if (data?.value === "true") {
        setMaintenanceMode(true);
      }
    };
    checkMaintenance();
  }, []);

  const getDummyEmail = (userId: string) => `${userId}@dummy.local`;

  const handleAuth = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const email = getDummyEmail(id);

    try {
      const redirectBasedOnRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          
          if (profile?.role === 'admin') {
            router.push("/dashboard/admin");
            return;
          }
        }
        router.push("/dashboard");
      };

      if (isSignUp) {
        if (!inviteToken) {
          throw new Error("招待URLからのアクセスのみ新規登録が可能です。");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              invite_code: inviteToken
            }
          }
        });
        if (error) throw error;
        await redirectBasedOnRole();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await redirectBasedOnRole();
      }
    } catch (err: any) {
      if (err.message.includes("Invalid or already used invite code")) {
        setError("この招待コードは無効または既に使用されています。");
      } else if (err.message.includes("Invite code is required")) {
        setError("新規登録には有効な招待コードが必要です。");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col justify-center items-center p-4 text-neutral-800 dark:text-neutral-200 font-sans selection:bg-indigo-500/30">
      {maintenanceMode && !forceAdminLogin ? (
        <div className="flex flex-col items-center justify-center text-center max-w-md animate-in fade-in zoom-in duration-500">
          <div className="p-6 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 mb-6 shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)]">
            <Construction className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4">メンテナンス中</h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed mb-8">
            現在、システムアップデートのためメンテナンスを実施しております。<br/>
            終了までしばらくお待ちください。
          </p>
          <div className="text-xs text-neutral-500 dark:text-neutral-500">
            Sound Telop
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {maintenanceMode && forceAdminLogin && (
            <div className="absolute top-0 left-0 w-full bg-amber-500 text-amber-950 text-xs font-bold py-2 text-center z-50 flex items-center justify-center gap-1.5">
              <Construction className="w-3.5 h-3.5" />
              メンテナンス中（管理者ログインモード）
            </div>
          )}
          
          {/* Decorative background glow */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="mb-8 text-center relative z-10">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">Sound Telop</h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">次世代プラットフォームへようこそ</p>
        </div>

        <form className="space-y-6 relative z-10">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2" htmlFor="id">
              ユーザーID
              <div className="group relative flex items-center">
                <Info className="w-4 h-4 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 cursor-help transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 text-xs text-neutral-700 dark:text-neutral-300 pointer-events-none">
                  <p className="mb-1 font-medium text-neutral-900 dark:text-white">使用可能な文字</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>半角英数字（a-z, A-Z, 0-9）</li>
                    <li>一部の記号（ _ - . ）</li>
                  </ul>
                  <p className="mt-2 text-neutral-600 dark:text-neutral-400 text-[10px]">※大文字は自動的に小文字へ変換されます。<br/>※日本語やスペースは使用できません。</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800"></div>
                </div>
              </div>
            </label>
            <input
              id="id"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-neutral-600"
              placeholder="Enter your ID"
              required
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2" htmlFor="password">
              パスワード
              <div className="group relative flex items-center">
                <Info className="w-4 h-4 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 cursor-help transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 text-xs text-neutral-700 dark:text-neutral-300 pointer-events-none">
                  <p className="font-medium text-neutral-900 dark:text-white">パスワードの条件</p>
                  <p className="mt-1 leading-relaxed">6文字以上の半角英数字・記号を入力してください。</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800"></div>
                </div>
              </div>
            </label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-neutral-600"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              onClick={(e) => handleAuth(e, false)}
              disabled={loading || !id || !password}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-neutral-900 dark:text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
            >
              <LogIn className="w-4 h-4" />
              {loading ? "処理中..." : "ログイン"}
            </button>
            
            {inviteToken && (
              <button
                type="button"
                onClick={(e) => handleAuth(e, true)}
                disabled={loading || !id || !password}
                className="w-full flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white font-medium py-3 px-4 rounded-lg transition-colors border border-neutral-300 dark:border-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" />
                招待URLで新規登録
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center"><p className="text-neutral-500 dark:text-neutral-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
