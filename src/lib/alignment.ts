export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface AlignedLine {
  id: string;
  text: string;
  start: number | null;
  end: number | null;
  chunks: WhisperChunk[];
}

// レーベンシュタイン距離を用いた文字列類似度計算 (0.0 ~ 1.0)
function calculateSimilarity(str1: string, str2: string): number {
  if (str1.length === 0 && str2.length === 0) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null)
  );
  for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const distance = track[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

// 記号や空白を取り除いてプレーンなテキストで比較するための正規化
function normalizeText(text: string): string {
  return text.replace(/[\s　、。！？,.\!?]/g, '').toLowerCase();
}

export function alignTextAndTimestamps(
  userLines: string[],
  whisperChunks: WhisperChunk[]
): AlignedLine[] {
  const result: AlignedLine[] = [];
  const flatChunks = whisperChunks.filter(c => c.timestamp[0] !== null);
  if (flatChunks.length === 0) return result;

  let chunkIndex = 0;

  for (let i = 0; i < userLines.length; i++) {
    const lineText = userLines[i].trim();
    if (!lineText) continue;

    if (chunkIndex >= flatChunks.length) {
      // チャンクが足りない場合は最後のチャンクを割り当てる
      const lastChunk = flatChunks[flatChunks.length - 1];
      result.push({
        id: `line-${i}-${Date.now()}`,
        text: lineText,
        start: lastChunk.timestamp[0],
        end: lastChunk.timestamp[1] ?? (lastChunk.timestamp[0] + 5),
        chunks: [lastChunk]
      });
      continue;
    }

    const normLineText = normalizeText(lineText);
    
    let bestScore = -1;
    let bestEndIndex = chunkIndex;
    let accumulatedText = "";

    // 現在の位置から最大15チャンク程度先まで見て、最も類似度が高くなる組み合わせを探す
    for (let j = chunkIndex; j < Math.min(chunkIndex + 15, flatChunks.length); j++) {
      accumulatedText += normalizeText(flatChunks[j].text);
      const score = calculateSimilarity(normLineText, accumulatedText);
      
      if (score > bestScore) {
        bestScore = score;
        bestEndIndex = j;
      }
      
      // ほぼ完全一致（類似度0.9以上）または十分に長い場合そこで探索を打ち切る
      if (score >= 0.9 || accumulatedText.length > normLineText.length + 5) {
        break;
      }
    }

    if (bestScore < 0.1) {
      // 類似度が著しく低い（全く一致しない）場合は、ハルシネーションと判定してスキップ
      result.push({
        id: `line-${i}-${Date.now()}`,
        text: lineText,
        start: null,
        end: null,
        chunks: []
      });
      continue;
    }

    const matchedChunks = flatChunks.slice(chunkIndex, bestEndIndex + 1);
    const startChunk = matchedChunks[0];
    const endChunk = matchedChunks[matchedChunks.length - 1];

    result.push({
      id: `line-${i}-${Date.now()}`,
      text: lineText,
      start: startChunk.timestamp[0],
      end: endChunk.timestamp[1] ?? (endChunk.timestamp[0] + 5),
      chunks: matchedChunks
    });

    chunkIndex = bestEndIndex + 1;
  }

  return result;
}
