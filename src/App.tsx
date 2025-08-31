import { useEffect, useMemo, useState } from "react";

/** ---------- 型 ---------- */
type Card = { id?: string; front: string; back: string; hint?: string };
type Deck = { id?: string; title: string; description?: string; cards: Card[] };
type DeckMeta = {
  id: string;
  title: string;
  description?: string;
  file?: string; // /public/decks のファイル名
  path?: string; // あるいは /decks/xxx.json の絶対/相対
  count?: number; // 表示には使わない（ズレOK）
};

/** 反復間隔（Leitner） */
const BOX_INTERVAL_MS = [0, 1*60e3, 10*60e3, 60*60e3, 6*60*60e3, 24*60*60e3, 72*60*60e3] as const;

type CardState = { box: number; next: number; streak: number };
type SaveBlob = { deckId: string; version: number; perCard: Record<string, CardState> };
const SAVE_VERSION = 1;

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
  } catch { return null; }
}
function writeSave(deckId: string, blob: SaveBlob) {
  try { localStorage.setItem(keyFor(deckId), JSON.stringify(blob)); } catch {}
}

const INDEX_URL = "/decks/index.json";
const deckUrl = (m: DeckMeta) => m.path ?? (m.file ? `/decks/${m.file}` : `/decks/${m.id}.json`);

/** ★ゆらぎ吸収：デッキJSONが「配列だけ」の場合にも対応して正規化 */
async function fetchDeckNormalized(meta: DeckMeta): Promise<Deck> {
  const res = await fetch(deckUrl(meta), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();

  // 1) { cards: [...] } 形式
  if (raw && Array.isArray(raw.cards)) {
    const d = raw as Partial<Deck>;
    return {
      id: d.id ?? meta.id,
      title: d.title ?? meta.title,
      description: d.description ?? meta.description,
      cards: d.cards as Card[],
    };
  }
  // 2) [ {...}, {...} ] 形式（配列だけ）
  if (Array.isArray(raw)) {
    return {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      cards: raw as Card[],
    };
  }
  // 3) 予期しない形式 → 空デッキで返す
  return { id: meta.id, title: meta.title, description: meta.description, cards: [] };
}

/** ---------- メイン ---------- */
export default function App() {
  const [menus, setMenus] = useState<DeckMeta[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [deck, setDeck] = useState<Deck | null>(null);
  const [save, setSave] = useState<SaveBlob | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        setMenuLoading(true);
        const r = await fetch(INDEX_URL, { cache: "no-store" });
        const data = (await r.json()) as DeckMeta[];
        setMenus(data);
      } catch (e) {
        console.error("index.json 読み込み失敗:", e);
        setMenus([]);
      } finally {
        setMenuLoading(false);
      }
    })();
  }, []);

  // ★各デッキの実枚数は「実ファイル」を読んでカウント（cards配列 or 配列だけ に対応）
  useEffect(() => {
    if (!menus.length) return;
    (async () => {
      const entries = await Promise.all(
        menus.map(async (m) => {
          try {
            const res = await fetch(deckUrl(m), { cache: "no-store" });
            if (!res.ok) throw new Error();
            const raw = await res.json();
            const n = Array.isArray(raw?.cards)
              ? raw.cards.length
              : Array.isArray(raw)
              ? raw.length
              : 0;
            return [m.id, n] as const;
          } catch {
            return [m.id, 0] as const;
          }
        })
      );
      setCounts(Object.fromEntries(entries));
    })();
  }, [menus]);

  async function openDeck(m: DeckMeta) {
    try {
      const d = await fetchDeckNormalized(m);
      // 各カードに id 付与
      d.cards = (d.cards ?? []).map((c, i) => ({ ...c, id: c.id ?? `${d.id ?? m.id}#${i}` }));
      setDeck(d);

      const deckId = d.id ?? m.id;
      const loaded = readSave(deckId);
      if (loaded) setSave(loaded);
      else {
        const init: SaveBlob = { deckId, version: SAVE_VERSION, perCard: {} };
        writeSave(deckId, init);
        setSave(init);
      }
      setCurrentIdx(0);
    } catch (e) {
      alert(`デッキを読み込めませんでした: ${e}`);
    }
  }

  const updateSave = (mutate: (draft: SaveBlob) => void) => {
    if (!deck) return;
    const deckId = deck.id ?? "unknown";
    setSave((prev) => {
      const base: SaveBlob = prev ?? { deckId, version: SAVE_VERSION, perCard: {} };
      const draft: SaveBlob = JSON.parse(JSON.stringify(base));
      mutate(draft);
      writeSave(deckId, draft);
      return draft;
    });
  };

  const stateOf = (c: Card): CardState => save?.perCard[c.id!] ?? { box: 0, next: 0, streak: 0 };

  const nextIndex = useMemo(() => {
    if (!deck) return 0;
    const t = now();
    const due = deck.cards
      .map((c, i) => ({ i, st: stateOf(c) }))
      .filter((x) => x.st.next <= t)
      .sort((a, b) => a.st.next - b.st.next)[0]?.i;
    if (due != null) return due;

    const idx = deck.cards
      .map((c, i) => ({ i, st: stateOf(c) }))
      .sort((a, b) => (a.st.box !== b.st.box ? a.st.box - b.st.box : a.st.next - b.st.next))[0]?.i;
    return idx ?? 0;
  }, [deck, save]);

  const progress = useMemo(() => {
    if (!deck) return { learned: 0, total: 0, percent: 0 };
    const total = deck.cards.length;
    const learned = deck.cards.filter((c) => stateOf(c).box >= 3).length;
    const percent = total ? Math.round((learned / total) * 100) : 0;
    return { learned, total, percent };
  }, [deck, save]);

  const card = useMemo(() => (deck ? deck.cards[currentIdx ?? nextIndex] ?? null : null), [deck, currentIdx, nextIndex]);

  function onAnswer(ok: boolean) {
    if (!deck || !card) return;
    const id = card.id!;
    const t = now();
    updateSave((draft) => {
      const cur = draft.perCard[id] ?? { box: 0, next: 0, streak: 0 };
      if (ok) {
        const nb = Math.min(cur.box + 1, BOX_INTERVAL_MS.length - 1);
        draft.perCard[id] = { box: nb, next: t + BOX_INTERVAL_MS[nb], streak: cur.streak + 1 };
      } else {
        draft.perCard[id] = { box: 0, next: t + BOX_INTERVAL_MS[1], streak: 0 };
      }
    });
    setCurrentIdx(nextIndex);
  }

  function resetDeck() {
    if (!deck) return;
    if (!confirm("このデッキの学習履歴をリセットします。よろしいですか？")) return;
    const deckId = deck.id ?? "unknown";
    const blank: SaveBlob = { deckId, version: SAVE_VERSION, perCard: {} };
    writeSave(deckId, blank);
    setSave(blank);
    setCurrentIdx(0);
  }

  /* ---------- UI ---------- */
  if (!deck) {
    return (
      <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>地理攻略トレーナー（ミニ）</h1>

        {menuLoading && <p>読み込み中...</p>}
        {!menuLoading && menus.length === 0 && (
          <div style={{ padding: "12px 16px", border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
            <strong>decks/index.json</strong> が空か見つかりません。まずは <strong>index.json</strong> とデッキを追加してください。
          </div>
        )}

        <ul style={{ display: "grid", gap: 12, marginTop: 12, listStyle: "none", paddingLeft: 0 }}>
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
                  {m.description && <div style={{ color: "#6b7280", marginTop: 4 }}>{m.description}</div>}
                  <div style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
                    カード: {count}　/　ファイル: {fileLabel}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <p style={{ marginTop: 24, color: "#6b7280", fontSize: 13 }}>
          ※ メニューは <code>/public/decks/index.json</code>、各デッキは <code>/public/decks/*.json</code> に置きます。
          <br />
          「<code>{`{ cards:[...] }`}</code>」形式でも「<code>[...]</code>（配列だけ）」でもOKです。
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setDeck(null)}
          style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer" }}
        >
          ← デッキ選択に戻る
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{deck.title}</h2>
        <div style={{ flex: 1 }} />
        <button
          onClick={resetDeck}
          style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer" }}
        >
          リセット
        </button>
      </div>

      <div style={{ marginTop: 12, marginBottom: 8, color: "#6b7280" }}>
        進捗：{deck.cards.filter((c) => (save?.perCard[c.id!]?.box ?? 0) >= 3).length}/{deck.cards.length}
      </div>
      <div style={{ width: "100%", height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${
              deck.cards.length
                ? Math.round(
                    (deck.cards.filter((c) => (save?.perCard[c.id!]?.box ?? 0) >= 3).length / deck.cards.length) * 100
                  )
                : 0
            }%`,
            height: "100%",
            background: "#10b981",
          }}
        />
      </div>

      {/* カード */}
      {card ? (
        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "white" }}>
          <div style={{ color: "#6b7280", fontSize: 14 }}>{deck.title} → {card.front}</div>
          <h1 style={{ fontSize: 34, margin: "10px 0 4px 0" }}>{card.front}</h1>
          <div style={{ marginTop: 12, padding: 16, borderRadius: 8, background: "#f9fafb", fontSize: 24 }}>
            {card.back}
            {card.hint && <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>ヒント: {card.hint}</div>}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              onClick={() => onAnswer(false)}
              style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: "#ef4444", color: "white", fontSize: 18, cursor: "pointer" }}
            >
              まだ
            </button>
            <button
              onClick={() => onAnswer(true)}
              style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: "#10b981", color: "white", fontSize: 18, cursor: "pointer" }}
            >
              覚えた！
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>カードがありません。</div>
      )}

      <div style={{ marginTop: 24, color: "#6b7280", fontSize: 13 }}>
        学習間隔：1分 → 10分 → 1h → 6h → 24h → 72h（正解が続くほど間隔が延びます）
      </div>
    </div>
  );
}
