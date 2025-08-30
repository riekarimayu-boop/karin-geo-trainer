import { useEffect, useMemo, useState } from "react";

// -------------- データ定義 -------------- //
type Card = {
  id: string;
  name: string;   // 問題名（ここでは動物名の例）
  emoji: string;  // 表示アイコン
  score: number;  // 連続正解数（間隔学習の簡易パラメータ）
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

// 間隔学習の簡易ルール（正解数に応じて次回間隔を延ばす）
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

// -------------- 本体コンポーネント -------------- //
export default function App() {
  const [cards, setCards] = useState<Card[]>([]);

  // 初回ロード：ローカルストレージ→無ければSEED
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
      nextDue: 0, // すぐ出題
    }));
    setCards(first);
  }, []);

  // 保存
  useEffect(() => {
    if (cards.length > 0) {
      localStorage.setItem(LS_KEY, JSON.stringify(cards));
    }
  }, [cards]);

  // 出題キュー
  const dueCards = useMemo(() => {
    const t = now();
    const ready = cards.filter((c) => c.nextDue <= t);
    if (ready.length > 0) {
      return ready.sort((a, b) => a.nextDue - b.nextDue);
    }
    // すべて将来なら次に近い順で
    return [...cards].sort((a, b) => a.nextDue - b.nextDue);
  }, [cards]);

  const current = dueCards[0];

  // 回答（正解=覚えた / 不正解=まだ）
  const answer = (good: boolean) => {
    if (!cu
