"use client";

import { useState } from "react";
import { MonitorPlay, Image as ImageIcon, Layout, Layers, HelpCircle } from "lucide-react";
import ImageGenerationTab from "@/components/lyric-tool/ImageGenerationTab";
import LayoutTab from "@/components/lyric-tool/LayoutTab";
import MasterTab from "@/components/lyric-tool/MasterTab";
import { LayoutItem } from "@/lib/lyricToolTypes";

type TabType = "generate" | "layout" | "master";

export default function LyricToolPage() {
  const [activeTab, setActiveTab] = useState<TabType>("generate");
  const [songTitle, setSongTitle] = useState("");
  const [queue, setQueue] = useState<LayoutItem[]>([]);

  const tabs = [
    { id: "generate", label: "画像生成モード", icon: ImageIcon },
    { id: "layout", label: "レイアウト配置モード", icon: Layout },
    { id: "master", label: "マスター統合モード", icon: Layers },
  ] as const;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-emerald-500" />
            歌詞テロップ生成・配置ツール
          </h1>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-help"))}
            className="flex items-center gap-1.5 text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 px-3 py-1.5 rounded-full transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            操作ヘルプ
          </button>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 text-sm">
          ココフォリア用の歌詞テロップ画像と配置データ（ZIP）を作成するためのサポートツールです。
        </p>
      </div>

      {/* タブナビゲーション */}
      <div className="flex bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-1.5 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all min-w-[200px] ${
                isActive
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : ""}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* メインコンテンツ */}
      <div className="relative">
        {/* 画像生成モード */}
        <div className={activeTab === "generate" ? "block" : "hidden"}>
          <ImageGenerationTab
            songTitle={songTitle}
            setSongTitle={setSongTitle}
            queue={queue}
            setQueue={setQueue}
          />
        </div>

        {/* レイアウト配置モード */}
        <div className={activeTab === "layout" ? "block" : "hidden"}>
          <LayoutTab items={queue} setItems={setQueue} songTitle={songTitle} setSongTitle={setSongTitle} />
        </div>

        {/* マスター統合モード */}
        <div className={activeTab === "master" ? "block" : "hidden"}>
          <MasterTab />
        </div>
      </div>
    </div>
  );
}
