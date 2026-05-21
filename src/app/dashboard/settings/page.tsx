"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Save, Loader2, User, Lock, Camera, Check, X } from "lucide-react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Save states
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Image crop states
  const [imgSrc, setImgSrc] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [showCropModal, setShowCropModal] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || data.username);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [router]);

  const handleSaveDisplayName = async () => {
    if (!profile || !displayName.trim()) return;
    setSavingName(true);
    setNameMsg(null);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", profile.id);

    if (error) {
      setNameMsg({ type: "error", text: "保存に失敗しました: " + error.message });
    } else {
      setNameMsg({ type: "success", text: "表示名を更新しました！" });
      window.dispatchEvent(new Event("profile-updated"));
    }
    setSavingName(false);
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword.length < 6) {
      setPwMsg({ type: "error", text: "パスワードは6文字以上にしてください。" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "確認用パスワードが一致しません。" });
      return;
    }
    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPwMsg({ type: "error", text: "変更に失敗しました: " + error.message });
    } else {
      setPwMsg({ type: "success", text: "パスワードを変更しました！" });
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPassword(false);
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImgSrc(reader.result?.toString() || "");
        setShowCropModal(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
    // Reset input to allow re-selecting same file
    e.target.value = "";
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const cropSize = Math.min(width, height);
    const x = (width - cropSize) / 2;
    const y = (height - cropSize) / 2;

    setCrop({
      unit: "px",
      x,
      y,
      width: cropSize,
      height: cropSize,
    });
  }, []);

  const getCroppedImg = async (image: HTMLImageElement, crop: PixelCrop): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const outputSize = 256;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context not available");

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      outputSize,
      outputSize
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas to blob failed"));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.85
      );
    });
  };

  const handleCropAndUpload = async () => {
    if (!imgRef.current || !completedCrop || !profile) return;
    setSavingAvatar(true);
    setAvatarMsg(null);
    setShowCropModal(false);

    try {
      const croppedBlob = await getCroppedImg(imgRef.current, completedCrop);
      const filePath = `${profile.id}/avatar.webp`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, {
          upsert: true,
          contentType: "image/webp",
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + "?t=" + Date.now();

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      setAvatarMsg({ type: "success", text: "アイコンを更新しました！" });
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err: any) {
      setAvatarMsg({ type: "error", text: "アップロードに失敗しました: " + err.message });
    } finally {
      setSavingAvatar(false);
      setImgSrc("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-neutral-500 dark:text-neutral-500 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium">設定を読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight mb-1">アカウント設定</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">プロフィールやパスワードを変更できます。</p>
      </div>

      {/* アイコン画像設定 */}
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-transparent opacity-40"></div>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2 mb-6">
          <Camera className="w-5 h-5 text-indigo-400" />
          プロフィール画像
        </h2>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-700 overflow-hidden flex items-center justify-center text-2xl font-bold text-neutral-500 dark:text-neutral-500 shrink-0 relative group">
            {savingAvatar ? (
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            ) : profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              profile?.username.charAt(0).toUpperCase()
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Camera className="w-6 h-6 text-neutral-900 dark:text-white" />
            </button>
          </div>
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={savingAvatar}
              className="bg-indigo-600 hover:bg-indigo-500 text-neutral-900 dark:text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              画像を選択
            </button>
            <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2">正方形にトリミングしてアップロードされます。</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onSelectFile}
              className="hidden"
            />
          </div>
        </div>
        {avatarMsg && (
          <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${avatarMsg.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {avatarMsg.text}
          </div>
        )}
      </div>

      {/* ユーザーID（読み取り専用） */}
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2 mb-6">
          <User className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          ユーザーID
        </h2>
        <input
          type="text"
          value={profile?.username || ""}
          disabled
          className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-500 dark:text-neutral-500 cursor-not-allowed font-mono text-sm"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2">ユーザーIDは変更できません。変更が必要な場合は管理者にお問い合わせください。</p>
      </div>

      {/* 表示名変更 */}
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2 mb-6">
          <User className="w-5 h-5 text-indigo-400" />
          表示名
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="表示名を入力"
            className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          <button
            onClick={handleSaveDisplayName}
            disabled={savingName || !displayName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-neutral-900 dark:text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
        {nameMsg && (
          <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${nameMsg.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {nameMsg.text}
          </div>
        )}
      </div>

      {/* パスワード変更 */}
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2 mb-6">
          <Lock className="w-5 h-5 text-amber-400" />
          パスワード変更
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-2">新しいパスワード</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6文字以上"
              className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-2">新しいパスワード（確認）</label>
            <input
              type="text"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力してください"
              className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword}
            className="bg-amber-600 hover:bg-amber-500 text-neutral-900 dark:text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            パスワードを変更
          </button>
        </div>
        {pwMsg && (
          <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${pwMsg.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {pwMsg.text}
          </div>
        )}
      </div>

      {/* 画像切り抜きモーダル */}
      {showCropModal && imgSrc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">画像をトリミング</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">正方形の範囲を選択してください。</p>
            <div className="flex justify-center mb-6 bg-white dark:bg-neutral-950 rounded-xl p-2 overflow-hidden max-h-[400px]">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  style={{ maxHeight: "380px" }}
                />
              </ReactCrop>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowCropModal(false); setImgSrc(""); }}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                キャンセル
              </button>
              <button
                onClick={handleCropAndUpload}
                disabled={!completedCrop}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-neutral-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                この範囲で保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
