import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

export const loadFfmpeg = async (onProgress?: (p: { progress: number }) => void) => {
  if (ffmpeg) {
    if (onProgress) {
      ffmpeg.off("progress", onProgress); // 古いリスナーを削除（あれば）
      ffmpeg.on("progress", onProgress);
    }
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  if (onProgress) {
    ffmpeg.on("progress", onProgress);
  }

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  return ffmpeg;
};

export const trimAudio = async (
  file: File,
  start: number,
  end: number,
  outputName: string,
  onProgress?: (p: { progress: number }) => void,
  gain?: number
): Promise<Blob> => {
  const f = await loadFfmpeg(onProgress);

  const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
  await f.writeFile(safeName, await fetchFile(file));

  const outName = "output_clip.mp3";
  const args = [
    "-i", safeName,
    "-ss", start.toString(),
    "-to", end.toString(),
  ];

  if (gain && gain !== 1.0) {
    args.push("-af", `volume=${gain.toFixed(4)}`);
  }

  args.push("-b:a", "128k", "-y", outName);

  await f.exec(args);

  const data = await f.readFile(outName);
  
  await f.deleteFile(safeName);
  await f.deleteFile(outName);

  return new Blob([data as any], { type: "audio/mp3" });
};

export const trimMultipleAudio = async (
  file: File,
  clips: { name: string; start: number; end: number }[],
  onProgress?: (msg: string) => void,
  gain?: number
): Promise<Blob[]> => {
  const blobs: Blob[] = [];
  const BATCH_SIZE = 20; // 20クリップごとにFFmpegインスタンスを再起動してメモリを解放

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");
  const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");

  for (let i = 0; i < clips.length; i += BATCH_SIZE) {
    const batch = clips.slice(i, i + BATCH_SIZE);
    
    // バッチごとに独立したFFmpegインスタンスを作成
    const f = new FFmpeg();
    await f.load({ coreURL, wasmURL });

    // 元ファイルを仮想FSに書き込む
    await f.writeFile(safeName, await fetchFile(file));

    for (let j = 0; j < batch.length; j++) {
      const clipIndex = i + j;
      const clip = batch[j];
      
      if (onProgress) {
        onProgress(`処理中: ${clip.name} (${clipIndex + 1}/${clips.length})`);
      }

      const outName = `output_clip_${clipIndex}.mp3`;
      const args = [
        "-i", safeName,
        "-ss", clip.start.toString(),
        "-to", clip.end.toString(),
      ];

      if (gain && gain !== 1.0) {
        args.push("-af", `volume=${gain.toFixed(4)}`);
      }

      args.push("-b:a", "128k", "-y", outName);

      await f.exec(args);

      const data = await f.readFile(outName);
      blobs.push(new Blob([data as any], { type: "audio/mp3" }));
      
      await f.deleteFile(outName);
    }

    // WASMメモリ解放のためインスタンスを破棄
    f.terminate();
  }

  return blobs;
};
