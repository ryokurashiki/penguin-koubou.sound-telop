"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShieldAlert, Users, Key, Loader2, Plus, Pencil, Check, X, Construction } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  avatar_url: string | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  // Inline edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAndLoadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/");
          return;
        }

        const { data: myProfile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError || myProfile?.role !== "admin") {
          console.warn("Access denied: Admins only.");
          router.push("/dashboard");
          return;
        }

        // 管理者の場合、全ユーザーのプロフィールを取得
        const { data: allProfiles, error: usersError } = await supabase
          .from("profiles")
          .select("*")
          .order("username");

        if (usersError) throw usersError;
        setProfiles(allProfiles || []);

        // メンテナンスモードの状態を取得
        const { data: settingData } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "maintenance_mode")
          .single();
        if (settingData) {
          setMaintenanceMode(settingData.value === "true");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndLoadData();
  }, [router]);

  const startEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setEditValue(profile.username);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setSaveError(null);
  };

  const saveUsername = async (profileId: string) => {
    if (!editValue.trim()) {
      setSaveError("IDは空にできません。");
      return;
    }

    // Validate format (same as signup restrictions)
    if (!/^[a-zA-Z0-9._-]+$/.test(editValue.trim())) {
      setSaveError("IDには半角英数字と _ - . のみ使用できます。");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username: editValue.trim().toLowerCase() })
      .eq("id", profileId);

    if (error) {
      if (error.message.includes("unique") || error.code === "23505") {
        setSaveError("このIDは既に使用されています。");
      } else {
        setSaveError("保存に失敗しました: " + error.message);
      }
      return;
    }

    // Update local state
    setProfiles(profiles.map(p =>
      p.id === profileId ? { ...p, username: editValue.trim().toLowerCase() } : p
    ));
    setEditingId(null);
    setSaveError(null);
  };

  const toggleMaintenanceMode = async () => {
    setMaintenanceLoading(true);
    const newValue = !maintenanceMode;
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: String(newValue), updated_at: new Date().toISOString() })
        .eq("key", "maintenance_mode");
      if (error) throw error;
      setMaintenanceMode(newValue);
    } catch (err: any) {
      alert("メンテナンスモードの切替に失敗しました: " + err.message);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-neutral-500 dark:text-neutral-500 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <p className="text-sm font-medium">管理者権限を確認中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)]">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight mb-1">管理者ダッシュボード</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">システム全体の設定と利用者アカウントの管理を行います。</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium">
          データの取得に失敗しました: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 左側：利用者一覧 */}
        <div className="lg:col-span-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-transparent opacity-50"></div>
          
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <Users className="w-6 h-6 text-red-400" />
              登録利用者一覧
            </h2>
            <span className="bg-neutral-100 dark:bg-neutral-800 text-xs px-3 py-1.5 rounded-full text-neutral-700 dark:text-neutral-300 font-medium border border-neutral-300 dark:border-neutral-700 shadow-inner">
              全 {profiles.length} アカウント
            </span>
          </div>

          {saveError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
              {saveError}
            </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-neutral-500 dark:text-neutral-500 border-b border-neutral-200 dark:border-neutral-800/80 uppercase tracking-wider text-xs">
                <tr>
                  <th className="pb-4 font-semibold px-2 w-10"></th>
                  <th className="pb-4 font-semibold px-2">ユーザーID</th>
                  <th className="pb-4 font-semibold px-2">表示名</th>
                  <th className="pb-4 font-semibold px-2">権限ロール</th>
                  <th className="pb-4 font-semibold px-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {profiles.map((p) => (
                  <tr key={p.id} className="group hover:bg-neutral-100 dark:bg-neutral-800/30 transition-colors">
                    {/* Avatar */}
                    <td className="py-4 px-2">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden flex items-center justify-center text-xs font-bold text-neutral-500 dark:text-neutral-500 shrink-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          p.username.charAt(0).toUpperCase()
                        )}
                      </div>
                    </td>

                    {/* Username (editable) */}
                    <td className="py-4 px-2">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveUsername(p.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            className="bg-white dark:bg-neutral-950 border border-indigo-500 rounded px-2 py-1 text-neutral-900 dark:text-white text-sm font-mono focus:outline-none w-32"
                          />
                          <button onClick={() => saveUsername(p.id)} className="text-green-400 hover:text-green-300 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-medium text-neutral-900 dark:text-white font-mono">{p.username}</span>
                      )}
                    </td>

                    {/* Display name */}
                    <td className="py-4 px-2 text-neutral-600 dark:text-neutral-400">{p.display_name || "-"}</td>

                    {/* Role */}
                    <td className="py-4 px-2">
                      {p.role === "admin" ? (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                          ADMIN
                        </span>
                      ) : (
                        <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700 px-2.5 py-1 rounded-md text-xs font-medium">
                          USER
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-2">
                      {editingId !== p.id && (
                        <button
                          onClick={() => startEdit(p)}
                          className="text-neutral-600 hover:text-indigo-400 transition-colors p-1"
                          title="ユーザーIDを変更"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右側：招待コード・その他のアクション */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
             
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3 mb-4 relative z-10">
              <Key className="w-6 h-6 text-emerald-400" />
              招待コード発行
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed relative z-10">
              新しい利用者をシステムに招待するための、使い捨ての登録リンクを発行します。
            </p>
            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-neutral-900 dark:text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 relative z-10">
              <Plus className="w-5 h-5" />
              招待リンクを発行する
            </button>
            <p className="text-xs text-center text-neutral-500 dark:text-neutral-500 mt-4 relative z-10">※現在はプロトタイプ（UIのみ）です</p>
          </div>
          
          {/* メンテナンスモード */}
          <div className={`bg-neutral-50 dark:bg-neutral-900 border rounded-3xl p-8 shadow-2xl relative overflow-hidden ${
            maintenanceMode ? "border-amber-500/50" : "border-neutral-200 dark:border-neutral-800"
          }`}>
            {maintenanceMode && (
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"></div>
            )}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3 mb-4 relative z-10">
              <Construction className="w-6 h-6 text-amber-400" />
              メンテナンスモード
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed relative z-10">
              ONにすると、管理者以外のユーザーは全機能にアクセスできなくなります。
            </p>
            
            <div className="flex items-center justify-between bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${maintenanceMode ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "bg-neutral-400"}`}></div>
                <span className={`text-sm font-bold ${
                  maintenanceMode ? "text-amber-400" : "text-neutral-500 dark:text-neutral-500"
                }`}>
                  {maintenanceMode ? "メンテナンス中" : "通常稼働中"}
                </span>
              </div>
              <button
                onClick={toggleMaintenanceMode}
                disabled={maintenanceLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  maintenanceMode
                    ? "bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                    : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
                }`}
              >
                {maintenanceLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : maintenanceMode ? "OFFにする" : "ONにする"}
              </button>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800/50 rounded-3xl p-6 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              このページは <span className="font-mono text-red-400">role = 'admin'</span> のユーザーのみアクセス可能です。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
