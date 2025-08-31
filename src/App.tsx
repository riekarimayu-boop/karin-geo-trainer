import React, { useEffect, useMemo, useState } from "react";

// ── データ型 ─────────────────────────────────────────
type DeckMeta = {
  id: string;      // 例: "japan-capitals"
  title: string;   // 例: "日本の都道府県 → 県庁所在地"
  count: number;   // 例: 47
  file: string;    // 例: "japan-capitals.json"
};

type Card = {
  id: string;      // 例: "hokkaido"
  q: string;       // 例: "北海道の県庁所在地"
  a: string;       // 例: "札幌市"
  hint?: string;   // 任意
};

// ── localStorage キー ────────────────────────────────
const LS = {
  deckId: "geo/deckId",
  progress: "geo/progress", // （必要なら拡張用）
};

export default function App() {
  // メニュー表示用
  const [metas, setMetas] = useState<DeckMeta[] | null>(null); // null: 読み込み中
  const [metaError, setMetaError] = useState<string | null>(null);

  // 学習用
  const [deck, setDeck] = useState<DeckMeta | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);

  // ── 1) インデックスを取得 ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/decks/index.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as DeckMeta[];

        // id の重複など軽いバリデーション
        const valid = Array.isArray(data) ? data.filter(d => d?.id && d?.file) : [];
        setMetas(valid);

        // 以前選んだデッキがあれば復元
        const saved = localStorage.getItem(LS.deckId);
        if (saved) {
          const found = valid.find(d => d.id === saved);
          if (found) setDeck(found);
        }
      } catch (e: any) {
        setMetaError("デッキのインデックス (decks/index.json) を読み込めませんでした。");
        setMetas([]); // メニューは空でも表示
      }
    })();
  }, []);

  // ── 2) デッキ本体を取得 ────────────────────────────
  useEffect(() => {
    if (!deck) return;
    (async () => {
      try {
        const res = await fetch(`/decks/${deck.file}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as Card[];
        setCards(Array.isArray(data) ? data : []);
        setIdx(0);
        setReveal(false);
        localStorage.setItem(LS.deckId, deck.id);
      } catch (e) {
        setCards([]);
      }
    })();
  }, [deck]);

  // 進捗（簡易）
  const progress = useMemo(() => {
    if (!cards.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [idx, cards.length]);

  // ボタン動作
  const onReveal = () => setReveal(true);
  const onAgain = () => {
    setReveal(false);
    setIdx((idx + 1) % (cards.length || 1));
  };
  const onGood = () => {
    setReveal(false);
    setIdx((idx + 1) % (cards.length || 1));
  };
  const onReset = () => {
    localStorage.removeItem(LS.deckId);
    setDeck(null);
    setCards([]);
    setIdx(0);
    setReveal(false);
  };

  // ── UI ──────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/icon.png" alt="" width={28} height={28} />
        <h1 style={{ margin: 0, fontSize: 20 }}>地理攻略トレーナー（ミニ）</h1>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={onReset}>リセット</button>
        </div>
      </header>

      {/* 進捗バー */}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          進捗：{cards.length ? `${idx}/${cards.length}` : "0/0"}（{progress}%）
        </div>
        <div
          style={{
            height: 10,
            background: "#eee",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#3fb950",
              transition: "width .2s",
            }}
          />
        </div>
      </div>

      {/* 1) メニュー：インデックスがあればデッキ選択 */}
      {(!deck || cards.length === 0) && (
        <section style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>デッキを選ぶ</h2>
          {metaError && (
            <div style={{ color: "#c00", marginBottom: 8 }}>{metaError}</div>
          )}
          {metas === null && <div>読み込み中…</div>}
          {metas && metas.length === 0 && (
            <div>decks/index.json が空か見つかりません。まずは index.json とデッキを追加してください。</div>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {metas?.map((m) => (
              <button
                key={m.id}
                onClick={() => setDeck(m)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  カード: {m.count}　/　ファイル: {m.file}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2) 学習画面 */}
      {deck && cards.length > 0 && (
        <section
          style={{
            marginTop: 18,
            padding: "24px 18px",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            minHeight: 280,
          }}
        >
          <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            {deck.title}
          </div>
          <div style={{ fontSize: 28, margin: "24px 0 10px" }}>
            {cards[idx]?.q ?? "（カードがありません）"}
          </div>

          {!reveal ? (
            <button onClick={onReveal} style={{ marginBottom: 12 }}>
              答えを表示
            </button>
          ) : (
            <div
              style={{
                padding: "12px 14px",
                background: "#f6f8fa",
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 18 }}>{cards[idx]?.a}</div>
              {cards[idx]?.hint && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  ヒント: {cards[idx]?.hint}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onAgain}
              style={{
                background: "#e63946",
                color: "#fff",
                border: "none",
                padding: "10px 14px",
                borderRadius: 8,
              }}
            >
              まだ
            </button>
            <button
              onClick={onGood}
              style={{
                background: "#2a9d8f",
                color: "#fff",
                border: "none",
                padding: "10px 14px",
                borderRadius: 8,
              }}
            >
              覚えた！
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
            学習間隔（例）：1分 → 10分 → 1h → 6h → 24h → 72h（正解が続くほど間隔が延びます）
          </div>
        </section>
      )}
    </div>
  );
}
