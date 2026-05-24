"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Upload, AlertTriangle, Download, Type, Highlighter, FileArchive, Zap, ArrowLeftRight } from "lucide-react";
import { LayoutItem } from "@/lib/lyricToolTypes";
import JSZip from "jszip";

type SizePreset = "small" | "medium" | "large";

interface Props {
  songTitle: string;
  setSongTitle: (val: string) => void;
  queue: LayoutItem[];
  setQueue: React.Dispatch<React.SetStateAction<LayoutItem[]>>;
}

export default function ImageGenerationTab({ songTitle, setSongTitle, queue, setQueue }: Props) {
  const [lyricsText, setLyricsText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);

  // 出力リストの選択状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [textColor, setTextColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgOpacity, setBgOpacity] = useState(1.0);
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [customFonts, setCustomFonts] = useState<{ name: string }[]>([]);
  const [sizePreset, setSizePreset] = useState<SizePreset>("medium");
  const [letterSpacing, setLetterSpacing] = useState<number>(0);

  const [isOverWidth, setIsOverWidth] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // サイズ設定に応じた値の取得
  const getSizeSettings = (preset: SizePreset) => {
    switch (preset) {
      case "small":
        return { height: 40, fontSize: 26, paddingX: 4 };
      case "medium":
        return { height: 50, fontSize: 34, paddingX: 4 };
      case "large":
        return { height: 60, fontSize: 42, paddingX: 4 };
    }
  };

  // テキストから画像を生成するコアロジック
  const generateImageForText = (text: string, settings: {
    fontFamily: string, sizePreset: SizePreset, letterSpacing: number,
    textColor: string, bgColor: string, bgOpacity: number
  }, targetCanvas?: HTMLCanvasElement) => {
    const canvas = targetCanvas || document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { height, fontSize, paddingX } = getSizeSettings(settings.sizePreset);

    // ルビの解析
    const segments: { base: string; ruby?: string }[] = [];
    const regex = /\|([^《]+)《([^》]+)》/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ base: text.substring(lastIndex, match.index) });
      }
      segments.push({ base: match[1], ruby: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ base: text.substring(lastIndex) });
    }

    // サイズ計算
    ctx.font = `bold ${fontSize}px ${settings.fontFamily}`;
    const rubyFontSize = fontSize * 0.4;
    
    let textOnlyWidth = 0;
    const measuredSegments = segments.map(seg => {
      ctx.font = `bold ${fontSize}px ${settings.fontFamily}`;
      let baseW = 0;
      for (const char of seg.base) { baseW += ctx.measureText(char).width + settings.letterSpacing; }
      if (baseW > 0) baseW -= settings.letterSpacing;

      let rubyW = 0;
      if (seg.ruby) {
        ctx.font = `bold ${rubyFontSize}px ${settings.fontFamily}`;
        for (const char of seg.ruby) { rubyW += ctx.measureText(char).width + settings.letterSpacing; }
        if (rubyW > 0) rubyW -= settings.letterSpacing;
      }

      const segmentWidth = Math.max(baseW, rubyW);
      textOnlyWidth += segmentWidth + settings.letterSpacing;
      return { ...seg, segmentWidth, baseW, rubyW };
    });
    if (measuredSegments.length > 0) textOnlyWidth -= settings.letterSpacing;

    const naturalWidth = textOnlyWidth + paddingX * 2;
    // ココフォリア用に24で割り切れるサイズに補正
    canvas.width = Math.ceil(naturalWidth / 24) * 24;
    // 縦幅も24の倍数に固定（指定された高さ以上で最小の24の倍数）
    canvas.height = Math.ceil(height / 24) * 24;

    // キャンバス幅からテキスト幅を引いた分を左右の余白とする
    const actualPaddingX = (canvas.width - textOnlyWidth) / 2;

    // 背景描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (settings.bgOpacity > 0) {
      ctx.globalAlpha = settings.bgOpacity;
      ctx.fillStyle = settings.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }

    ctx.fillStyle = settings.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const hasAnyRuby = segments.some(s => s.ruby);
    const mainY = hasAnyRuby ? canvas.height / 2 + fontSize * 0.2 : canvas.height / 2 + 2;
    const rubyY = mainY - fontSize * 0.75;

    let currentX = actualPaddingX;

    for (const seg of measuredSegments) {
      ctx.font = `bold ${fontSize}px ${settings.fontFamily}`;
      let bx = currentX + (seg.segmentWidth - seg.baseW) / 2;
      for (const char of seg.base) {
        const cw = ctx.measureText(char).width;
        ctx.fillText(char, bx + cw / 2, mainY);
        bx += cw + settings.letterSpacing;
      }

      if (seg.ruby) {
        ctx.font = `bold ${rubyFontSize}px ${settings.fontFamily}`;
        let rx = currentX + (seg.segmentWidth - seg.rubyW) / 2;
        for (const char of seg.ruby) {
          const cw = ctx.measureText(char).width;
          ctx.fillText(char, rx + cw / 2, rubyY);
          rx += cw + settings.letterSpacing;
        }
      }

      currentX += seg.segmentWidth + settings.letterSpacing;
    }

    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  };

  // 選択テキストの取得処理
  const handleSelection = useCallback(() => {
    if (!textAreaRef.current) return;
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const text = textarea.value.substring(start, end).replace(/\n/g, " ").trim();
      if (text) {
        setSelectedText(text);
        setSelectionStart(start);
      }
    }
  }, []);

  // Canvas描画処理（プレビュー用）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!selectedText) {
      canvas.width = 400;
      canvas.height = getSizeSettings(sizePreset).height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgOpacity > 0) {
        ctx.globalAlpha = bgOpacity;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
      }
      ctx.font = `14px ${fontFamily}`;
      ctx.fillStyle = "#888";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("テキストを選択してください", canvas.width / 2, canvas.height / 2);
      setIsOverWidth(false);
      return;
    }

    const result = generateImageForText(selectedText, {
      fontFamily, sizePreset, letterSpacing, textColor, bgColor, bgOpacity
    }, canvas);
    
    if (result) {
      setIsOverWidth(result.width > 1000);
    }
  }, [selectedText, textColor, bgColor, bgOpacity, fontFamily, sizePreset, letterSpacing]);

  // リストに追加
  const handleAddToQueue = useCallback(() => {
    if (!selectedText || !canvasRef.current) return;
    
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    
    setQueue(prev => {
      const newItem: LayoutItem = {
        id: Math.random().toString(36).substring(7),
        text: selectedText,
        startIndex: selectionStart,
        dataUrl,
        width,
        height,
        manualBreak: false
      };
      
      const newQueue = [...prev, newItem];
      // selectionStartに基づいて昇順にソート（歌詞の登場順）
      newQueue.sort((a, b) => a.startIndex - b.startIndex);
      return newQueue;
    });
  }, [selectedText, selectionStart, setQueue]);

  // Ctrl+Enter で追加
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSelection(); // 最新の選択状態を取得
      setTimeout(() => handleAddToQueue(), 50); // 描画更新を待ってから追加
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  // フォントアップロード処理
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fontName = file.name.replace(/\.[^/.]+$/, ""); // 拡張子除去
      const arrayBuffer = await file.arrayBuffer();
      const fontFace = new FontFace(fontName, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      
      setCustomFonts(prev => [...prev, { name: fontName }]);
      setFontFamily(`"${fontName}"`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      alert("フォントの読み込みに失敗しました。対応していないフォーマットの可能性があります。");
    }
  };

  // -------------------------
  // 新機能: 一括テキスト生成
  // -------------------------
  const handleBulkAdd = useCallback(() => {
    if (!lyricsText.trim()) return;

    const lines = lyricsText.split("\n");
    const newItems: LayoutItem[] = [];
    
    // ベースとなる設定
    const settings = { fontFamily, sizePreset, letterSpacing, textColor, bgColor, bgOpacity };

    lines.forEach((line, index) => {
      const text = line.trim();
      
      // スペースのみの行や空行は無視する
      if (!text) {
        return;
      }

      // 画像生成
      const result = generateImageForText(text, settings);
      if (result) {
        newItems.push({
          id: Math.random().toString(36).substring(7),
          text,
          startIndex: index * 1000,
          dataUrl: result.dataUrl,
          width: result.width,
          height: result.height,
          manualBreak: false
        });
      }
    });

    setQueue(prev => [...prev, ...newItems]);
  }, [lyricsText, fontFamily, sizePreset, letterSpacing, textColor, bgColor, bgOpacity, setQueue]);

  // -------------------------
  // 新機能: ZIPからクリップ名読み込み / プロジェクト復元
  // -------------------------
  const handleLoadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".txt")) {
        const text = await file.text();
        setLyricsText(prev => prev ? prev + "\n" + text : text);
        return;
      }
      
      if (!file.name.endsWith(".zip")) return;
      
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);

      // --- 優先度1: __lyric_meta.json があれば完全復元を試みる ---
      const lyricMetaFile = loadedZip.file("__lyric_meta.json");
      if (lyricMetaFile) {
        const metaText = await lyricMetaFile.async("string");
        const meta = JSON.parse(metaText);
        
        if (meta.items && Array.isArray(meta.items) && meta.items.length > 0) {
          // dataUrl が含まれているかチェック（最初のアイテムで判定）
          const hasDataUrls = meta.items[0].dataUrl && meta.items[0].dataUrl.startsWith("data:");
          
          if (hasDataUrls) {
            // dataUrlがそのまま入っている → 直接復元
            const restoredItems: LayoutItem[] = meta.items.map((item: any) => ({
              id: Math.random().toString(36).substring(7),
              text: item.text || "",
              startIndex: item.startIndex || 0,
              dataUrl: item.dataUrl,
              width: item.width,
              height: item.height,
              manualBreak: item.manualBreak || false,
              alignOverride: item.alignOverride,
              isSpacer: item.isSpacer,
            }));
            setQueue(restoredItems);
            if (meta.songTitle) setSongTitle(meta.songTitle);
            // 歌詞テキストも復元
            const lyricsFromItems = restoredItems
              .filter(i => !i.isSpacer)
              .map(i => i.text)
              .join("\n");
            if (lyricsFromItems) setLyricsText(lyricsFromItems);
            alert(`${restoredItems.length} 件のテロップを復元しました。`);
            return;
          }
          
          // dataUrlが無い → __data.json から画像を復元
          const dataJsonFile = loadedZip.file("__data.json") || loadedZip.file("data.json");
          if (dataJsonFile) {
            const dataJsonText = await dataJsonFile.async("string");
            const ccfoliaData = JSON.parse(dataJsonText);
            
            // entities.itemsをorder順にソート
            const sortedEntities = Object.values(ccfoliaData.entities?.items || {})
              .sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) as any[];
            
            const restoredItems: LayoutItem[] = [];
            
            for (let i = 0; i < meta.items.length; i++) {
              const metaItem = meta.items[i];
              
              // 対応するentityを探す（order順で一致）
              const entity = sortedEntities[i];
              let dataUrl = "";
              
              if (entity?.imageUrl) {
                const imageFile = loadedZip.file(entity.imageUrl);
                if (imageFile) {
                  const imageBase64 = await imageFile.async("base64");
                  const mimeType = ccfoliaData.resources?.[entity.imageUrl]?.type || "image/png";
                  dataUrl = `data:${mimeType};base64,${imageBase64}`;
                }
              }
              
              restoredItems.push({
                id: Math.random().toString(36).substring(7),
                text: metaItem.text || "",
                startIndex: metaItem.startIndex || 0,
                dataUrl,
                width: metaItem.width,
                height: metaItem.height,
                manualBreak: metaItem.manualBreak || false,
                alignOverride: metaItem.alignOverride,
                isSpacer: metaItem.isSpacer,
              });
            }
            
            setQueue(restoredItems);
            if (meta.songTitle) setSongTitle(meta.songTitle);
            const lyricsFromItems = restoredItems
              .filter(i => !i.isSpacer)
              .map(i => i.text)
              .join("\n");
            if (lyricsFromItems) setLyricsText(lyricsFromItems);
            alert(`${restoredItems.length} 件のテロップを復元しました。`);
            return;
          }
        }
      }

      // --- 優先度2: __data.json のみの場合（__lyric_meta.jsonが無い他ツールのZIP等） ---
      const dataJsonFile = loadedZip.file("__data.json") || loadedZip.file("data.json");
      if (dataJsonFile) {
        const dataJsonText = await dataJsonFile.async("string");
        const ccfoliaData = JSON.parse(dataJsonText);
        
        const sortedEntities = Object.values(ccfoliaData.entities?.items || {})
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) as any[];
        
        if (sortedEntities.length > 0) {
          const restoredItems: LayoutItem[] = [];
          
          for (let i = 0; i < sortedEntities.length; i++) {
            const entity = sortedEntities[i] as any;
            let dataUrl = "";
            
            if (entity.imageUrl) {
              const imageFile = loadedZip.file(entity.imageUrl);
              if (imageFile) {
                const imageBase64 = await imageFile.async("base64");
                const mimeType = ccfoliaData.resources?.[entity.imageUrl]?.type || "image/png";
                dataUrl = `data:${mimeType};base64,${imageBase64}`;
              }
            }
            
            restoredItems.push({
              id: Math.random().toString(36).substring(7),
              text: entity.memo || "",
              startIndex: i * 1000,
              dataUrl,
              width: (entity.width || 1) * 24,
              height: (entity.height || 1) * 24,
              manualBreak: false,
            });
          }
          
          setQueue(restoredItems);
          const lyricsFromItems = restoredItems.map(i => i.text).join("\n");
          if (lyricsFromItems) setLyricsText(lyricsFromItems);
          alert(`${restoredItems.length} 件のテロップを復元しました。`);
          return;
        }
      }
      
      // --- 優先度3: clip_list.txt のみ（音声ツールからのZIP） ---
      const clipListFile = loadedZip.file("clip_list.txt");
      if (clipListFile) {
        const text = await clipListFile.async("string");
        setLyricsText(prev => prev ? prev + "\n" + text : text);
        return;
      }
      
      alert("ZIP内に復元可能なデータが見つかりませんでした。");
    } catch (err) {
      console.error(err);
      alert("ファイルの読み込みに失敗しました。");
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* 左側：テキストエリア */}
      <div className="flex flex-col space-y-4 h-[calc(100vh-250px)] min-h-[500px]">
        <div>
          <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">曲名 / プロジェクト名</label>
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="例: フォニイ"
            className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-neutral-400 dark:text-neutral-600 flex items-center gap-2">
              歌詞 / セリフテキスト
              <span className="text-xs text-neutral-500 dark:text-neutral-500">空行は無視されます</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => zipInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded transition-colors"
                title="音声ツールで作成したZIPまたは clip_list.txt を読み込みます"
              >
                <FileArchive className="w-3.5 h-3.5" />
                ZIP読込
              </button>
              <input
                type="file"
                accept=".zip,.txt"
                ref={zipInputRef}
                onChange={handleLoadZip}
                className="hidden"
              />
              <button
                onClick={handleBulkAdd}
                className="flex items-center gap-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded transition-colors"
                title="全行を一括で画像化してキューに追加します"
              >
                <Zap className="w-3.5 h-3.5" />
                一括生成
              </button>
              <button
                onClick={() => {
                  if (!textAreaRef.current) return;
                  const textarea = textAreaRef.current;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const selected = textarea.value.substring(start, end);
                  const before = textarea.value.substring(0, start);
                  const after = textarea.value.substring(end);
                  
                  const newText = before + `|${selected}《》` + after;
                  setLyricsText(newText);
                  
                  // カーソルを《》の中に移動
                  setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + selected.length + 2, start + selected.length + 2);
                    handleSelection();
                  }, 10);
                }}
                className="flex items-center gap-1.5 text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded transition-colors"
              >
                <Highlighter className="w-3.5 h-3.5" />
                ルビ追加
              </button>
            </div>
          </div>
          <textarea
            ref={textAreaRef}
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            onKeyDown={handleKeyDown}
            placeholder="ここに歌詞やセリフを入力し、画像化したい部分をマウスで選択してください。"
            className="flex-1 w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-4 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-emerald-500 resize-none custom-scrollbar leading-relaxed"
          />
        </div>
      </div>

      {/* 右側：設定パネルとプレビュー、キュー */}
      <div className="flex flex-col space-y-6 h-[calc(100vh-250px)] min-h-[500px]">
        
        {/* 設定パネル */}
        <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* 文字色 */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">文字色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-0.5 shrink-0"
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200"
                />
              </div>
            </div>

            {/* 入れ替えボタン */}
            <div className="flex flex-col justify-end pb-1 shrink-0">
              <button
                onClick={() => {
                  const temp = textColor;
                  setTextColor(bgColor);
                  setBgColor(temp);
                }}
                className="p-1.5 mt-5 text-neutral-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full transition-colors"
                title="文字色と背景色を入れ替える"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            {/* 背景色 */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">背景色 & 透明度</label>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-0.5 shrink-0"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-16 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-1.5 py-1 text-sm text-neutral-800 dark:text-neutral-200"
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bgOpacity}
                  onChange={(e) => setBgOpacity(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* フォント */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">フォント</label>
              <div className="flex gap-2">
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1.5 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-emerald-500 truncate"
                >
                  <optgroup label="システムフォント">
                    <option value="sans-serif">ゴシック (sans-serif)</option>
                    <option value="serif">明朝 (serif)</option>
                    <option value="monospace">等幅 (monospace)</option>
                  </optgroup>
                  <optgroup label="Google Fonts">
                    <option value="'Noto Sans JP', sans-serif">Noto Sans JP</option>
                    <option value="'Noto Serif JP', serif">Noto Serif JP</option>
                    <option value="'Yusei Magic', sans-serif">油性マジック</option>
                  </optgroup>
                  {customFonts.length > 0 && (
                    <optgroup label="アップロード済み">
                      {customFonts.map(f => (
                        <option key={f.name} value={`"${f.name}"`}>{f.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white transition-colors shrink-0"
                  title="ローカルフォントを追加 (.ttf, .otf)"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  accept=".ttf,.otf"
                  ref={fileInputRef}
                  onChange={handleFontUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* サイズと文字間隔 */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">サイズ (縦幅)</label>
                <div className="flex bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 p-0.5">
                  {(["small", "medium", "large"] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setSizePreset(size)}
                      className={`flex-1 text-xs py-1 rounded-sm transition-colors ${
                        sizePreset === size ? "bg-emerald-600 text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {size === "small" ? "小" : size === "medium" ? "中" : "大"}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">文字間隔</label>
                  <span className="text-xs text-neutral-500 dark:text-neutral-500">{letterSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={letterSpacing}
                  onChange={(e) => setLetterSpacing(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* プレビュー */}
        <div className={`relative bg-white dark:bg-neutral-950 border rounded-xl flex items-center justify-center p-4 overflow-x-auto shrink-0 transition-colors ${
          isOverWidth ? "border-red-500/50 bg-red-500/5" : "border-neutral-200 dark:border-neutral-800"
        }`}>
          {/* チェッカーボード背景（透過確認用） */}
          <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none" style={{
            backgroundImage: "linear-gradient(45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(-45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(45deg, #b8b8b8 75%, #9a9a9a 75%), linear-gradient(-45deg, #b8b8b8 75%, #9a9a9a 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px"
          }} />
          
          <div className="relative flex flex-col items-center">
            <canvas ref={canvasRef} className="max-w-full" style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.3)" }} />
            {isOverWidth && (
              <div className="absolute -bottom-6 flex items-center gap-1 text-red-400 text-xs mt-2 whitespace-nowrap bg-white dark:bg-neutral-950 px-2 py-1 rounded-full border border-red-500/30">
                <AlertTriangle className="w-3 h-3" />
                横幅が制限(1000px)を超過しています。
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleAddToQueue}
          disabled={!selectedText}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Plus className="w-5 h-5" />
          リストに追加 (Ctrl + Enter)
        </button>

        {/* 出力リスト */}
        <div className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden flex flex-col min-h-[200px]">
          <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
              出力リスト
              {selectedIds.size > 0 && (
                <span className="text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">{selectedIds.size}件選択中</span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {queue.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      if (selectedIds.size === queue.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(queue.map(q => q.id)));
                    }}
                    className="text-xs text-neutral-500 dark:text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 px-2 py-1 transition-colors font-medium"
                  >
                    {selectedIds.size === queue.length ? "選択解除" : "すべて選択"}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedIds.size > 0) {
                        setQueue(prev => prev.filter(q => !selectedIds.has(q.id)));
                        setSelectedIds(new Set());
                      } else {
                        if (confirm("すべての出力リストを削除しますか？")) {
                          setQueue([]);
                          setSelectedIds(new Set());
                        }
                      }
                    }}
                    className={`text-xs px-2 py-1 rounded transition-colors font-medium ${
                      selectedIds.size > 0 
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20" 
                        : "text-neutral-500 dark:text-neutral-500 hover:text-red-500"
                    }`}
                  >
                    {selectedIds.size > 0 ? "選択項目を削除" : "すべて削除"}
                  </button>
                </>
              )}
              <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-1 rounded ml-2 font-mono">{queue.length} 件</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar p-3 space-y-2">
            {queue.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-500 text-sm text-center px-4">
                追加された画像がありません。<br/>テキストを選択して追加してください。
              </div>
            ) : (
              queue.map((item, index) => {
                const seqStr = String(index + 1).padStart(3, '0');
                const safeTitle = songTitle.trim() || "Untitled";
                const safeText = item.text
                  .replace(/\|([^《]+)《[^》]+》/g, "$1") // ルビ記号を取り除き親文字だけにする
                  .substring(0, 15)
                  .replace(/[\\/:*?"<>|]/g, '');
                const fileName = `${safeTitle}_${seqStr}_${safeText}.png`;

                return (
                  <div key={item.id} className={`group flex items-center gap-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg p-2 transition-colors ${
                    selectedIds.has(item.id) ? "border-emerald-500 ring-1 ring-emerald-500/50 bg-emerald-500/5" : "border-neutral-200 dark:border-neutral-800 hover:border-emerald-500/30"
                  }`}>
                    <label className="flex items-center justify-center p-1 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedIds);
                          if (e.target.checked) newSet.add(item.id);
                          else newSet.delete(item.id);
                          setSelectedIds(newSet);
                        }}
                        className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                      />
                    </label>
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-1.5 text-neutral-400 dark:text-neutral-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors shrink-0"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="text-xs font-mono text-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                      {seqStr}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate" title={item.text}>
                        {item.text}
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-500 truncate" title={fileName}>
                        {fileName}
                      </div>
                    </div>

                    <div className="h-8 rounded flex items-center justify-center overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-800 px-2 ml-auto" style={{
                      backgroundImage: "linear-gradient(45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(-45deg, #9a9a9a 25%, #b8b8b8 25%), linear-gradient(45deg, #b8b8b8 75%, #9a9a9a 75%), linear-gradient(-45deg, #b8b8b8 75%, #9a9a9a 75%)",
                      backgroundSize: "8px 8px",
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                    }}>
                      <img src={item.dataUrl} alt={item.text} className="h-full object-contain mix-blend-normal" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
