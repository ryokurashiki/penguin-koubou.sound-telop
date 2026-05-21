import JSZip from "jszip";
import { LayoutItem, CcfoliaData, CcfoliaEntity, MasterItem, ImportGroup, CcfoliaEffect } from "./lyricToolTypes";

const CCFOLIA_GRID_SIZE = 24; // 1グリッド = 24px

/**
 * 20桁のランダム英数字IDを生成（エンティティID用）
 */
function generateCcfoliaId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 64桁のランダム16進数文字列を生成（CCFOLIA準拠の画像ファイル名用）
 */
function generateHexId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * .tokenファイルの中身を生成
 */
function generateTokenContent(): string {
  return `0.${generateHexId()}`;
}

const CCFOLIA_BASE_DATA = {
  meta: { version: "1.1.0" },
  resources: {},
  entities: {
    room: {
      defaultAnonymousRole: null,
      backgroundUrl: null,
      foregroundUrl: null,
      embedUrl: null,
      thumbnailUrl: null,
      mapType: null,
      fieldWidth: 40,
      fieldHeight: 30,
      fieldObjectFit: "fill",
      alignWithGrid: false,
      messageChannels: [],
      messageGroups: [],
      markers: {},
      mediaRef: null,
      monitored: false,
      soundRef: null,
      sceneId: null,
      archived: false,
      backgroundColor: "",
      variables: [],
      underConstruction: false,
      hidden3dDice: false,
      initialSavedata: null,
      displayGrid: false,
      gridSize: 1,
      enableCrossfade: false,
      crossfadeDuration: 1
    },
    items: {},
    decks: {},
    notes: {},
    characters: {},
    effects: {},
    scenes: {},
    savedatas: {},
    snapshots: {}
  }
};

/**
 * dataUrlからBase64文字列部分のみを抽出する
 */
function extractBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] || "";
}

/**
 * dataUrlをUint8Arrayバイナリに変換する
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * バイナリデータの本物のSHA-256ハッシュを計算し、64桁の16進数文字列として返す
 */
async function calculateSHA256(data: Uint8Array): Promise<string> {
  const buffer: ArrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface PositionedExportItem {
  item: LayoutItem;
  x: number;
  y: number;
}

/**
 * レイアウトデータからCCFOLIA ZIP（Blob）を生成する
 */
export async function generateCcfoliaZip(
  items: LayoutItem[],
  songTitle: string,
  gapX: number,
  gapY: number,
  globalAlign?: "left" | "center" | "right"
): Promise<Blob> {
  const zip = new JSZip();
  const maxWidth = 1000;

  // --- レイアウト計算（LayoutTab.tsx のロジックと同じ） ---
  const positioned: PositionedExportItem[] = [];
  let currentY = 0;

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

  let lastAlign: "left" | "center" | "right" = globalAlign || "center";

  rawParagraphs.forEach(para => {
    const align = para[0]?.alignOverride || lastAlign;
    lastAlign = align;

    let lines: { items: LayoutItem[]; width: number; height: number }[] = [];
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

    lines.forEach(line => {
      let startX = 0;
      if (align === "center") {
        startX = Math.round((maxWidth - line.width) / 2 / CCFOLIA_GRID_SIZE) * CCFOLIA_GRID_SIZE;
      }
      if (align === "right") {
        startX = Math.round(Math.max(0, maxWidth - line.width) / CCFOLIA_GRID_SIZE) * CCFOLIA_GRID_SIZE;
      }

      let cx = startX;
      line.items.forEach(item => {
        if (!item.isSpacer) {
          positioned.push({ item, x: cx, y: currentY });
        }
        cx += item.width + gapX;
      });
      currentY += line.height + gapY;
    });
  });

  // --- data.json 生成 ---
  const resources: Record<string, { type: string }> = {};
  const entityItems: Record<string, CcfoliaEntity> = {};
  const effectItems: Record<string, CcfoliaEffect> = {};
  const safeTitle = songTitle.trim() || "Untitled";

  for (let index = 0; index < positioned.length; index++) {
    const pos = positioned[index];
    const entityId = generateCcfoliaId();

    // 画像データからSHA-256ハッシュを計算してファイル名とする
    let fileName = `${generateHexId()}.png`; // フォールバック
    if (pos.item.dataUrl) {
      const imageBytes = dataUrlToBytes(pos.item.dataUrl);
      const hash = await calculateSHA256(imageBytes);
      fileName = `${hash}.png`;
      zip.file(fileName, imageBytes);
    }

    resources[fileName] = { type: "image/png" };

    const memoText = pos.item.text
      .replace(/\|([^《]+)《[^》]+》/g, "$1"); // ルビ記法を除去してプレーンテキストに

    const gridW = Math.round(pos.item.width / CCFOLIA_GRID_SIZE);
    const gridH = Math.round(pos.item.height / CCFOLIA_GRID_SIZE);

    const entity: CcfoliaEntity = {
      type: "object",
      // ココフォリアの x, y はオブジェクトの左上座標（小数が有効）
      x: pos.x / CCFOLIA_GRID_SIZE,
      y: pos.y / CCFOLIA_GRID_SIZE,
      z: 1,
      angle: 0,
      width: gridW,
      height: gridH,
      deckId: null,
      locked: true,
      visible: true,
      closed: false,
      withoutOwner: false,
      freezed: true,
      active: true,
      order: index,
      memo: memoText,
      imageUrl: fileName,
      coverImageUrl: null,
    };

    // クリックアクションを自動生成: 「{テキスト}」@{曲名}_{連番}
    const clickActionText = `「${memoText}」@${safeTitle}_${index + 1}`;
    entity.clickAction = {
      type: "message",
      text: clickActionText,
    };

    entityItems[entityId] = entity;

    // カットイン(effects)の自動生成
    const effectId = generateCcfoliaId();
    effectItems[effectId] = {
      name: clickActionText,
      imageUrl: null,
      soundRef: null,
      active: false,
      playTime: 0,
      order: index + 1,
    };
  }

  const ccfoliaData = JSON.parse(JSON.stringify(CCFOLIA_BASE_DATA));
  ccfoliaData.resources = resources;
  ccfoliaData.entities.items = entityItems;
  ccfoliaData.entities.effects = effectItems;

  zip.file("__data.json", JSON.stringify(ccfoliaData, null, 2));
  zip.file(".token", generateTokenContent());
  // dataUrl（巨大なBase64）を除外してメタデータを保存（画像はZIP内のファイルから復元する）
  const metaItems = items.map(item => ({
    ...item,
    dataUrl: "", // ZIP内の画像ファイルから復元するため除外
  }));
  zip.file("__lyric_meta.json", JSON.stringify({ items: metaItems, songTitle, gapX, gapY }, null, 2));

  return zip.generateAsync({ type: "blob" });
}

/**
 * ZIPファイルからインポートグループを生成する
 */
export async function importCcfoliaZip(
  file: File
): Promise<{ name: string; items: MasterItem[]; width: number; height: number }> {
  const zip = await JSZip.loadAsync(file);
  const dataJsonFile = zip.file("__data.json") || zip.file("data.json");

  if (!dataJsonFile) {
    throw new Error("データファイルが見つかりません。CCFOLIAのZIPファイルを使用してください。");
  }

  const dataJsonText = await dataJsonFile.async("text");
  const data: CcfoliaData = JSON.parse(dataJsonText);

  const items: MasterItem[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const sortedEntities = Object.entries(data.entities.items).sort(
    ([, a], [, b]) => a.order - b.order
  );

  for (const [, entity] of sortedEntities) {
    const imageFile = zip.file(entity.imageUrl);
    let dataUrl = "";

    if (imageFile) {
      const imageData = await imageFile.async("base64");
      const mimeType = data.resources[entity.imageUrl]?.type || "image/png";
      dataUrl = `data:${mimeType};base64,${imageData}`;
    }

    const itemWidth = entity.width * CCFOLIA_GRID_SIZE;
    const itemHeight = entity.height * CCFOLIA_GRID_SIZE;
    const itemX = entity.x * CCFOLIA_GRID_SIZE;
    const itemY = entity.y * CCFOLIA_GRID_SIZE;

    minX = Math.min(minX, itemX);
    minY = Math.min(minY, itemY);
    maxX = Math.max(maxX, itemX + itemWidth);
    maxY = Math.max(maxY, itemY + itemHeight);

    items.push({
      id: Math.random().toString(36).substring(7),
      text: entity.memo || "",
      startIndex: 0,
      dataUrl,
      width: itemWidth,
      height: itemHeight,
      x: itemX,
      y: itemY,
      clickActionText: entity.clickAction?.text,
    });
  }

  const name = file.name.replace(/\.zip$/i, "");
  
  // もしアイテムがない場合は0幅/高さとする
  const width = items.length > 0 ? maxX - minX : 0;
  const height = items.length > 0 ? maxY - minY : 0;
  
  // グループのオフセット計算を容易にするため、全アイテムのローカル座標を (0,0) 基準にシフトする
  if (items.length > 0) {
    items.forEach(item => {
      item.x -= minX;
      item.y -= minY;
    });
  }

  return { name, items, width, height };
}

/**
 * 統合されたマスターデータをエクスポートする（自動レイアウトを行わず絶対座標を維持）
 */
export async function generateMergedCcfoliaZip(
  groups: ImportGroup[],
  outputFileName: string
): Promise<Blob> {
  const zip = new JSZip();
  const resources: Record<string, { type: string }> = {};
  const entityItems: Record<string, CcfoliaEntity> = {};
  const effectItems: Record<string, CcfoliaEffect> = {};

  const safeTitle = outputFileName.trim() || "master_ccfolia";
  let globalOrder = 0;

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    for (let iIdx = 0; iIdx < group.items.length; iIdx++) {
      const item = group.items[iIdx];
      
      const entityId = generateCcfoliaId();

      // 画像データからSHA-256ハッシュを計算してファイル名とする
      let fileName = `${generateHexId()}.png`; // フォールバック
      if (item.dataUrl) {
        const imageBytes = dataUrlToBytes(item.dataUrl);
        const hash = await calculateSHA256(imageBytes);
        fileName = `${hash}.png`;
        zip.file(fileName, imageBytes);
      }

      resources[fileName] = { type: "image/png" };

      // オフセットを加算した最終座標
      const finalX = item.x + group.offsetX;
      const finalY = item.y + group.offsetY;

      // プレフィックスと連番を組み合わせた一意のサフィックス
      const suffix = `${group.prefix}_${globalOrder}`;

      // 元のクリックアクションがあればそれをベースにする
      let clickActionText = `「${item.text}」@${suffix}`;
      if (item.clickActionText) {
        // 最後の '@' 以降を置換する。'@' がなければ末尾に追加する
        const lastAtIdx = item.clickActionText.lastIndexOf('@');
        if (lastAtIdx !== -1) {
          clickActionText = `${item.clickActionText.substring(0, lastAtIdx)}@${suffix}`;
        } else {
          clickActionText = `${item.clickActionText}@${suffix}`;
        }
      }

      const entity: CcfoliaEntity = {
        type: "object",
        x: finalX / CCFOLIA_GRID_SIZE,
        y: finalY / CCFOLIA_GRID_SIZE,
        z: 1,
        angle: 0,
        width: Math.round(item.width / CCFOLIA_GRID_SIZE),
        height: Math.round(item.height / CCFOLIA_GRID_SIZE),
        deckId: null,
        locked: true,
        visible: true,
        closed: false,
        withoutOwner: false,
        freezed: true,
        active: true,
        order: globalOrder++,
        memo: item.text, // 元のテキストのまま
        imageUrl: fileName,
        coverImageUrl: null,
        clickAction: {
          type: "message",
          text: clickActionText,
        }
      };

      entityItems[entityId] = entity;

      // カットイン(effects)の自動生成
      const effectId = generateCcfoliaId();
      effectItems[effectId] = {
        name: clickActionText,
        imageUrl: null,
        soundRef: null,
        active: false,
        playTime: 0,
        order: globalOrder, // 上で post-increment (++) された後の値なので自然数連番としてそのまま使える
      };
    }
  }

  const ccfoliaData = JSON.parse(JSON.stringify(CCFOLIA_BASE_DATA));
  ccfoliaData.resources = resources;
  ccfoliaData.entities.items = entityItems;
  ccfoliaData.entities.effects = effectItems;

  zip.file("__data.json", JSON.stringify(ccfoliaData, null, 2));
  zip.file(".token", generateTokenContent());

  return zip.generateAsync({ type: "blob" });
}
