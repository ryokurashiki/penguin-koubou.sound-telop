"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import WaveformEditor from "@/components/WaveformEditor";
import { UploadCloud, FileAudio, Trash2, Download, Save, Scissors, Loader2, Sparkles, Plus, GripVertical, Play, Settings2, RefreshCcw, HelpCircle, Undo2, Redo2, Pencil, PencilOff } from "lucide-react";
import JSZip from "jszip";
import { trimAudio, trimMultipleAudio, loadFfmpeg } from "@/lib/ffmpeg";
import { saveClipToSupabase } from "@/lib/audioPresets";
import { WhisperChunk } from "@/lib/alignment";

export default function AudioToolPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [clipName, setClipName] = useState("");
  const [lyrics, setLyrics] = useState("");
  
  const [clips, setClips] = useState<{ id: string; name: string; start: number; end: number }[]>([]);
  const [currentVolume, setCurrentVolume] = useState(0.5);
  const [aiChunks, setAiChunks] = useState<WhisperChunk[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
  const [autoGain, setAutoGain] = useState<number>(1.0);

  // Undo/Redo 履歴管理
  type HistoryState = { clips: { id: string; name: string; start: number; end: number }[], range: { start: number; end: number } };
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback((newState: HistoryState) => {
    // 現在の最新履歴と同一なら追加しない（エコープッシュや無意味な状態保存の防止）
    if (historyIndexRef.current >= 0 && historyRef.current.length > 0) {
      const currentState = historyRef.current[historyIndexRef.current];
      if (JSON.stringify(currentState) === JSON.stringify(newState)) {
        return;
      }
    }
    
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(newState)));
    while (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    isUndoRedoRef.current = true;
    const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
    setClips(state.clips);
    setRange(state.range);
    if (waveformRef.current) waveformRef.current.setRegion(state.range.start, state.range.end);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    isUndoRedoRef.current = true;
    const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
    setClips(state.clips);
    setRange(state.range);
    if (waveformRef.current) waveformRef.current.setRegion(state.range.start, state.range.end);
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // clips or range 変更時に履歴をプッシュ
  useEffect(() => {
    if (isUndoRedoRef.current) {
      // undo/redo直後のレンダリングでは履歴追加をスキップし、フラグを下ろす
      const t = setTimeout(() => { isUndoRedoRef.current = false; }, 100);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(() => {
      pushHistory({ clips, range });
    }, 500); // デバウンス処理により、ドラッグ中などの連続発火を防ぐ
    return () => clearTimeout(timer);
  }, [clips, range, pushHistory]);

  // Ctrl+Z / Ctrl+Y キーバインド
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // AI states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiAnalyzed, setIsAiAnalyzed] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [highlightedText, setHighlightedText] = useState("");
  const transcriberRef = useRef<any>(null);
  const waveformRef = useRef<any>(null);

  useEffect(() => {
    loadFfmpeg().then(() => setFfmpegLoaded(true)).catch(console.error);
  }, []);

  // クリップリストをlocalStorageに保存
  useEffect(() => {
    if (audioFile && clips.length > 0) {
      localStorage.setItem(`audiotool_clips_${audioFile.name}`, JSON.stringify(clips));
    }
  }, [clips, audioFile]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleSaveToSupabase = async () => {
    if (!audioFile || clips.length === 0) return;
    setIsProcessing(true);
    try {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setProgressMsg(`クラウド保存中: ${clip.name} (${i + 1}/${clips.length})`);
        
        const blob = await trimAudio(audioFile, clip.start, clip.end, clip.name, undefined, autoGain);
        await saveClipToSupabase(blob, `${clip.name}.mp3`, clip.name);
      }
      alert("すべてのアカウント保存が完了しました！");
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const handleZipDownload = async () => {
    if (!audioFile || clips.length === 0) return;
    setIsProcessing(true);
    const originalName = audioFile.name.replace(/\.[^/.]+$/, "");
    try {
      const zip = new JSZip();

      // 新設したバッチ処理関数を使用し、1回の書き込みで全クリップを処理
      const blobs = await trimMultipleAudio(audioFile, clips, setProgressMsg, autoGain);

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const blob = blobs[i];
        
        const indexStr = String(i + 1).padStart(3, '0');
        const fileName = `${originalName}_${indexStr}_${clip.name}.mp3`;
        
        zip.file(fileName, blob);
      }
      
      // clip_list.txt を同梱（後方互換）
      const clipListText = clips.map(c => c.name).join("\n");
      zip.file("clip_list.txt", clipListText);

      // 再編集用のメタデータを同梱
      const metaData = {
        version: 1,
        originalFileName: audioFile.name,
        clips: clips.map(c => ({ id: c.id, name: c.name, start: c.start, end: c.end })),
        lyrics: lyrics
      };
      zip.file("__audio_meta.json", JSON.stringify(metaData, null, 2));
      
      setProgressMsg("ZIPを作成中...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${originalName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました: " + String(err));
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const loadAudioFile = (file: File, skipRestore: boolean = false) => {
    setAudioFile(file);
    setIsAiAnalyzed(false);
    setAutoGain(1.0);
    
    if (!skipRestore) {
      setLyrics("");
      // localStorageから復元
      const saved = localStorage.getItem(`audiotool_clips_${file.name}`);
      if (saved) {
        try {
          const parsedClips = JSON.parse(saved);
          if (parsedClips.length > 0 && confirm("この音声ファイルのクリップ設定が保存されています。復元しますか？")) {
            setClips(parsedClips);
          } else {
            setClips([]);
          }
        } catch (e) {
          setClips([]);
        }
      } else {
        setClips([]);
      }
    }
  };

  const zipImportFlagRef = useRef<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAudioFile(file, zipImportFlagRef.current);
      zipImportFlagRef.current = false; // Reset flag
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      const metaFile = loadedZip.file("__audio_meta.json");
      if (!metaFile) {
        alert("有効なプロジェクトデータが見つかりません。");
        return;
      }
      
      const metaText = await metaFile.async("string");
      const metaData = JSON.parse(metaText);
      
      setClips(metaData.clips || []);
      setLyrics(metaData.lyrics || "");
      
      alert(`ZIPの読み込みに成功しました。\n\n元の音声ファイル「${metaData.originalFileName || "不明"}」を選択してください。`);
      // 次のファイル選択でZIPからの読み込みであることを示すフラグをセット
      zipImportFlagRef.current = true;
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch (err) {
      console.error(err);
      alert("ZIPの読み込みに失敗しました。");
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  };

  const handleAddCurrentRegionToClip = () => {
    const name = highlightedText.trim().substring(0, 30) || clipName.trim() || `Clip ${clips.length + 1}`;
    setClips([...clips, {
      id: Math.random().toString(36).substring(7),
      name: name + (highlightedText.length > 30 ? "..." : ""),
      start: range.start,
      end: range.end
    }]);
  };

  const addClip = () => {
    if (!clipName.trim()) {
      alert("クリップ名を入力してください。");
      return;
    }
    setClips([...clips, {
      id: Math.random().toString(36).substring(7),
      name: clipName,
      start: range.start,
      end: range.end
    }]);
    setClipName("");
  };

  const removeClip = (id: string) => {
    setClips(clips.filter(c => c.id !== id));
  };

  const handleSyncAI = async () => {
    console.log("[AI Sync] Started");
    if (!audioFile) {
      console.log("[AI Sync] No audio file, aborting");
      return;
    }

    console.log("[AI Sync] Setting loading state");
    setIsAiLoading(true);
    setAiProgressText("モデルの準備中...");

    try {
      console.log("[AI Sync] Decoding audio...");
      // 音声データを16kHz mono Float32Arrayに変換
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
      const offlineCtx = new OfflineAudioContext(1, decodedData.length, 16000);
      const source = offlineCtx.createBufferSource();
      source.buffer = decodedData;
      source.connect(offlineCtx.destination);
      source.start();
      const resampled = await offlineCtx.startRendering();
      const float32Array = resampled.getChannelData(0);
      console.log("[AI Sync] Audio decoded, length:", float32Array.length);

      // Transformers.jsをCDNからロード（初回のみ）
      if (!transcriberRef.current) {
        console.log("[AI Sync] Loading Transformers.js from CDN...");
        setAiProgressText("AIライブラリを読み込み中...");
        const { pipeline, env } = await import(
          /* webpackIgnore: true */
          // @ts-ignore
          "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
        );
        env.allowLocalModels = false;
        console.log("[AI Sync] Transformers.js loaded.");

        setAiProgressText("Whisperモデルをダウンロード中...(初回のみ)");
        console.log("[AI Sync] Initializing pipeline...");
        transcriberRef.current = await pipeline(
          "automatic-speech-recognition",
          "Xenova/whisper-base",
          {
            progress_callback: (x: any) => {
              console.log("[AI Sync] Model progress:", x);
              if (x.progress) {
                setAiProgressText(`モデルDL中: ${x.name || ""} (${Math.round(x.progress)}%)`);
              }
            },
          }
        );
        console.log("[AI Sync] Pipeline initialized.");
      }

      console.log("[AI Sync] Starting transcription...");
      setAiProgressText("音声を解析中...(数秒〜数十秒かかります)");

      const result = await transcriberRef.current(float32Array, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: "japanese",
        task: "transcribe",
      });
      console.log("[AI Sync] Transcription complete:", result);

      setAiChunks(result.chunks);
      setIsAiLoading(false);
      setIsAiAnalyzed(true);
      setAiProgressText("");
      console.log("[AI Sync] Finished");
    } catch (err) {
      console.error("[AI Sync] Error:", err);
      alert("AI解析エラー: " + String(err));
      setIsAiLoading(false);
      setAiProgressText("");
    }
  };

  const handleTextSelection = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if (target.selectionStart !== target.selectionEnd) {
      const selectedStr = target.value.substring(target.selectionStart, target.selectionEnd).trim();
      if (selectedStr) {
        setClipName(selectedStr);
      }
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-2xl font-bold text-blue-700 dark:text-white flex items-center gap-2">
            <Scissors className="w-6 h-6 text-blue-500" />
            音声切り分けツール
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
          ブラウザ上で重い音声データを切り出し、軽量なMP3としてエクスポートします。
        </p>
      </div>

      {!audioFile ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* 左側：新規読み込み */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
                loadAudioFile(file);
              } else if (file) {
                alert("音声ファイルまたは動画ファイルを選択してください。");
              }
            }}
            className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 hover:border-blue-500/50 hover:bg-neutral-50 dark:bg-neutral-900/50 transition-all rounded-2xl p-12 text-center cursor-pointer group"
          >
            <input 
              type="file" 
              accept="audio/*,video/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 group-hover:text-blue-400 group-hover:bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 transition-all">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-blue-700 dark:text-white mb-2">新しい音声ファイル</h3>
            <p className="text-neutral-500 dark:text-neutral-500 text-sm max-w-sm mx-auto">
              クリックまたはドラッグ＆ドロップで選択<br/>
              ※サーバーには送信されません
            </p>
          </div>

          {/* 右側：ZIP読み込み */}
          <div 
            onClick={() => zipInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-50 dark:bg-neutral-900/50 transition-all rounded-2xl p-12 text-center cursor-pointer group flex flex-col justify-center"
          >
            <input 
              type="file" 
              accept=".zip" 
              className="hidden" 
              ref={zipInputRef}
              onChange={handleZipImport}
            />
            <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 transition-all">
              <FileAudio className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-emerald-700 dark:text-emerald-400 mb-2">ZIPからプロジェクトを復元</h3>
            <p className="text-neutral-500 dark:text-neutral-500 text-sm max-w-sm mx-auto">
              以前出力したZIPを読み込んで<br/>
              クリップや台本を再編集します
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-blue-700 dark:text-white">{audioFile.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-500">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => zipInputRef.current?.click()}
                  className="text-xs bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  ZIPから復元
                </button>
                <button onClick={() => setAudioFile(null)} className="text-neutral-400 hover:text-red-400 p-2"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>

            <WaveformEditor 
              ref={waveformRef}
              audioFile={audioFile} 
              onRangeChange={(start, end) => {
                setRange({ start, end });
                if (editingClipId) {
                  setClips(prev => prev.map(c => c.id === editingClipId ? { ...c, start, end } : c));
                }
              }}
              onVolumeChange={(vol) => {
                setCurrentVolume(vol);
              }}
              onPeakDbCalc={(db) => {
                const maxLinear = Math.pow(10, db / 20);
                const targetLinear = 0.707;
                if (maxLinear > 0) {
                  setAutoGain(targetLinear / maxLinear);
                }
              }}
              undo={undo}
              redo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
            />

            {/* 2ペインテキストエリア */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* エリアA：AIインデックス */}
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">エリアA：AI文字起こし（時間検索用）</h3>
                  {!isAiAnalyzed && audioFile && (
                    <button
                      onClick={handleSyncAI}
                      disabled={isAiLoading || !audioFile}
                      className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-600 dark:hover:bg-blue-500 text-blue-700 dark:text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      AIで解析
                    </button>
                  )}
                </div>
                
                <div className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 overflow-y-auto custom-scrollbar text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {!isAiAnalyzed ? (
                    <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-500 text-xs text-center flex-col gap-4">
                      {isAiLoading ? (
                        <>
                          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                          <div className="text-neutral-700 dark:text-neutral-300 font-medium">{aiProgressText || "AIで解析中..."}</div>
                          <div className="text-neutral-500 dark:text-neutral-500 max-w-xs leading-relaxed">
                            音声の長さにより、解析に数秒〜数十秒かかる場合があります。<br/>
                            ブラウザ上で処理しているため、画面を閉じずにお待ちください。
                          </div>
                        </>
                      ) : (
                        <>
                          右上のボタンからAI事前解析を実行すると<br/>ここに文字起こし結果が表示され、<br/>クリックで波形がジャンプします。
                        </>
                      )}
                    </div>
                  ) : (
                    aiChunks.map((chunk, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setActiveClipId(null);
                          setTimeout(() => {
                            if (waveformRef.current && chunk.timestamp[0] !== null) {
                              const start = chunk.timestamp[0];
                              const end = chunk.timestamp[1] ?? chunk.timestamp[0] + 2;
                              waveformRef.current.setRegion(start, end);
                              // 範囲セット後、自動的に再生を開始する
                              if (typeof waveformRef.current.playRegion === "function") {
                                waveformRef.current.playRegion(start, end);
                              }
                            }
                          }, 0);
                        }}
                        className="cursor-pointer hover:bg-orange-500/30 hover:text-orange-300 transition-colors mb-2 p-1 rounded selection:bg-transparent block border-b border-neutral-200 dark:border-neutral-800/50"
                      >
                        {chunk.text}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* エリアB：ユーザー台本 */}
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col h-[400px]">
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">エリアB：ユーザー台本（ドラッグで名前入力）</h3>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  onMouseUp={handleTextSelection}
                  placeholder="ここに正しい歌詞や台本を貼り付けます。&#10;テキストをドラッグ選択すると、自動で下の新規クリップ名に入力されます。"
                  className="flex-1 w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 focus:outline-none focus:border-blue-500 resize-none custom-scrollbar"
                />
              </div>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4">波形から手動でクリップを追加</h3>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={clipName}
                  onChange={(e) => setClipName(e.target.value)}
                  placeholder="例: セリフ1、BGMメインループ" 
                  className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-2 text-sm text-blue-700 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <button 
                  onClick={addClip}
                  className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-blue-700 dark:text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-4 flex items-center justify-between">
                <span>エクスポートリスト</span>
                <span className="bg-neutral-100 dark:bg-neutral-800 text-xs px-2 py-1 rounded text-neutral-600 dark:text-neutral-400">{clips.length} 件</span>
              </h3>
              
              <div className="overflow-y-auto space-y-3 min-h-[200px] resize-y custom-scrollbar pr-1 w-full" style={{ height: "400px" }}>
                {clips.length === 0 ? (
                  <div className="text-center text-neutral-500 dark:text-neutral-500 text-sm py-12">
                    クリップがありません。<br/>波形やリストから追加してください。
                  </div>
                ) : (
                  clips.map((clip, idx) => {
                    const isActive = activeClipId === clip.id;
                    const isEditing = editingClipId === clip.id;
                    const isDragged = draggedClipIndex === idx;

                    return (
                      <div 
                        key={clip.id} 
                        draggable
                        onDragStart={() => setDraggedClipIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedClipIndex === null || draggedClipIndex === idx) return;
                          
                          const newClips = [...clips];
                          const draggedClipItem = newClips.splice(draggedClipIndex, 1)[0];
                          newClips.splice(idx, 0, draggedClipItem);
                          
                          setClips(newClips);
                          setDraggedClipIndex(null);
                        }}
                        onDragEnd={() => setDraggedClipIndex(null)}
                        onClick={() => {
                          if (activeClipId === clip.id) {
                            setActiveClipId(null);
                          } else {
                            setActiveClipId(clip.id);
                            if (waveformRef.current) waveformRef.current.setRegion(clip.start, clip.end);
                          }
                        }}
                        className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isActive 
                            ? "bg-blue-500/5 border-blue-500/30" 
                            : "bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:border-neutral-700"
                        } ${isEditing ? "ring-2 ring-orange-500/50" : ""} ${isDragged ? "opacity-40" : ""}`}
                      >
                        <div className="cursor-grab text-neutral-600 hover:text-neutral-600 dark:text-neutral-400 active:cursor-grabbing p-1">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex-1 space-y-2 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <input 
                              type="text"
                              value={clip.name}
                              onChange={(e) => setClips(clips.map(c => c.id === clip.id ? { ...c, name: e.target.value } : c))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-transparent border-b border-transparent focus:border-orange-500 text-sm font-medium text-blue-700 dark:text-white focus:outline-none transition-colors truncate"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isEditing) {
                                  setEditingClipId(null);
                                } else {
                                  setEditingClipId(clip.id);
                                  setActiveClipId(clip.id); // 自動で選択状態にする
                                  if (waveformRef.current) {
                                    waveformRef.current.setRegion(clip.start, clip.end);
                                  }
                                }
                              }}
                              className={`p-1.5 rounded transition-colors shrink-0 ${isEditing ? 'bg-orange-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-orange-500'}`}
                              title={isEditing ? "編集モードを終了" : "編集モードにする（波形と同期）"}
                            >
                              {isEditing ? <Pencil className="w-4 h-4" /> : <PencilOff className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 dark:text-neutral-500">
                            <input 
                              type="text"
                              value={`${Math.floor(clip.start / 60)}:${Math.floor(clip.start % 60).toString().padStart(2, '0')}.${Math.floor((clip.start % 1) * 100).toString().padStart(2, '0')}`}
                              onChange={(e) => {
                                const m = e.target.value.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
                                if (m) {
                                  const newStart = parseInt(m[1])*60 + parseInt(m[2]) + (m[3] ? parseInt(m[3].padEnd(2,'0'))/100 : 0);
                                  setClips(clips.map(c => c.id === clip.id ? { ...c, start: newStart } : c));
                                  if (isActive && waveformRef.current) waveformRef.current.setRegion(newStart, clip.end);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-20 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-1 py-0.5 text-center focus:outline-none focus:border-orange-500"
                            />
                            <span>-</span>
                            <input 
                              type="text"
                              value={`${Math.floor(clip.end / 60)}:${Math.floor(clip.end % 60).toString().padStart(2, '0')}.${Math.floor((clip.end % 1) * 100).toString().padStart(2, '0')}`}
                              onChange={(e) => {
                                const m = e.target.value.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
                                if (m) {
                                  const newEnd = parseInt(m[1])*60 + parseInt(m[2]) + (m[3] ? parseInt(m[3].padEnd(2,'0'))/100 : 0);
                                  setClips(clips.map(c => c.id === clip.id ? { ...c, end: newEnd } : c));
                                  if (isActive && waveformRef.current) waveformRef.current.setRegion(clip.start, newEnd);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-20 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-1 py-0.5 text-center focus:outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveClipId(clip.id);
                            if (waveformRef.current) {
                              waveformRef.current.setRegion(clip.start, clip.end);
                              waveformRef.current.playRegion(clip.start, clip.end);
                            }
                          }}
                          className="p-2 text-neutral-600 hover:text-green-400 transition-colors shrink-0"
                          title="プレビュー再生"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}
                          className="p-2 text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {clips.length > 0 && (
                <div className="pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                  <button 
                    onClick={handleZipDownload}
                    disabled={isProcessing || !ffmpegLoaded}
                    className="w-full flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-600 dark:hover:bg-blue-500 text-blue-700 dark:text-white text-sm font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {progressMsg}</>
                    ) : !ffmpegLoaded ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> エンジン読込中...</>
                    ) : (
                      <><Download className="w-4 h-4" /> ZIPで一括ダウンロード</>
                    )}
                  </button>
                  <button 
                    onClick={handleSaveToSupabase}
                    disabled={isProcessing || !ffmpegLoaded}
                    className="w-full flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    アカウントに保存
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
