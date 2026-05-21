"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { LayoutItem } from "@/lib/lyricToolTypes";
import { generateCcfoliaZip } from "@/lib/ccfoliaExport";
import { AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Undo2, Redo2, Settings2, Trash2, WrapText, Space, Maximize, Download, Loader2, FileArchive, Palette } from "lucide-react";
import JSZip from "jszip";

interface Props {
  items: LayoutItem[];
  setItems: React.Dispatch<React.SetStateAction<LayoutItem[]>>;
  songTitle: string;
  setSongTitle: (val: string) => void;
}

interface PositionedItem extends LayoutItem {
  finalX: number;
  finalY: number;
}

interface PositionedLine {
  items: PositionedItem[];
  width: number;
  height: number;
  x: number;
  y: number;
}

interface PositionedParagraph {
  id: string;
  lines: PositionedLine[];
  x: number;
  y: number;
  width: number;
  height: number;
  align: "left" | "center" | "right";
  itemIds: Set<string>;
}

export default function LayoutTab({ items, setItems, songTitle, setSongTitle }: Props) {
  // --- Settings State ---
  const [gapX, setGapX] = useState(20);
  const [gapY, setGapY] = useState(30);
  const maxWidth = 1000; // 固定値
  const [isExporting, setIsExporting] = useState(false);
  
  const [guideType, setGuideType] = useState<"image" | "color" | "gradient">("image");
  const [guideColor, setGuideColor] = useState("#1a1a1a");
  const [guideGradientStart, setGuideGradientStart] = useState("#0f172a");
  const [guideGradientEnd, setGuideGradientEnd] = useState("#334155");
  
  const [guideImage, setGuideImage] = useState<string | null>(null);
  const [guideOpacity, setGuideOpacity] = useState(0.5);
  const [guideX, setGuideX] = useState(0);
  const [guideY, setGuideY] = useState(0);
  const [guideScale, setGuideScale] = useState(1);

  // --- Interaction State ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipImportRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const guideImageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);

  // --- History State ---
  const [history, setHistory] = useState<LayoutItem[][]>([items]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const saveHistory = useCallback((newItems: LayoutItem[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newItems);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 50));
    setItems(newItems);
  }, [historyIndex, setItems]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setItems(history[historyIndex - 1]);
    }
  }, [historyIndex, history, setItems]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setItems(history[historyIndex + 1]);
    }
  }, [historyIndex, history, setItems]);

  // --- Layout Engine ---
  const layoutData = useMemo(() => {
    let currentY = 0;
    const positionedParagraphs: PositionedParagraph[] = [];

    const rawParagraphs: LayoutItem[][] = [];
    let currentPara: LayoutItem[] = [];
    items.forEach(item => {
      currentPara.push(item);
      if (item.manualBreak) {
        rawParagraphs.push(currentPara);
        currentPara = [];
      }
    });
    if (currentPara.length > 0) rawParagraphs.push(currentPara);

    let lastAlign: "left" | "center" | "right" = "center";

    rawParagraphs.forEach((para, pIdx) => {
      const align = para[0]?.alignOverride || lastAlign;
      lastAlign = align; // 次の段落へ引き継ぐ

      let lines: { items: LayoutItem[], width: number, height: number }[] = [];
      let currentLine: LayoutItem[] = [];
      let currentLineWidth = 0;
      let currentLineHeight = 0;

      para.forEach(item => {
        if (currentLine.length > 0 && currentLineWidth + gapX + item.width > maxWidth) {
          lines.push({ items: currentLine, width: currentLineWidth, height: currentLineHeight });
          currentLine = [item];
          currentLineWidth = item.width;
          currentLineHeight = item.height;
        } else {
          currentLine.push(item);
          currentLineWidth += currentLine.length === 1 ? item.width : gapX + item.width;
          currentLineHeight = Math.max(currentLineHeight, item.height);
        }
      });
      if (currentLine.length > 0) {
        lines.push({ items: currentLine, width: currentLineWidth, height: currentLineHeight });
      }

      const positionedLines: PositionedLine[] = [];
      let paraMinX = maxWidth;
      let paraMaxX = 0;
      const paraStartY = currentY;

      lines.forEach(line => {
        let startX = 0;
        if (align === "center") startX = (maxWidth - line.width) / 2;
        if (align === "right") startX = Math.max(0, maxWidth - line.width);

        paraMinX = Math.min(paraMinX, startX);
        paraMaxX = Math.max(paraMaxX, startX + line.width);

        const positionedItems: PositionedItem[] = [];
        let cx = startX;
        line.items.forEach(item => {
          positionedItems.push({
            ...item,
            finalX: cx,
            finalY: currentY,
          });
          cx += item.width + gapX;
        });

        positionedLines.push({
          items: positionedItems,
          width: line.width,
          height: line.height,
          x: startX,
          y: currentY,
        });

        currentY += line.height + gapY;
      });

      positionedParagraphs.push({
        id: `para-${pIdx}`,
        lines: positionedLines,
        x: paraMinX,
        y: paraStartY,
        width: paraMaxX - paraMinX,
        height: Math.max(0, currentY - gapY - paraStartY),
        align,
        itemIds: new Set(para.map(i => i.id))
      });
    });

    return positionedParagraphs;
  }, [items, gapX, gapY, maxWidth]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (e.key === "y") {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if (!selectedId) return;

      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleManualBreak(selectedId);
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const newItems = items.filter(item => item.id !== selectedId);
        saveHistory(newItems);
        setSelectedId(null);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, items, saveHistory, handleUndo, handleRedo]);

  // --- Auto Scaling ---
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const availableWidth = entry.contentRect.width - 48; // padding consideration
        const newScale = Math.min(1, availableWidth / 1000);
        setScale(newScale);
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // --- Handlers ---
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedId(null);
    }
  };

  const toggleManualBreak = (id: string) => {
    const newItems = items.map(item => 
      item.id === id ? { ...item, manualBreak: !item.manualBreak } : item
    );
    saveHistory(newItems);
  };

  const applyAlignmentOverride = (align: "left" | "center" | "right") => {
    if (!selectedId) return;
    
    const selectedPara = layoutData.find(para => para.itemIds.has(selectedId));
    if (!selectedPara) return;

    const firstItemId = Array.from(selectedPara.itemIds)[0];
    
    const newItems = items.map(item => 
      item.id === firstItemId ? { ...item, alignOverride: align } : item
    );
    saveHistory(newItems);
  };

  const addSpacer = () => {
    const spacer: LayoutItem = {
      id: Math.random().toString(36).substring(7),
      text: "空白スペーサー",
      startIndex: 9999, // 追加順に関わらず最後にしたいが、実際の並び順はitemsの末尾
      dataUrl: "",
      width: 100,
      height: 50,
      isSpacer: true,
      manualBreak: false
    };
    
    let newItems = [...items];
    if (selectedId) {
      const idx = newItems.findIndex(i => i.id === selectedId);
      if (idx !== -1) {
        newItems.splice(idx + 1, 0, spacer);
      } else {
        newItems.push(spacer);
      }
    } else {
      newItems.push(spacer);
    }
    saveHistory(newItems);
    setSelectedId(spacer.id);
  };

  const updateSpacerWidth = (id: string, newWidth: number) => {
    const newItems = items.map(item => 
      item.id === id && item.isSpacer ? { ...item, width: newWidth } : item
    );
    // history保存は頻繁に呼ばれると邪魔なので、とりあえず状態だけ更新し、マウスアップ時などにhistory保存するのが理想。
    // 今回はシンプルに毎回更新するが、遅延やヒストリー肥大化に注意
    setItems(newItems);
  };
  
  const saveSpacerHistory = () => {
    saveHistory(items);
  };

  const handleGuideUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setGuideImage(ev.target?.result as string);
        setGuideX(0);
        setGuideY(0);
        setGuideScale(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const fitGuideToWidth = () => {
    if (guideImageRef.current) {
      const imageNaturalWidth = guideImageRef.current.naturalWidth;
      if (imageNaturalWidth > 0) {
        setGuideScale(1000 / imageNaturalWidth);
        setGuideX(0);
      }
    }
  };

  // --- ZIP Export ---
  const handleExportZip = async () => {
    const realItems = items.filter(i => !i.isSpacer);
    if (realItems.length === 0) {
      alert("出力する画像がありません。画像生成モードで画像を追加してください。");
      return;
    }
    setIsExporting(true);
    try {
      const blob = await generateCcfoliaZip(items, songTitle, gapX, gapY);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${songTitle.trim() || "Untitled"}_ccfolia.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("ZIP出力中にエラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  // --- ZIP Import ---
  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      const metaFile = loadedZip.file("__lyric_meta.json");
      if (metaFile) {
        const metaText = await metaFile.async("string");
        const meta = JSON.parse(metaText);
        
        if (meta.items) {
          setItems(meta.items);
          saveHistory(meta.items);
          if (meta.songTitle) setSongTitle(meta.songTitle);
          if (meta.gapX !== undefined) setGapX(meta.gapX);
          if (meta.gapY !== undefined) setGapY(meta.gapY);
          alert("ZIPからレイアウトデータを復元しました。");
          return;
        }
      }
      alert("このZIPにはレイアウト情報(__lyric_meta.json)が含まれていません。\nCCFOLIAデータのみが格納されている可能性があります。");
    } catch (err) {
      console.error(err);
      alert("ZIPファイルの読み込みに失敗しました。");
    } finally {
      if (zipImportRef.current) zipImportRef.current.value = "";
    }
  };

  const selectedItemData = items.find(i => i.id === selectedId);
  const selectedParaAlign = selectedId 
    ? layoutData.find(para => para.itemIds.has(selectedId))?.align || "center" 
    : null;

  const maxContentHeight = layoutData.length > 0 
    ? layoutData[layoutData.length - 1].y + layoutData[layoutData.length - 1].height 
    : 0;
  const canvasHeight = Math.max(800, maxContentHeight + 200);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] gap-6">
      
      {/* 仮想キャンバスエリア */}
      <div 
        ref={containerRef}
        className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl relative overflow-y-auto overflow-x-hidden custom-scrollbar p-6"
        onClick={handleCanvasClick}
      >
        <div style={{ width: 1000 * scale, height: canvasHeight * scale, margin: "0 auto" }} onClick={handleCanvasClick}>
          <div 
            style={{ width: 1000, height: canvasHeight, transform: `scale(${scale})`, transformOrigin: "top left" }} 
            className="relative"
            onClick={handleCanvasClick}
          >
            {/* Checkered background behind everything */}
            <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden" style={{
              backgroundImage: "linear-gradient(45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(-45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(45deg, #b8b8b8 75%, #9a9a9a 75%), linear-gradient(-45deg, #b8b8b8 75%, #9a9a9a 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              width: maxWidth
            }} />
            
            {/* Guide Color / Gradient */}
            {(guideType === "color" || guideType === "gradient") && (
              <div 
                className="absolute top-0 left-0 pointer-events-none rounded-lg transition-colors"
                style={{
                  width: maxWidth,
                  height: canvasHeight,
                  opacity: guideOpacity,
                  background: guideType === "color" 
                    ? guideColor 
                    : `linear-gradient(45deg, ${guideGradientStart}, ${guideGradientEnd})`
                }}
              />
            )}

            {/* Guide Image */}
            {guideType === "image" && guideImage && (
              <div 
                className="absolute top-0 left-0 pointer-events-none origin-top-left transition-transform"
                style={{ 
                  opacity: guideOpacity,
                  transform: `translate(${guideX}px, ${guideY}px) scale(${guideScale})`
                }}
              >
                <img ref={guideImageRef} src={guideImage} alt="Guide" className="max-w-none" />
              </div>
            )}

            {/* Render Items */}
            {layoutData.map(para => {
              const isSelectedPara = selectedId && para.itemIds.has(selectedId);
              return (
                <div key={para.id}>
                  {/* Paragraph Highlight Background */}
                  {isSelectedPara && (
                    <div 
                      className="absolute bg-white/5 border border-white/10 rounded-lg pointer-events-none transition-all duration-200 ease-out z-0"
                      style={{
                        left: para.x - 12,
                        top: para.y - 12,
                        width: para.width + 24,
                        height: para.height + 24,
                      }}
                    />
                  )}

                  {/* Items */}
                  {para.lines.map(line => 
                    line.items.map(item => {
                      const isSelected = selectedId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(item.id);
                          }}
                          className={`absolute cursor-pointer select-none pointer-events-auto transition-all duration-200 ease-out ${
                            isSelected ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-neutral-950 z-10 scale-[1.02]" : "z-0 hover:ring-1 hover:ring-emerald-500/50"
                          } ${item.isSpacer ? "border-2 border-dashed border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800/30 backdrop-blur-sm" : ""}`}
                          style={{
                            left: item.finalX,
                            top: item.finalY,
                            width: item.width,
                            height: item.height,
                            boxShadow: isSelected && !item.isSpacer ? "0 4px 12px rgba(0,0,0,0.5)" : "none"
                          }}
                        >
                          {item.isSpacer ? (
                            <div className="w-full h-full flex items-center justify-center text-neutral-500 dark:text-neutral-500 text-xs pointer-events-none">
                              [空白]
                            </div>
                          ) : (
                            item.dataUrl ? <img src={item.dataUrl} alt={item.text} className="w-full h-full object-contain pointer-events-none" /> : null
                          )}
                          
                          {item.manualBreak && (
                            <div className="absolute -right-3 -bottom-3 bg-emerald-600 text-neutral-900 dark:text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg pointer-events-none flex items-center gap-1">
                              <WrapText className="w-3 h-3" />
                              改行
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* Max Width Line */}
            <div 
              className="absolute top-0 bottom-0 border-r border-dashed border-red-500/30 pointer-events-none z-0"
              style={{ left: 0, width: maxWidth }}
            >
              <div className="absolute top-4 right-2 text-red-500/50 text-xs">Max Width ({maxWidth}px)</div>
            </div>
          </div>
        </div>
      </div>

      {/* 設定パネル */}
      <div className="w-80 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col shrink-0 overflow-y-auto custom-scrollbar space-y-6">
        
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-500" />
            配置設定
          </h2>
          <div className="flex gap-2">
            <button onClick={handleUndo} disabled={historyIndex === 0} className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white hover:bg-neutral-100 dark:bg-neutral-800 rounded transition-colors disabled:opacity-30">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white hover:bg-neutral-100 dark:bg-neutral-800 rounded transition-colors disabled:opacity-30">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          onClick={addSpacer}
          className="w-full flex items-center justify-center gap-2 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 py-2 rounded-lg transition-colors"
        >
          <Space className="w-4 h-4" />
          空白（スペーサー）を追加
        </button>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800 pb-2">全体ルール</h3>
          <div>
            <label className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              <span>画像の間隔 (X)</span>
              <span>{gapX}px</span>
            </label>
            <input type="range" min="0" max="100" value={gapX} onChange={e => setGapX(Number(e.target.value))} className="w-full accent-emerald-500" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              <span>行の間隔 (Y)</span>
              <span>{gapY}px</span>
            </label>
            <input type="range" min="0" max="100" value={gapY} onChange={e => setGapY(Number(e.target.value))} className="w-full accent-emerald-500" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800 pb-2">選択中のアイテム</h3>
          {!selectedId || !selectedItemData ? (
            <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
                キャンバス上のアイテムをクリックすると<br/>個別の設定を行えます
              </p>
            </div>
          ) : (
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl p-4 space-y-4 shadow-lg shadow-black/20">
              <div className="text-sm text-neutral-800 dark:text-neutral-200 font-medium truncate" title={selectedItemData.text}>
                {selectedItemData.isSpacer ? "空白スペーサー" : `「${selectedItemData.text}」`}
              </div>
              
              {selectedItemData.isSpacer && (
                <div>
                  <label className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                    <span>空白の幅</span>
                    <span>{selectedItemData.width}px</span>
                  </label>
                  <input 
                    type="range" 
                    min="10" 
                    max="500" 
                    value={selectedItemData.width} 
                    onChange={e => updateSpacerWidth(selectedItemData.id, Number(e.target.value))}
                    onMouseUp={saveSpacerHistory}
                    onTouchEnd={saveSpacerHistory}
                    className="w-full accent-emerald-500" 
                  />
                </div>
              )}

              <div>
                <button 
                  onClick={() => toggleManualBreak(selectedId)}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    selectedItemData.manualBreak 
                      ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600/30" 
                      : "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:bg-neutral-700 hover:text-neutral-900 dark:text-white"
                  }`}
                >
                  <WrapText className="w-4 h-4" />
                  {selectedItemData.manualBreak ? "改行を解除する (B)" : "この直後で改行する (B)"}
                </button>
              </div>

              <div>
                <label className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                  <span>この段落の行揃え</span>
                </label>
                <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded p-1">
                  <button onClick={() => applyAlignmentOverride("left")} className={`flex-1 flex justify-center py-1.5 rounded transition-colors ${selectedParaAlign === "left" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:bg-neutral-800"}`}><AlignLeft className="w-4 h-4" /></button>
                  <button onClick={() => applyAlignmentOverride("center")} className={`flex-1 flex justify-center py-1.5 rounded transition-colors ${selectedParaAlign === "center" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:bg-neutral-800"}`}><AlignCenter className="w-4 h-4" /></button>
                  <button onClick={() => applyAlignmentOverride("right")} className={`flex-1 flex justify-center py-1.5 rounded transition-colors ${selectedParaAlign === "right" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:bg-neutral-800"}`}><AlignRight className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button 
                  onClick={() => {
                    const newItems = items.filter(item => item.id !== selectedId);
                    saveHistory(newItems);
                    setSelectedId(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  削除 (Delete)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">背景ガイド</h3>
            <div className="flex bg-neutral-50 dark:bg-neutral-900 rounded p-0.5">
              <button 
                onClick={() => setGuideType("image")} 
                className={`p-1 rounded ${guideType === "image" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"}`}
                title="画像"
              ><ImageIcon className="w-4 h-4" /></button>
              <button 
                onClick={() => setGuideType("color")} 
                className={`p-1 rounded ${guideType === "color" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"}`}
                title="単色"
              ><Palette className="w-4 h-4" /></button>
              <button 
                onClick={() => setGuideType("gradient")} 
                className={`p-1 rounded ${guideType === "gradient" ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"}`}
                title="グラデーション"
              ><div className="w-4 h-4 rounded-full bg-gradient-to-tr from-black to-white" /></button>
            </div>
          </div>

          <div>
            <label className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">
              <span>透明度</span>
              <span>{Math.round(guideOpacity * 100)}%</span>
            </label>
            <input type="range" min="0" max="1" step="0.05" value={guideOpacity} onChange={e => setGuideOpacity(Number(e.target.value))} className="w-full accent-emerald-500 h-1" />
          </div>

          {guideType === "image" && (
            <div className="space-y-3 pt-2">
              <div>
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 py-2 rounded-lg transition-colors">
                  <ImageIcon className="w-4 h-4" />画像読み込み
                </button>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleGuideUpload} className="hidden" />
              </div>
              
              {guideImage && (
                <>
                  <button onClick={fitGuideToWidth} className="w-full flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 border border-neutral-400 dark:border-neutral-600 text-[10px] text-neutral-700 dark:text-neutral-300 py-1.5 rounded transition-colors">
                    <Maximize className="w-3.5 h-3.5" />
                    横幅をキャンバスに合わせる
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">X座標</label>
                      <input type="number" value={guideX} onChange={e => setGuideX(Number(e.target.value))} className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">Y座標</label>
                      <input type="number" value={guideY} onChange={e => setGuideY(Number(e.target.value))} className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <label className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">
                      <span>拡大率</span><span>{guideScale.toFixed(2)}x</span>
                    </label>
                    <input type="range" min="0.1" max="5" step="0.05" value={guideScale} onChange={e => setGuideScale(Number(e.target.value))} className="w-full accent-emerald-500 h-1" />
                  </div>
                  <button onClick={() => setGuideImage(null)} className="mt-2 text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> 画像を消去
                  </button>
                </>
              )}
            </div>
          )}

          {guideType === "color" && (
            <div className="pt-2">
              <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">背景色</label>
              <div className="flex items-center gap-2">
                <input type="color" value={guideColor} onChange={e => setGuideColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-0.5" />
                <input type="text" value={guideColor} onChange={e => setGuideColor(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200" />
              </div>
            </div>
          )}

          {guideType === "gradient" && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">開始色</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={guideGradientStart} onChange={e => setGuideGradientStart(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-0.5" />
                  <input type="text" value={guideGradientStart} onChange={e => setGuideGradientStart(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-neutral-600 dark:text-neutral-400 mb-1">終了色</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={guideGradientEnd} onChange={e => setGuideGradientEnd(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-0.5" />
                  <input type="text" value={guideGradientEnd} onChange={e => setGuideGradientEnd(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 mt-auto">
          <button 
            onClick={() => zipImportRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium py-3 px-4 rounded-xl transition-colors text-sm"
          >
            <FileArchive className="w-4 h-4" />
            ZIPからレイアウト復元
          </button>
          <input type="file" accept=".zip" ref={zipImportRef} onChange={handleImportZip} className="hidden" />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800 pb-2">ZIP出力</h3>
          <div>
            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">曲名 / プロジェクト名</label>
            <input
              type="text"
              value={songTitle}
              onChange={e => setSongTitle(e.target.value)}
              placeholder="例: フォニイ"
              className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-3 py-1.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <p className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-1">クリックアクション: 「テキスト」@{songTitle || "曲名"}_連番 で自動設定</p>
          </div>
          <button
            onClick={handleExportZip}
            disabled={isExporting || items.filter(i => !i.isSpacer).length === 0}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-900 dark:text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
            ) : (
              <><Download className="w-4 h-4" />CCFOLIA ZIP出力</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
