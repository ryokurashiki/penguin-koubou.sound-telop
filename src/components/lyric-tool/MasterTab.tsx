"use client";

import { useState, useRef } from "react";
import { ImportGroup, DEFAULT_GUIDE_IMAGE } from "@/lib/lyricToolTypes";
import { importCcfoliaZip, generateMergedCcfoliaZip } from "@/lib/ccfoliaExport";
import { 
  Upload, Trash2, Download, Loader2, Layers, 
  ChevronDown, ChevronRight, Edit3, Image as ImageIcon,
  ZoomIn, ZoomOut, Maximize, Crosshair
} from "lucide-react";

export default function MasterTab() {
  // --- Data State ---
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [outputFileName, setOutputFileName] = useState("master_ccfolia");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // --- UI State ---
  const [activeTab, setActiveTab] = useState<"manage" | "guide" | "export">("manage");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // --- Canvas & Guide State ---
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [guideImage, setGuideImage] = useState<string | null>(DEFAULT_GUIDE_IMAGE);
  const [guideOpacity, setGuideOpacity] = useState(0.3);
  const [guideScale, setGuideScale] = useState(1);
  const [guideX, setGuideX] = useState(0);
  const [guideY, setGuideY] = useState(0);

  // --- Dragging State (Group) ---
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffsetStart, setDragOffsetStart] = useState({ offsetX: 0, offsetY: 0 });

  // --- Dragging State (Canvas Panning) ---
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffsetStart, setPanOffsetStart] = useState({ x: 0, y: 0 });

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const guideImageRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // グループの色 (最大10色でローテーション)
  const groupColors = [
    "emerald", "blue", "purple", "amber", "rose",
    "cyan", "orange", "teal", "pink", "indigo"
  ];

  const getGroupColor = (index: number) => groupColors[index % groupColors.length];

  // --- Handlers: Data Management ---
  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    try {
      for (const file of Array.from(files)) {
        const result = await importCcfoliaZip(file);
        // 新しいグループの初期配置（少しずつずらす）
        const offset = groups.length * 50;
        
        const newGroup: ImportGroup = {
          id: Math.random().toString(36).substring(7),
          name: result.name,
          prefix: result.name.substring(0, 10),
          items: result.items,
          sourceFileName: file.name,
          offsetX: offset,
          offsetY: offset,
          width: result.width,
          height: result.height,
        };
        setGroups(prev => [...prev, newGroup]);
        setExpandedGroups(prev => new Set(prev).add(newGroup.id));
      }
    } catch (err) {
      console.error(err);
      alert(`ZIPの読み込みに失敗しました: ${(err as Error).message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const updateGroupName = (groupId: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
  };

  const updateGroupPrefix = (groupId: string, prefix: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, prefix } : g));
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // --- Handlers: Dragging ---
  const handleGroupMouseDown = (e: React.MouseEvent, group: ImportGroup) => {
    e.stopPropagation();
    setDraggingGroupId(group.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragOffsetStart({ offsetX: group.offsetX, offsetY: group.offsetY });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // キャンバス背景のドラッグ（パン移動）
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setPanOffsetStart({ x: panX, y: panY });
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (draggingGroupId) {
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;
      
      setGroups(prev => prev.map(g => g.id === draggingGroupId ? {
        ...g,
        offsetX: dragOffsetStart.offsetX + dx,
        offsetY: dragOffsetStart.offsetY + dy
      } : g));
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanX(panOffsetStart.x + dx);
      setPanY(panOffsetStart.y + dy);
    }
  };

  const handleGlobalMouseUp = () => {
    setDraggingGroupId(null);
    setIsPanning(false);
  };

  // --- Handlers: Export ---
  const handleExportMergedZip = async () => {
    if (groups.length === 0) {
      alert("出力するデータがありません。ZIPファイルをインポートしてください。");
      return;
    }
    setIsExporting(true);
    try {
      const blob = await generateMergedCcfoliaZip(groups, outputFileName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${outputFileName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("統合ZIP出力中にエラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  // --- Handlers: Guide Image ---
  const handleGuideUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setGuideImage(url);
    }
  };

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] gap-6" onMouseMove={handleGlobalMouseMove} onMouseUp={handleGlobalMouseUp} onMouseLeave={handleGlobalMouseUp}>
      
      {/* 左（中央）: 無限キャンバスエリア */}
      <div className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl relative overflow-hidden flex flex-col">
        {/* キャンバスヘッダー */}
        <div className="h-12 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-4 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">マスター統合キャンバス</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-500 ml-2">グループ/キャンバスをドラッグ</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setPanX(0); setPanY(0); }} 
              className="px-3 py-1.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" /> 
              XY中央に戻る
            </button>
            <div className="flex items-center gap-2 bg-white dark:bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <ZoomOut className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              <input 
                type="range" 
                min="0.1" 
                max="2" 
                step="0.05" 
                value={scale} 
                onChange={e => setScale(parseFloat(e.target.value))}
                className="w-24 accent-emerald-500"
              />
              <ZoomIn className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-xs text-neutral-700 dark:text-neutral-300 w-10 text-right">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(1)} className="ml-2 p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white rounded bg-neutral-100 dark:bg-neutral-800">
                <Maximize className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* パン可能なキャンバスエリア */}
        <div 
          ref={containerRef}
          className={`flex-1 overflow-hidden relative select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleCanvasMouseDown}
          style={{ 
            backgroundImage: "radial-gradient(#333 1px, transparent 1px)",
            backgroundSize: `${24 * scale}px ${24 * scale}px`,
            backgroundPosition: `calc(50% + ${panX}px) calc(50% + ${panY}px)`
          }}
        >
          {groups.length === 0 && !guideImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500 rounded-full flex items-center justify-center mx-auto">
                  <Layers className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white">キャンバスは空です</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">右側のパネルからZIPをインポートしてください。</p>
              </div>
            </div>
          )}

          {/* 原点の十字線 (スケールに影響されず常に一定のサイズ・太さで表示) */}
          <div 
            className="absolute pointer-events-none z-20 flex items-center justify-center"
            style={{ 
              left: `calc(50% + ${panX}px)`, 
              top: `calc(50% + ${panY}px)`,
            }}
          >
            <div className="absolute w-16 h-[2px] bg-red-500/80 -left-8 top-[-1px]" />
            <div className="absolute h-16 w-[2px] bg-red-500/80 left-[-1px] -top-8" />
            <div className="absolute w-4 h-4 border-2 border-red-500/80 rounded-full -left-2 -top-2 bg-white dark:bg-neutral-950/30" />
            <div className="absolute text-red-500/80 text-[10px] font-bold left-2 top-2">XY: 0,0</div>
          </div>

          {/* 描画原点コンテナ (画面中央 + パンオフセット) */}
          <div 
            className="absolute pointer-events-none"
            style={{ 
              left: `calc(50% + ${panX}px)`,
              top: `calc(50% + ${panY}px)`,
              transform: `scale(${scale})`,
            }}
          >
            {/* ガイド画像 (XY 0,0を中心とする) */}
            {guideImage && (
              <img 
                src={guideImage} 
                alt="Guide" 
                className="absolute pointer-events-none max-w-none"
                style={{ 
                  left: guideX, 
                  top: guideY, 
                  opacity: guideOpacity,
                  transform: `translate(-50%, -50%) scale(${guideScale})`,
                  zIndex: 0
                }} 
              />
            )}

            {/* グループ（バウンディングボックス） */}
            {groups.map((group, gIdx) => {
              const color = getGroupColor(gIdx);
              const isDragging = draggingGroupId === group.id;

              return (
                <div
                  key={group.id}
                  onMouseDown={(e) => handleGroupMouseDown(e, group)}
                  className={`absolute border-2 rounded-lg cursor-grab transition-colors z-10 pointer-events-auto ${
                    isDragging ? `border-${color}-500 bg-${color}-500/10 cursor-grabbing` : `border-${color}-500/50 hover:border-${color}-400 bg-transparent`
                  }`}
                  style={{
                    left: group.offsetX,
                    top: group.offsetY,
                    width: group.width,
                    height: group.height,
                  }}
                >
                  {/* グループラベル */}
                  <div className={`absolute -top-6 left-0 bg-${color}-600 text-neutral-900 dark:text-white text-[10px] px-2 py-0.5 rounded-t font-medium whitespace-nowrap shadow-md`}>
                    {group.name}
                  </div>

                  {/* アイテム（相対配置） */}
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: item.x,
                        top: item.y,
                        width: item.width,
                        height: item.height,
                      }}
                    >
                      {item.dataUrl ? (
                        <img src={item.dataUrl} alt={item.text} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full border border-dashed border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-500 dark:text-neutral-500 text-[10px]">
                          {item.text || "No Image"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右: 統合設定パネル */}
      <div className="w-80 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col shrink-0 overflow-hidden">
        {/* タブ */}
        <div className="flex bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          {[
            { id: "manage", label: "管理", icon: Layers },
            { id: "guide", label: "ガイド", icon: ImageIcon },
            { id: "export", label: "出力", icon: Download }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.id ? "text-emerald-400 border-b-2 border-emerald-500 bg-neutral-100 dark:bg-neutral-800/50" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:text-neutral-200"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* パネルコンテンツ */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          
          {/* --- 管理タブ --- */}
          {activeTab === "manage" && (
            <div className="space-y-6">
              <div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-900 dark:text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />読み込み中...</>
                  ) : (
                    <><Upload className="w-4 h-4" />ZIPを追加</>
                  )}
                </button>
                <input type="file" accept=".zip" multiple ref={fileInputRef} onChange={handleImportZip} className="hidden" />
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex justify-between">
                  <span>インポート済みグループ</span>
                  <span>{groups.length}件</span>
                </h3>

                {groups.length === 0 ? (
                  <div className="text-center text-xs text-neutral-600 py-4">グループはありません</div>
                ) : (
                  groups.map((group, gIdx) => {
                    const color = getGroupColor(gIdx);
                    const isExpanded = expandedGroups.has(group.id);
                    const isEditing = editingGroupId === group.id;
                    return (
                      <div key={group.id} className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 p-2.5">
                          <div className={`w-2 h-2 rounded-full shrink-0 bg-${color}-500`} />
                          <button onClick={() => toggleGroupExpand(group.id)} className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:text-white shrink-0">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <input
                                type="text"
                                value={group.name}
                                onChange={e => updateGroupName(group.id, e.target.value)}
                                onBlur={() => setEditingGroupId(null)}
                                onKeyDown={e => e.key === "Enter" && setEditingGroupId(null)}
                                autoFocus
                                className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-400 dark:border-neutral-600 rounded px-1.5 py-0.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
                              />
                            ) : (
                              <div className="text-xs text-neutral-800 dark:text-neutral-200 truncate">{group.name}</div>
                            )}
                          </div>
                          <button onClick={() => setEditingGroupId(group.id)} className="p-1 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:text-white">
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeGroup(group.id)} className="p-1 text-neutral-500 dark:text-neutral-500 hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-neutral-200 dark:border-neutral-800 p-2.5 space-y-2 bg-neutral-50 dark:bg-neutral-900/50">
                            <div>
                              <label className="text-[10px] text-neutral-600 dark:text-neutral-400 mb-1 block">出力プレフィックス</label>
                              <input
                                type="text"
                                value={group.prefix}
                                onChange={e => updateGroupPrefix(group.id, e.target.value)}
                                className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-500">元: {group.sourceFileName}</div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-500">座標: {Math.round(group.offsetX)}, {Math.round(group.offsetY)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* --- ガイドタブ --- */}
          {activeTab === "guide" && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">背景ガイド画像</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => guideImageRef.current?.click()}
                    className="flex-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-xs text-neutral-900 dark:text-white py-2 rounded transition-colors"
                  >
                    画像を選択
                  </button>
                  {guideImage && (
                    <button 
                      onClick={() => setGuideImage(null)}
                      className="bg-neutral-100 dark:bg-neutral-800 hover:bg-red-500/20 hover:text-red-400 text-xs text-neutral-600 dark:text-neutral-400 px-3 py-2 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input type="file" accept="image/*" ref={guideImageRef} onChange={handleGuideUpload} className="hidden" />
              </div>

              {guideImage && (
                <div className="space-y-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
                  <div>
                    <label className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">
                      <span>透明度</span>
                      <span>{Math.round(guideOpacity * 100)}%</span>
                    </label>
                    <input type="range" min="0" max="1" step="0.05" value={guideOpacity} onChange={e => setGuideOpacity(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                  </div>
                  <div>
                    <label className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">
                      <span>スケール</span>
                      <span>{guideScale.toFixed(2)}x</span>
                    </label>
                    <input type="range" min="0.1" max="3" step="0.05" value={guideScale} onChange={e => setGuideScale(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">X座標 (24px単位)</label>
                      <input type="number" step="24" value={guideX} onChange={e => setGuideX(parseInt(e.target.value) || 0)} className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs text-neutral-900 dark:text-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">Y座標 (24px単位)</label>
                      <input type="number" step="24" value={guideY} onChange={e => setGuideY(parseInt(e.target.value) || 0)} className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs text-neutral-900 dark:text-white" />
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-2">※ガイド画像は指定したXY座標を中心として配置されます。</p>
                </div>
              )}
            </div>
          )}

          {/* --- 出力タブ --- */}
          {activeTab === "export" && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">出力ファイル名</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={outputFileName}
                    onChange={e => setOutputFileName(e.target.value)}
                    className="flex-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-xs text-neutral-500 dark:text-neutral-500">.zip</span>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-2">
                  クリックアクションは各グループの元の設定を維持し、<br/>
                  「(元のテキスト)@プレフィックス_連番」<br/>
                  として重複しないよう自動調整されます。
                </p>
              </div>

              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5">
                <div className="flex justify-between"><span>グループ数</span><span className="text-neutral-900 dark:text-white">{groups.length}</span></div>
                <div className="flex justify-between"><span>総アイテム数</span><span className="text-neutral-900 dark:text-white">{totalItems}</span></div>
              </div>

              <button
                onClick={handleExportMergedZip}
                disabled={isExporting || totalItems === 0}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-900 dark:text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
                ) : (
                  <><Download className="w-4 h-4" />統合ZIPを出力</>
                )}
              </button>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
