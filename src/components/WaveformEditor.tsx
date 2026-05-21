"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";

import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Volume2, Repeat, ArrowRight, Locate, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Undo2, Redo2, MoveRight } from "lucide-react";

/**
 * ローカル編集状態を持つ時刻入力コンポーネント。
 * フォーカス中は自由にテキスト編集でき、blur/Enterで確定。
 * "m:ss.cc" 形式と、秒数の直接入力の両方に対応。
 */
function TimeInput({ value, onChange, formatTime, parseTimeString }: {
  value: number;
  onChange: (val: number) => void;
  formatTime: (t: number) => string;
  parseTimeString: (s: string) => number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const confirm = () => {
    setEditing(false);
    const trimmed = editText.trim();
    // まず m:ss.cc 形式を試す
    const parsed = parseTimeString(trimmed);
    if (parsed !== null) {
      onChange(parsed);
      return;
    }
    // 次に秒数の直接入力を試す
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num >= 0) {
      onChange(num);
      return;
    }
    // パース失敗時はリセット（何もしない）
  };

  return (
    <input
      type="text"
      value={editing ? editText : formatTime(value)}
      onFocus={() => {
        setEditing(true);
        setEditText(formatTime(value));
      }}
      onChange={(e) => setEditText(e.target.value)}
      onBlur={confirm}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
      className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1.5 text-sm text-neutral-900 dark:text-white font-mono focus:border-blue-500 focus:outline-none"
      placeholder="0:00.00 or 秒数"
    />
  );
}

interface WaveformEditorProps {
  audioFile: File | null;
  onRangeChange: (start: number, end: number) => void;
  onVolumeChange?: (volume: number) => void;
  onPeakDbCalc?: (maxDb: number) => void;
  autoGain?: number;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const WaveformEditor = forwardRef(({ audioFile, onRangeChange, onVolumeChange, onPeakDbCalc, autoGain = 1.0, undo, redo, canUndo, canRedo }: WaveformEditorProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const wsRegions = useRef<any>(null);
  const activeRegion = useRef<any>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  const onPeakDbCalcRef = useRef(onPeakDbCalc);

  // Keep the refs up to date
  useEffect(() => {
    onRangeChangeRef.current = onRangeChange;
  }, [onRangeChange]);

  useEffect(() => {
    onPeakDbCalcRef.current = onPeakDbCalc;
  }, [onPeakDbCalc]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [volume, setVolume] = useState(0.5);
  const [loopMode, setLoopMode] = useState<"loop" | "once" | "normal">("loop");
  const loopModeRef = useRef<"loop" | "once" | "normal">("loop");
  const [skipSeconds, setSkipSeconds] = useState(5);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useImperativeHandle(ref, () => ({
    setRegion: (start: number, end: number) => {
      const newStart = Number(start.toFixed(2));
      const newEnd = Number(end.toFixed(2));
      setStartTime(newStart);
      setEndTime(newEnd);
      wavesurfer.current?.setTime(newStart);
      if (activeRegion.current) {
        activeRegion.current.setOptions({ start: newStart, end: newEnd });
      }
    },
    playRegion: (start: number, end: number) => {
      if (wavesurfer.current) {
        wavesurfer.current.setTime(start);
        wavesurfer.current.play();
      }
    },
    getVolume: () => volume,
  }));

  // 初期化
  useEffect(() => {
    if (!containerRef.current || !audioFile) return;

    let isMounted = true;
    setIsReady(false);
    wsRegions.current = RegionsPlugin.create();

    const isDark = document.documentElement.classList.contains("dark");
    const wsWaveColor = isDark ? "#3b82f6" : "rgba(59, 130, 246, 0.4)";
    const wsProgressColor = isDark ? "#60a5fa" : "rgba(59, 130, 246, 0.8)";

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: wsWaveColor,
      progressColor: wsProgressColor,
      cursorColor: "#93c5fd", // blue-300
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
      normalize: true,
      plugins: [wsRegions.current],
    });

    wavesurfer.current = ws;

    wsRegions.current.enableDragSelection({
      color: "rgba(249, 115, 22, 0.4)", // orange-500/40
    });

    const url = URL.createObjectURL(audioFile);
    
    // Blob URLを直接ロードする
    ws.load(url).catch(err => {
      if (!isMounted) return; // StrictModeによるアンマウント時のエラーを無視
      console.error("Audio load error:", err);
      // フォールバック
      ws.loadBlob(audioFile).catch(e => {
        if (!isMounted) return;
        console.error("Fallback load error:", e);
        alert("エラー: お使いのブラウザではこの音声ファイル形式（コーデック）を読み込めない可能性があります。");
      });
    });

    ws.on("ready", () => {
      if (!isMounted) return;
      setIsReady(true);
      const dur = ws.getDuration();
      setDuration(dur);
      
      const initialEnd = Math.min(10, dur); // 初期状態は最大10秒の選択範囲とし、空白部分をドラッグできるようにする
      setEndTime(initialEnd);
      
      // 初期音量を適用
      ws.setVolume(0.5);

      // Web Audio APIのセットアップ（自動音量調整用）
      try {
        const media = ws.getMediaElement();
        if (media && !mediaSourceRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          mediaSourceRef.current = audioCtxRef.current.createMediaElementSource(media);
          gainNodeRef.current = audioCtxRef.current.createGain();
          gainNodeRef.current.gain.value = autoGain;
          mediaSourceRef.current.connect(gainNodeRef.current);
          gainNodeRef.current.connect(audioCtxRef.current.destination);
        }
      } catch (err) {
        console.error("Web Audio API setup failed:", err);
      }
      
      // 初期リージョンを作成
      activeRegion.current = wsRegions.current.addRegion({
        start: 0,
        end: initialEnd,
        color: "rgba(249, 115, 22, 0.4)", // orange-500/40
      });
      
      onRangeChangeRef.current(0, initialEnd);
    });

    const calcMaxDb = () => {
      const decodedData = ws.getDecodedData();
      if (decodedData && onPeakDbCalcRef.current) {
        const channelData = decodedData.getChannelData(0);
        let maxVal = 0;
        for (let i = 0; i < channelData.length; i++) {
          const abs = Math.abs(channelData[i]);
          if (abs > maxVal) maxVal = abs;
        }
        const maxDb = maxVal > 0 ? 20 * Math.log10(maxVal) : -Infinity;
        onPeakDbCalcRef.current(maxDb);
      }
    };

    ws.on("decode", calcMaxDb);
    ws.on("ready", calcMaxDb);

    wsRegions.current.on("region-created", (region: any) => {
      // 複数リージョンが作成された場合は、古いものを削除して単一に保つ
      wsRegions.current.getRegions().forEach((r: any) => {
        if (r.id !== region.id) r.remove();
      });
      activeRegion.current = region;
      setStartTime(Number(region.start.toFixed(2)));
      setEndTime(Number(region.end.toFixed(2)));
    });

    wsRegions.current.on("region-updated", (region: any) => {
      // イン/アウト点が交差した場合の自動スワップ
      let s = Number(region.start.toFixed(2));
      let e = Number(region.end.toFixed(2));
      if (s > e) {
        [s, e] = [e, s];
        region.setOptions({ start: s, end: e });
      }
      setStartTime(s);
      setEndTime(e);
    });

    ws.on("audioprocess", (time: number) => {
      setCurrentTime(time);
      // 再生モードの制御
      const currentEndTime = activeRegion.current ? activeRegion.current.end : endTime;
      if (loopModeRef.current === "loop") {
        if (time >= currentEndTime) {
          ws.setTime(activeRegion.current ? activeRegion.current.start : startTime);
        }
      } else if (loopModeRef.current === "once") {
        if (time >= currentEndTime) {
          ws.pause();
          ws.setTime(activeRegion.current ? activeRegion.current.start : startTime);
        }
      }
    });

    // 波形クリック時に再生位置を反映
    ws.on("seeking", (time: number) => {
      setCurrentTime(time);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      if (!isMounted) return;
      setIsPlaying(false);
      ws.setTime(activeRegion.current ? activeRegion.current.start : startTime);
    });

    return () => {
      isMounted = false;
      ws.destroy();
      URL.revokeObjectURL(url);
      
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [audioFile]);

  // 親への通知
  useEffect(() => {
    onRangeChangeRef.current(startTime, endTime);
  }, [startTime, endTime]);

  // ズームの適用
  useEffect(() => {
    if (wavesurfer.current && isReady) {
      try {
        if (typeof wavesurfer.current.zoom === "function") {
          wavesurfer.current.zoom(zoom * 10);
        } else if (typeof wavesurfer.current.setOptions === "function") {
          wavesurfer.current.setOptions({ minPxPerSec: zoom * 10 });
        }
      } catch (e) {
        console.error("Zoom failed:", e);
      }
    }
  }, [zoom, isReady]);

  // 再生速度の変更
  useEffect(() => {
    if (wavesurfer.current && isReady) {
      wavesurfer.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate, isReady]);

  // オートゲインの適用
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = autoGain;
    }
  }, [autoGain]);

  // 音量の変更
  useEffect(() => {
    if (wavesurfer.current && isReady) {
      wavesurfer.current.setVolume(volume);
    }
    onVolumeChange?.(volume);
  }, [volume, isReady]);

  const togglePlay = useCallback(() => {
    if (wavesurfer.current) {
      if (isPlaying) {
        wavesurfer.current.pause();
      } else {
        if (loopMode === "loop" || loopMode === "once") {
          const currentEnd = activeRegion.current ? activeRegion.current.end : endTime;
          if (wavesurfer.current.getCurrentTime() >= currentEnd) {
            wavesurfer.current.setTime(activeRegion.current ? activeRegion.current.start : startTime);
          }
        }
        wavesurfer.current.play().catch(console.error);
      }
    }
  }, [isPlaying, endTime, startTime, loopMode]);

  // ループモードの切替
  const toggleLoopMode = useCallback(() => {
    setLoopMode(prev => {
      const next = prev === "loop" ? "once" : prev === "once" ? "normal" : "loop";
      loopModeRef.current = next;
      return next;
    });
  }, []);

  // イン点から再生
  const playFromIn = useCallback(() => {
    if (wavesurfer.current && isReady) {
      const inPoint = activeRegion.current ? activeRegion.current.start : startTime;
      wavesurfer.current.setTime(inPoint);
      setCurrentTime(inPoint);
      wavesurfer.current.play().catch(console.error);
    }
  }, [isReady, startTime]);

  // N秒スキップ
  const skip = useCallback((seconds: number) => {
    if (wavesurfer.current && isReady) {
      const newTime = Math.max(0, Math.min(duration, wavesurfer.current.getCurrentTime() + seconds));
      wavesurfer.current.setTime(newTime);
      setCurrentTime(newTime);
    }
  }, [isReady, duration]);

  const setCurrentAsStart = () => {
    if (wavesurfer.current && isReady) {
      const t = Number(wavesurfer.current.getCurrentTime().toFixed(2));
      handleStartTimeChange(t);
    }
  };

  const setCurrentAsEnd = () => {
    if (wavesurfer.current && isReady) {
      const t = Number(wavesurfer.current.getCurrentTime().toFixed(2));
      handleEndTimeChange(t);
    }
  };

  // イン～アウトの区間をまるごと前後にシフト
  const shiftRange = (direction: 1 | -1) => {
    const len = endTime - startTime;
    if (len <= 0) return;
    let newStart = startTime + len * direction;
    let newEnd = endTime + len * direction;
    if (newStart < 0) { newStart = 0; newEnd = len; }
    if (newEnd > duration) { newEnd = duration; newStart = duration - len; }
    if (newStart < 0) newStart = 0;
    setStartTime(Number(newStart.toFixed(2)));
    setEndTime(Number(newEnd.toFixed(2)));
    if (activeRegion.current) {
      activeRegion.current.setOptions({ start: Number(newStart.toFixed(2)), end: Number(newEnd.toFixed(2)) });
    }
    wavesurfer.current?.setTime(Number(newStart.toFixed(2)));
    setCurrentTime(Number(newStart.toFixed(2)));
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [togglePlay]);

  const handleStartTimeChange = (val: number) => {
    if (val < 0) val = 0;
    if (val > duration) val = duration;
    const v = Number(val.toFixed(2));
    if (v >= endTime) {
      // イン点がアウト点を超えた → スワップ
      setStartTime(endTime);
      setEndTime(v);
      wavesurfer.current?.setTime(v);
      if (activeRegion.current) {
        activeRegion.current.setOptions({ start: endTime, end: v });
      }
    } else {
      setStartTime(v);
      wavesurfer.current?.setTime(v);
      if (activeRegion.current) {
        activeRegion.current.setOptions({ start: v, end: endTime });
      }
    }
  };

  const handleEndTimeChange = (val: number) => {
    if (val < 0) val = 0;
    if (val > duration) val = duration;
    const v = Number(val.toFixed(2));
    if (v <= startTime) {
      // アウト点がイン点を下回った → スワップ
      setEndTime(startTime);
      setStartTime(v);
      wavesurfer.current?.setTime(v);
      if (activeRegion.current) {
        activeRegion.current.setOptions({ start: v, end: startTime });
      }
    } else {
      setEndTime(v);
      if (activeRegion.current) {
        activeRegion.current.setOptions({ start: startTime, end: v });
      }
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  /** "m:ss.cc" 形式の文字列を秒数(number)にパース */
  const parseTimeString = (str: string): number | null => {
    const match = str.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
    if (!match) return null;
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const cs = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) : 0;
    return mins * 60 + secs + cs / 100;
  };

  if (!audioFile) return null;

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
      {/* ズームコントロール */}
      <div className="flex items-center justify-end gap-3 text-neutral-600 dark:text-neutral-400">
        <ZoomOut className="w-4 h-4" />
        <input 
          type="range" 
          min="1" 
          max="20" 
          step="1" 
          value={zoom} 
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-24 accent-blue-500"
        />
        <ZoomIn className="w-4 h-4" />
      </div>

      {/* 波形表示エリア */}
      <div className="relative">
        {!isReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-neutral-950/80 rounded-lg backdrop-blur-sm">
            <div className="text-sm font-medium text-blue-400 animate-pulse flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
              音声データを解析中...
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full bg-white dark:bg-neutral-950/50 rounded-lg overflow-x-auto overflow-y-hidden border border-neutral-200 dark:border-neutral-800" />
      </div>

      {/* コントロールパネル */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 再生コントロールグループ */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            {/* スキップ戻る */}
            <button
              onClick={() => skip(-skipSeconds)}
              disabled={!isReady}
              className="flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium whitespace-nowrap bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={`${skipSeconds}秒戻る`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {skipSeconds}s
            </button>

            {/* 再生 */}
            <button
              onClick={togglePlay}
              disabled={!isReady}
              className="w-11 h-11 flex items-center justify-center bg-blue-100 hover:bg-blue-200 dark:bg-blue-600 dark:hover:bg-blue-500 text-blue-700 dark:text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* スキップ進む */}
            <button
              onClick={() => skip(skipSeconds)}
              disabled={!isReady}
              className="flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium whitespace-nowrap bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={`${skipSeconds}秒進む`}
            >
              {skipSeconds}s
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {/* Undo/Redoボタン (再生ボタンの下) */}
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo || !isReady}
              className="p-1.5 text-neutral-500 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="元に戻す (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo || !isReady}
              className="p-1.5 text-neutral-500 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="やり直し (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* スキップ秒数選択 */}
        <select
          value={skipSeconds}
          onChange={(e) => setSkipSeconds(Number(e.target.value))}
          className="px-1.5 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-md"
          title="スキップ秒数"
        >
          {[1, 2, 3, 5, 10, 15, 30].map(s => (
            <option key={s} value={s}>{s}秒</option>
          ))}
        </select>

        <div className="text-sm font-mono text-neutral-700 dark:text-neutral-300 tabular-nums w-20">
          {formatTime(currentTime)}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={playFromIn}
            disabled={!isReady}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="イン点から再生"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            IN から再生
          </button>
          <button
            onClick={toggleLoopMode}
            disabled={!isReady}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              loopMode === "loop"
                ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/30"
                : loopMode === "once"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
            title={loopMode === "loop" ? "ループ再生中（クリックで1回再生に）" : loopMode === "once" ? "1回のみ再生中（クリックで通常再生に）" : "通常再生中（クリックでループに）"}
          >
            {loopMode === "loop" ? <Repeat className="w-3.5 h-3.5" /> : loopMode === "once" ? <MoveRight className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />}
            {loopMode === "loop" ? "ループ再生" : loopMode === "once" ? "1回のみ再生" : "通常再生"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white dark:bg-neutral-950 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
            {[0.5, 0.75, 1.0, 1.5].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  playbackRate === rate
                    ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Volume2 className="w-4 h-4 shrink-0" />
            <input type="range" min="0" max="1" step="0.01" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 accent-blue-500"
            />
            <span className="text-xs font-mono w-8 text-right">{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>

      {/* イン/アウト設定 + 区間シフト */}
      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
        {/* 区間シフトボタン */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => shiftRange(-1)}
            disabled={!isReady || endTime - startTime <= 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium whitespace-nowrap bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="イン～アウトの範囲をまるごと前の区間へ移動"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            前の区間
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-500 font-mono tabular-nums">
            区間: {formatTime(endTime - startTime)}
          </span>
          <button
            onClick={() => shiftRange(1)}
            disabled={!isReady || endTime - startTime <= 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium whitespace-nowrap bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="イン～アウトの範囲をまるごと次の区間へ移動"
          >
            次の区間
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex justify-between">
              <span>開始位置 (イン点)</span>
              <span className="font-mono text-blue-400">{formatTime(startTime)}</span>
            </label>
            <input type="range" min={0} max={duration} step={0.01} value={startTime}
              onChange={(e) => handleStartTimeChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => handleStartTimeChange(startTime - 0.1)} className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 rounded text-xs font-mono transition-colors">-0.1s</button>
              <button onClick={() => handleStartTimeChange(startTime + 0.1)} className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 rounded text-xs font-mono transition-colors">+0.1s</button>
              <button onClick={setCurrentAsStart} disabled={!isReady}
                className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
                title="現在の停止位置をイン点にセット"
              >
                <Locate className="w-3 h-3" />
                現在位置
              </button>
              <div className="flex-1 min-w-[100px]">
                <TimeInput value={startTime} onChange={handleStartTimeChange} formatTime={formatTime} parseTimeString={parseTimeString} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex justify-between">
              <span>終了位置 (アウト点)</span>
              <span className="font-mono text-blue-400">{formatTime(endTime)}</span>
            </label>
            <input type="range" min={0} max={duration} step={0.01} value={endTime}
              onChange={(e) => handleEndTimeChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => handleEndTimeChange(endTime - 0.1)} className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 rounded text-xs font-mono transition-colors">-0.1s</button>
              <button onClick={() => handleEndTimeChange(endTime + 0.1)} className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 rounded text-xs font-mono transition-colors">+0.1s</button>
              <button onClick={setCurrentAsEnd} disabled={!isReady}
                className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
                title="現在の停止位置をアウト点にセット"
              >
                <Locate className="w-3 h-3" />
                現在位置
              </button>
              <div className="flex-1 min-w-[100px]">
                <TimeInput value={endTime} onChange={handleEndTimeChange} formatTime={formatTime} parseTimeString={parseTimeString} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

WaveformEditor.displayName = "WaveformEditor";

export default WaveformEditor;
