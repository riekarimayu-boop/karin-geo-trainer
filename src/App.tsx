import { useEffect, useMemo, useState } from "react";

/** ---------- 型 ---------- */
type Card = {
  id?: string;
  front: string;
  back: string;
  hint?: string;
};
type Deck = {
  id: string;
  title: string;
  description?: string;
  cards: Card[];
};
type DeckMeta = {
  id: string;
  title: string;
  description?: string;
  /** どちらかが入っていればOK（file を推奨） */
  file?: string; // /public/decks 以下のファイル名（例: landforms-reading.json）
  path?: string; // あるいは相対/絶対パス（例: /decks/landforms-reading.json）
  count?: number; // 任意（表示には使わない・ズレてもOK）
};

/** ---------- 反復間隔（Leitner） ----------
 *  0: すぐ
 *  1: 1分
 *  2: 10分
 *  3: 1時間
 *  4: 6時間
 *  5: 24時間
 *  6: 72時間
 */
const BOX_INTERVAL_MS = [
  0,
  1 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
] as const;

type CardState = {
  box: number; // 0..6
  next: number; // 次回出題時刻（epoch ms）
  streak: number; // 連続正解
};
type SaveBlob = {
  deckId: string;
  version: number;
  perCard: Record<string, CardState>;
};
const SAVE_VERSION = 1;

/** ---------- ユーティリティ ---------- */
const now = () => Date.now();
const keyFor = (deckId: string) => `geo-trainer:deck:${deckId}`;

function readSave(deckId: string): SaveBlob | null {
  try {
    const raw = localStorage.getItem(keyFor(deckId));
    if (!raw) return null;
    const json = JSON.parse(raw) as SaveBlob;
    if (json.version !== SAVE_VERSION) return null;
    if (json.deckId !== deckId) return null;
    return json;
  } catch {
    return null;
  }
}
function writeSave(deckId: string, blob: SaveBlob) {
  try {
    localStorage.setItem(keyFor(deckId), JSON.stringify(blob));
  } catch {
    // noop
  }
}

/** deck index.json のURL */
const INDEX_URL = "/decks/index.json";

/** file/path から実際に読み込むURLを決める */
function deckUrl(m: DeckMeta) {
  return m.path ?? (m.file ? `/decks/${m.file}` : `/decks/${m.id}.json`);
}

/** ---------- メインコンポーネント ---------- */
export default function App() {
  // メニュー（index.json）
  const [menus, setMenus] = useState<DeckMeta[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  // 各デッキの実カード枚数（自動集計）
  const [counts, setCounts] = useState<Record<string, number>>({});

  // 現在学習中のデッキ
  const [deck, setDeck] = useState<Deck | null>(null);

  // 保存データ
  const [save, setSave] = useState<SaveBlob | null>(null);

  // 現在カードの index
  const [currentIdx, setCurrentIdx] = useState<number>(0);

  /** index.json を読む */
  useEffect(() => {
    (async () => {
      try {
        setMenuLoading(true);
        const res = await fetch(INDEX_URL, { cache: "no-store" });
        const data = (await res.json()) as DeckMeta[];
        setMenus(data);
      } catch (e) {
        console.error("index.json を読み込めませんでした", e);
        setMenus([]);
      } finally {
        setMenuLoading(false);
      }
    })();
  }, []);

  /** メニューが読めたら、各デッキの実カード数を並列で取得 */
  useEffect(() => {
    if (!menus || menus.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        menus.map(async (m) => {
          const url = deckUrl(m);
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error();
            const d = (await res.json()) as Deck;
            const n = Array.isArray(d.cards) ? d.cards.length : 0;
            return [m.id, n] as const;
          } catch {
            return [m.id, 0] as const;
          }
        })
      );
      setCounts(Object.fromEntries(entries));
    })();
  }, [menus]);

  /** 学習開始（デッキ読み込み） */
  async function openDeck(m: DeckMeta) {
    try {
      const url = deckUrl(m);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as Deck;
      // id がないカードには連番 id を付与
      d.cards = d.cards.map((c, i) => ({ ...c, id: c.id ?? `${d.id}#${i}` }));
      setDeck(d);

      // 保存を読み込む（なければ初期化）
      const loaded = readSave(d.id);
      if (loaded) {
        setSave(loaded);
      } else {
        const init: SaveBlob = {
          deckId: d.id,
          version: SAVE_VERSION,
          perCard: {},
        };
        writeSave(d.id, init);
        setSave(init);
      }
      setCurrentIdx(0);
    } catch (e) {
      alert(`デッキを読み込めませんでした: ${e}`);
    }
  }

  /** 保存スナップショットを更新 */
  function updateSave(mutator: (draft: SaveBlob) => void) {
    if (!deck) return;
    setSave((prev) => {
      const base: SaveBlob =
        prev ?? { deckId: deck.id, version: SAVE_VERSION, perCard: {} };
      const draft: SaveBlob = JSON.parse(JSON.stringify(base));
      mutator(draft);
      writeSave(deck.id, draft);
      return draft;
    });
  }

  /** あるカードの現在の状態（未学習なら初期状態） */
  function stateOf(card: Card): CardState {
    const id = card.id!;
    const s = save?.perCard[id];
    return s ?? { box: 0, next: 0, streak: 0 };
  }

  /** 次に出すカード index を決める */
  const nextIndex = useMemo(() => {
    if (!deck) return 0;
    const t = now();
    // まず「期限が来ているカード」を優先
    const dueIdx = deck.cards
      .map((c, i) => ({ c, i, st: stateOf(c) }))
      .filter((x) => x.st.next <= t)
      .sort((a, b) => a.st.next - b.st.next)[0]?.i;

    if (dueIdx != null) return dueIdx;

    // それがない場合は box が浅い順 → next の早い順
    const idx = deck.cards
      .map((c, i) => ({ c, i, st: stateOf(c) }))
      .sort((a, b) =>
        a.st.box !== b.st.box ? a.st.box - b.st.box : a.st.next - b.st.next
      )[0]?.i;

    return idx ?? 0;
  }, [deck, save]);

  /** 進捗（適当に box>=3 を「一応覚えた」とみなす） */
  const progress = useMemo(() => {
    if (!deck) return { learned: 0, total: 0, percent: 0 };
    const total = deck.cards.length;
    const learned = deck.cards.filter((c) => stateOf(c).box >= 3).length;
    const percent = total ? Math.round((learned / total) * 100) : 0;
    return { learned, total, percent };
  }, [deck, save]);

  /** 現在カード */
  const card = useMemo(() => {
    if (!deck) return null;
    const idx = currentIdx != null ? currentIdx : nextIndex;
    return deck.cards[idx ?? 0] ?? null;
  }, [deck, currentIdx, nextIndex]);

  /** ボタン押下（覚えた / まだ） */
  function onAnswer(correct: boolean) {
    if (!deck || !card) return;
    const id = card.id!;
    const t = now();

    updateSave((draft) => {
      const cur = draft.perCard[id] ?? { box: 0, next: 0, streak: 0 };
      if (correct) {
        const nextBox = Math.min(cur.box + 1, BOX_INTERVAL_MS.length - 1);
        const next = t + BOX_INTERVAL_MS[nextBox];
        draft.perCard[id] = {
          box: nextBox,
          next,
          streak: cur.streak + 1,
        };
      } else {
        // 失敗したら box を 0 に戻す（次回 1 分後）
        const next = t + BOX_INTERVAL_MS[1];
        draft.perCard[id] = {
          box: 0,
          next,
          streak: 0,
        };
      }
    });

    // 次のカードへ
    setCurrentIdx(nextIndex); // 最新の nextIndex を使う
  }

  /** リセット */
  function resetDeck() {
    if (!deck) return;
    if (!confirm("このデッキの学習履歴をリセットします。よろしいですか？")) return;
    const blank: SaveBlob = { deckId: deck.id, version: SAVE_VERSION, perCard: {} };
    writeSave(deck.id, blank);
    setSave(blank);
    setCurrentIdx(0);
  }

  /** ---------- 画面 ---------- */

  // デッキ未選択 → メニュー
  if (!deck) {
    return (
      <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
          地理攻略トレーナー（ミニ）
        </h1>

        {menuLoading && <p>読み込み中...</p>}

        {!menuLoading && menus.length === 0 && (
          <div
            style={{
              padding: "12px 16px",
              border: "1px solid #eee",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <strong>decks/index.json</strong> が空か見つかりません。まずは{" "}
            <strong>index.json</strong> とデッキを追加してください。
          </div>
        )}

        <ul style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {menus.map((m) => {
            const count = counts[m.id] ?? m.count ?? "…";
            const fileLabel = m.file ?? m.path ?? `${m.id}.json`;
            return (
              <li key={m.id}>
                <button
                  onClick={() => openDeck(m)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "14px 16px",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{m.title}</div>
                  {m.description && (
                    <div style={{ color: "#6b7280", marginTop: 4 }}>
                      {m.description}
                    </div>
                  )}
                  <div style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
                    カード: {count}　/　ファイル: {fileLabel}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <p style={{ marginTop: 24, color: "#6b7280", fontSize: 13 }}>
          ※ メニューは <code>/public/decks/index.json</code>、各デッキは{" "}
          <code>/public/decks/*.json</code> に置きます（
          <code>file</code> か <code>path</code> を指定）。枚数表示は実ファイルから自動集計されます。
        </p>
      </div>
    );
  }

  // 学習画面
  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: "0 16px" }}>
      {/* ヘッダ */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setDeck(null)}
          style={{
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            background: "white",
            cursor: "pointer",
          }}
        >
          ← デッキ選択に戻る
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{deck.title}</h2>

        <div style={{ flex: 1 }} />

        <button
          onClick={resetDeck}
          style={{
            padding: "6px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            background: "white",
            cursor: "pointer",
          }}
        >
          リセット
        </button>
      </div>

      {/* 進捗 */}
      <div style={{ marginTop: 12, marginBottom: 8, color: "#6b7280" }}>
        進捗：{progress.learned}/{progress.total}（{progress.percent}%）
      </div>
      <div
        style={{
          width: "100%",
          height: 8,
          background: "#f3f4f6",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress.percent}%`,
            height: "100%",
            background: "#10b981",
          }}
        />
      </div>

      {/* カード本体 */}
      {card ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            background: "white",
          }}
        >
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            {deck.title} → {card.front}
          </div>

          <h1 style={{ fontSize: 34, margin: "10px 0 4px 0" }}>{card.front}</h1>

          <div
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 8,
              background: "#f9fafb",
              fontSize: 24,
            }}
          >
            {card.back}
            {card.hint && (
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
                ヒント: {card.hint}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 16,
            }}
          >
            <button
              onClick={() => onAnswer(false)}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: "#ef4444",
                color: "white",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              まだ
            </button>
            <button
              onClick={() => onAnswer(true)}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: "#10b981",
                color: "white",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              覚えた！
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>カードがありません。</div>
      )}

      {/* 学習間隔の注記 */}
      <div style={{ marginTop: 24, color: "#6b7280", fontSize: 13 }}>
        学習間隔：1分 → 10分 → 1h → 6h → 24h → 72h（正解が続くほど間隔が延びます）
      </div>
    </div>
  );
}
