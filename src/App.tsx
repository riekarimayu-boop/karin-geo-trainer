import { useEffect, useMemo, useState } from "react";

// -------------- データ定義 -------------- //
type Card = {
  id: string;
  name: string;   // 問題名
  emoji: string;  // 表示アイコン
  score: number;  // 連続正解数
  nextDue: number; // 次に出題するUNIX時刻(ms)
};

const SEED: Array<Omit<Card, "score" | "nextDue">> = [
  { id: "a1", name: "パンダ", emoji: "🐼" },
  { id: "a2", name: "ライオン", emoji: "🦁" },
  { id: "a3", name: "ゾウ", emoji: "🐘" },
  { id: "a4", name: "コアラ", emoji: "🐨" },
  { id: "a5", name: "ペンギン", emoji: "🐧" },
  { id: "a6", name: "イルカ", emoji: "🐬" },
];

const LS_KEY = "karin-geo-trainer.cards.v1";

// -------------- ユーティリティ -------------- //
const now = () => Date.now();
const minutes = (m: number) => m * 60 * 1000;
const hours = (h: number) => h * 60 * 60 * 1000;

function intervalByScore(score: number) {
  switch (true) {
    case score <= 0:
      return minutes(1);
    case score === 1:
      return minutes(10);
    case score === 2:
      return hours(1);
    case score === 3:
      return hours(6);
    case score === 4:
      return hours(24);
    default:
      return hours(72);
  }
}

// -------------- 本体 -------------- //
export default function App() {
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const parsed: Card[] = JSON.parse(raw);
        setCards(parsed);
        return;
      } catch {}
    }
    const first: Card[] = SEED.map((c) => ({
      ...c,
      score: 0,
      nextDue: 0,
    }));
    setCards(first);
  }, []);

  useEffect(() => {
    if (cards.length > 0) {
      localStorage.setItem(LS_KEY, JSON.stringify(cards));
    }
  }, [cards]);

  const dueCards = useMemo(() => {
    const t = now();
    const ready = cards.filter((c) => c.nextDue <= t);
    if (ready.length > 0) {
      return ready.sort((a, b) => a.nextDue - b.nextDue);
    }
    return [...cards].sort((a, b) => a.nextDue - b.nextDue);
  }, [cards]);

  const current = dueCards[0];

  const answer = (good: boolean) => {
    if (!current) return;
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== current.id) return c;
        const nextScore = good ? c.score + 1 : 0;
        return {
          ...c,
          score: nextScore,
          nextDue: now() + intervalByScore(nextScore),
        };
      })
    );
  };

  const learned = cards.filter((c) => c.score >= 3).length;
  const total = cards.length;

  const resetAll = () => {
    if (!confirm("学習状態をリセットしますか？")) return;
    setCards((prev) => prev.map((c) => ({ ...c, score: 0, nextDue: 0 })));
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>地理攻略トレーナー（ミニ）</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          ローカル保存 / ライブラリ不要 / Vite+React
        </div>
      </header>

      <section style={styles.progress}>
        <span>進捗：</span>
        <Progress value={learned} max={total} />
        <span style={{ marginLeft: 8 }}>
          {learned} / {total}
        </span>
        <button style={styles.resetBtn} onClick={resetAll}>
          リセット
        </button>
      </section>

      <main style={styles.main}>
        {!current ? (
          <Empty />
        ) : (
          <CardView
            key={current.id}
            card={current}
            onGood={() => answer(true)}
            onBad={() => answer(false)}
          />
        )}
      </main>

      <footer style={styles.footer}>
        <small>
          学習間隔：1分→10分→1h→6h→24h→72h（正解が続くほど間隔が延びます）
        </small>
      </footer>
    </div>
  );
}

function CardView({
  card,
  onGood,
  onBad,
}: {
  card: Card;
  onGood: () => void;
  onBad: () => void;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.emoji}>{card.emoji}</div>
      <div style={styles.name}>{card.name}</div>

      <div style={styles.actions}>
        <button style={styles.bad} onClick={onBad}>
          まだ
        </button>
        <button style={styles.good} onClick={onGood}>
          覚えた！
        </button>
      </div>

      <div style={styles.meta}>
        <small>連続正解: {card.score}</small>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
      すべて学習済みです。少し時間を置くと出題が復活します ⏳
    </div>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div style={styles.bar}>
      <div style={{ ...styles.barFill, width: `${pct}%` }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: "24px 16px", color: "#111" },
  header: { marginBottom: 16 },
  progress: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  resetBtn: {
    marginLeft: "auto",
    background: "#eee",
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
  },
  main: { minHeight: 260 },
  card: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
  },
  emoji: { fontSize: 64, lineHeight: 1 },
  name: { fontSize: 28, marginTop: 8, fontWeight: 700 },
  actions: { display: "flex", justifyContent: "center", gap: 12, marginTop: 16 },
  good: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 16,
    cursor: "pointer",
  },
  bad: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 16,
    cursor: "pointer",
  },
  meta: { marginTop: 8, color: "#666" },
  bar: { width: 180, height: 10, background: "#f2f2f2", borderRadius: 6, overflow: "hidden" },
  barFill: {
    height: "100%",
    background:
      "linear-gradient(90deg, rgba(34,197,94,1) 0%, rgba(59,130,246,1) 100%)",
  },
  footer: { marginTop: 24, color: "#666" },
};
