/**
 * デフォルトのガイド背景画像パス（空文字の場合は初期表示なし）
 * 画像をデフォルトで表示したい場合は、ここにパスまたはBase64データURLを設定してください。
 * 例: '/assets/default-guide.png' または 'data:image/png;base64,...'
 */
export const DEFAULT_GUIDE_IMAGE: string | null = '/default.png';

export interface QueueItem {
  id: string;
  text: string;
  startIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  isSpacer?: boolean;
}

export interface LayoutItem extends QueueItem {
  manualBreak: boolean;
  alignOverride?: "left" | "center" | "right";
}

// --- CCFOLIA Export Types ---

export interface CcfoliaClickAction {
  type: "message";
  text: string;
}

export interface CcfoliaEntity {
  type: "object";
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  deckId: null;
  locked: boolean;
  visible: boolean;
  closed: boolean;
  withoutOwner: boolean;
  freezed: boolean;
  active: boolean;
  order: number;
  memo: string;
  imageUrl: string;
  coverImageUrl: null;
  clickAction?: CcfoliaClickAction;
}

export interface CcfoliaEffect {
  name: string;
  imageUrl: null;
  soundRef: null;
  active: boolean;
  playTime: number;
  order: number;
}

export interface CcfoliaData {
  meta: { version: string };
  resources: Record<string, { type: string }>;
  entities: {
    room: any | null;
    decks: Record<string, any>;
    items: Record<string, CcfoliaEntity>;
    notes: Record<string, any>;
    characters: Record<string, any>;
    scenes: Record<string, any>;
    savedatas: Record<string, any>;
    snapshots: Record<string, any>;
    effects?: Record<string, CcfoliaEffect>;
  };
}

// --- Master Integration Types ---

export interface MasterItem extends QueueItem {
  x: number; // CCFOLIA上の絶対座標 (px)
  y: number; // CCFOLIA上の絶対座標 (px)
  clickActionText?: string; // 元のZIPに含まれていたクリックアクションテキスト
}

export interface ImportGroup {
  id: string;
  name: string;
  prefix: string;
  items: MasterItem[];
  sourceFileName: string;
  offsetX: number; // 統合キャンバス上でのグループのオフセット
  offsetY: number; // 統合キャンバス上でのグループのオフセット
  width: number;   // グループ全体の幅
  height: number;  // グループ全体の高さ
}
