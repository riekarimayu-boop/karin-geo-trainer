import React, { useEffect, useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────
  地理攻略トレーナー（MVP）
  - ヒントON（「よく出る根拠」カード）
  - 推しモード（連続正解で“推し風セリフ”）
  - 10正解ごとに「どうぶつ癒しカード」獲得
  - スコア／連続正解／所持カードは localStorage に保存
────────────────────────────────────────────────────────── */

type MC = {
  id: string;
  type: "mc";
  theme: string; // 大問・分野
  year: string;  // 年度等ラベル
  text: string;
  choices: string[];
  answer: string;
  hint: string; // “よく出る根拠（地図・統計の読み筋）”
};

type Question = MC;

type Pack = {
  title: string;
  questions: Question[];
};

// さくっと動かす用の最小サンプル問題（ここに増やしていけばOK）
const megaPack: Pack = {
  title: "共通テスト 地理B（サンプルMVP）",
  questions: [
    {
      id: "q1",
      type: "mc",
      theme: "統計の読み取り",
      year: "R6 第2問",
      text: "世界の人口ピラミッドが「つりがね型」を示す国の特徴として最も妥当なのはどれ？",
      choices: ["出生率が高く平均寿命が短い", "出生率が低く高齢化が進む", "一次産業の人口割合が極端に高い", "砂漠気候で降水量が極端に少ない"],
      answer: "出生率が低く高齢化が進む",
      hint: "つりがね型＝日本など先進国型。高齢人口の比率が高く、出生率は低い。",
    },
    {
      id: "q2",
      type: "mc",
      theme: "地形図の読み取り",
      year: "R5 第1問",
      text: "等高線が密で谷線が細長く放射状に並ぶ地形で想定しやすいのは？",
      choices: ["溶岩台地", "カルデラ", "侵食の進んだ山地", "砂丘"],
      answer: "侵食の進んだ山地",
      hint: "等高線が“密”＝急傾斜。谷線が細長く集まる＝侵食が卓越する山地。",
    },
    {
      id: "q3",
      type: "mc",
      theme: "気候と農業",
      year: "R4 第3問",
      text: "地中海性気候で夏に多い農業として最も適切なのは？",
      choices: ["小麦の二期作", "コーヒー栽培", "オリーブ・ブドウ栽培", "稲作中心"],
      answer: "オリーブ・ブドウ栽培",
      hint: "夏乾燥・冬湿潤＝耐乾性の樹木作物が有利。オリーブ・ブドウが代表。",
    },
    {
      id: "q4",
      type: "mc",
      theme: "産業構造",
      year: "R4 第4問",
      text: "工業の空洞化が進行した先進国で“見られにくい”現象はどれ？",
      choices: ["海外への生産移転", "ハイテク産業の集積", "国内の雇用減少", "一次産業人口の急増"],
      answer: "一次産業人口の急増",
      hint: "空洞化は製造業の海外移転→国内雇用減。一次産業の“急増”は筋が悪い。",
    },
    {
      id: "q5",
      type: "mc",
      theme: "都市地理",
      year: "R3 第5問",
      text: "プライメイトシティが成立しやすい国で“起こりがち”な課題は？",
      choices: ["都市機能の分散", "地方の均衡発展", "一極集中による過密", "農村への人口回帰"],
      answer: "一極集中による過密",
      hint: "プライメイト＝首位都市の突出。過密・地価高騰・スラム化などが論点。",
    },
  ],
};

// 推しモードのセリフ集（軽めに50本弱）
const oshiLines = {
  normal: [
    "ナイス！", "さすが！", "いいね！", "バッチリ！", "流石です！",
    "その調子！", "完璧！", "イケてる！", "冴えてる！", "かりん、天才！",
  ],
  streak3: [
    "かりんちゃん、調子上がってきた！", "3連続は強い！", "エンジンかかったね！",
    "このまま行こう！", "連勝モード突入！",
  ],
  streak5: [
    "かりんちゃん！完璧だね！！", "5連続は神！", "止まらない〜！",
    "ゾーン入ってる！", "さすが受験生の本気！",
  ],
  streak10: [
    "10連続！伝説の幕開け…！", "桁違いの集中力！", "かりん史上最強！",
    "この走りは受かる！", "記録、塗り替えていこう！",
  ],
  sweet: [
    "かりんが頑張ってると、ボクも嬉しい。", "見てるよ、その努力。", "一歩ずつ、確実に強くなってる。",
    "今日のかりん、ほんとに最高。", "自分を信じて、大丈夫。"
  ],
  cheer: [
    "深呼吸して次もいこ！", "姿勢を正して、集中！", "脳に酸素！",
    "あと一問、丁寧に！", "積み重ねは裏切らない！"
  ],
  wrong: [
    "ドンマイ！次で取り返そう！", "惜しい！視点を変えよう。", "ヒントONで“読み筋”確認しよ！",
    "まだまだいける！", "切り替え早いのが勝ち！"
  ],
};

// どうぶつ癒しカード
const animalCards = [
  { id: "panda", label: "🐼 パンダ" },
  { id: "shiba", label: "🐕 しばいぬ" },
  { id: "neko", label: "🐈 ねこ" },
  { id: "usagi", label: "🐇 うさぎ" },
  { id: "penguin", label: "🐧 ペンギン" },
  { id: "kuma", label: "🐻 くま" },
  { id: "zou", label: "🐘 ぞう" },
  { id: "koala", label: "🐨 コアラ" },
  { id: "kirin", label: "🦒 きりん" },
  { id: "fukurou", label: "🦉 ふくろう" },
];

const LS_SCORE = "geo_mvp_score";
const LS_STREAK = "geo_mvp_streak";
const LS_TOTAL = "geo_mvp_total";
const LS_OWNED = "geo_mvp_owned";
const LS_OSHI = "geo_mvp_oshi";
const LS_HINT = "geo_mvp_hint";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function loadOwned(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_OWNED);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}
function saveOwned(set: Set<string>) {
  localStorage.setItem(LS_OWNED, JSON.stringify(Array.from(set)));
}

function grantRandomCard(owned: Set<string>) {
  const candidates = animalCards
    .map(c => c.id)
    .filter(id => !owned.has(id));
  const id = (candidates.length ? pick(candidates) : pick(animalCards.map(c => c.id)));
  const card = animalCards.find(c => c.id === id)!;
  const next = new Set(owned);
  next.add(id);
  return { nextOwned: next, card };
}

export default function App() {
  // UI 状態
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState<number>(() => Number(localStorage.getItem(LS_SCORE) || "0"));
  const [streak, setStreak] = useState<number>(() => Number(localStorage.getItem(LS_STREAK) || "0"));
  const [totalCorrect, setTotalCorrect] = useState<number>(() => Number(localStorage.getItem(LS_TOTAL) || "0"));
  const [message, setMessage] = useState<string>("今日も一歩ずつ、積み上げよう。");
  const [oshiOn, setOshiOn] = useState<boolean>(() => localStorage.getItem(LS_OSHI) === "1");
  const [hintOn, setHintOn] = useState<boolean>(() => localStorage.getItem(LS_HINT) !== "0");
  const [owned, setOwned] = useState<Set<string>>(loadOwned);
  const [showReward, setShowReward] = useState(false);
  const [rewardCard, setRewardCard] = useState<{ id: string; label: string } | null>(null);

  // 今の問題
  const q = useMemo(() => megaPack.questions[idx % megaPack.questions.length], [idx]);

  // 保存
  useEffect(() => localStorage.setItem(LS_SCORE, String(score)), [score]);
  useEffect(() => localStorage.setItem(LS_STREAK, String(streak)), [streak]);
  useEffect(() => localStorage.setItem(LS_TOTAL, String(totalCorrect)), [totalCorrect]);
  useEffect(() => localStorage.setItem(LS_OSHI, oshiOn ? "1" : "0"), [oshiOn]);
  useEffect(() => localStorage.setItem(LS_HINT, hintOn ? "1" : "0"), [hintOn]);
  useEffect(() => saveOwned(owned), [owned]);

  // 回答
  const handleAnswer = (choice: string) => {
    const correct = choice === q.answer;

    if (correct) {
      const nextScore = score + 1;
      setScore(nextScore);
      const newStreak = streak + 1;
      setStreak(newStreak);

      if (oshiOn) {
        let line = pick(oshiLines.normal);
        if (newStreak >= 10) line = pick([...oshiLines.streak10, ...oshiLines.sweet]);
        else if (newStreak >= 5) line = pick(oshiLines.streak5);
        else if (newStreak >= 3) line = pick(oshiLines.streak3);
        if (Math.random() < 0.25) line += "  " + pick(oshiLines.cheer);
        setMessage(line);
      } else {
        if (newStreak === 3) setMessage("かりんちゃん！すごい！");
        else if (newStreak === 4) setMessage("かりんちゃん！その調子！！");
        else if (newStreak === 5) setMessage("かりんちゃん！完璧だね！！！");
        else if (newStreak >= 6) setMessage(`かりんちゃん！${newStreak}連続正解！！神レベル✨`);
        else setMessage("正解！");
      }

      const nextTotal = totalCorrect + 1;
      setTotalCorrect(nextTotal);

      // ご褒美：10正解ごとに動物カード
      if (nextTotal % 10 === 0) {
        const { nextOwned, card } = grantRandomCard(owned);
        setOwned(nextOwned);
        setRewardCard(card);
        setShowReward(true);
      }
    } else {
      setStreak(0);
      setMessage(oshiOn ? pick(oshiLines.wrong) : "残念…次はできる！");
    }

    setTimeout(() => setIdx((i) => (i + 1) % megaPack.questions.length), 800);
  };

  // 所持カードの表示
  const ownedList = animalCards.map((c) => ({
    ...c,
    have: owned.has(c.id),
  }));

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div style={{ fontWeight: 700 }}>{megaPack.title}</div>
        <div style={styles.stats}>
          <span>得点：{score}</span>
          <span>連続：{streak}</span>
          <span>総正解：{totalCorrect}</span>
        </div>
      </header>

      <section style={styles.toggles}>
        <label style={styles.switch}>
          <input type="checkbox" checked={hintOn} onChange={(e) => setHintOn(e.target.checked)} />
          <span>ヒントON（“読み筋”カード）</span>
        </label>
        <label style={styles.switch}>
          <input type="checkbox" checked={oshiOn} onChange={(e) => setOshiOn(e.target.checked)} />
          <span>推しモードON（ご褒美セリフ）</span>
        </label>
      </section>

      <main style={styles.main}>
        <div style={styles.qmeta}>
          <span style={styles.theme}>{q.theme}</span>
          <span style={{ opacity: 0.7 }}>{q.year}</span>
        </div>

        <div style={styles.qbox}>
          <div style={styles.qtext}>{q.text}</div>
          <div style={styles.choices}>
            {q.choices.map((c) => (
              <button key={c} style={styles.choiceBtn} onClick={() => handleAnswer(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {hintOn && (
          <div style={styles.hintCard}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>ヒント：よく出る根拠（読み筋）</div>
            <div>{q.hint}</div>
          </div>
        )}

        <div style={styles.message}>{message}</div>
      </main>

      <section style={styles.cards}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>どうぶつ癒しカード</div>
        <div style={styles.cardGrid}>
          {ownedList.map((c) => (
            <div key={c.id} style={{ ...styles.cardItem, opacity: c.have ? 1 : 0.35 }}>
              <div style={{ fontSize: 24 }}>{c.label.split(" ")[0]}</div>
              <div style={{ fontSize: 12 }}>{c.label.split(" ")[1]}</div>
              {!c.have && <div style={styles.lock}>未所持</div>}
            </div>
          ))}
        </div>
      </section>

      {showReward && rewardCard && (
        <div style={styles.modalBg} onClick={() => setShowReward(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>ご褒美カード！</div>
            <div style={{ fontSize: 46, textAlign: "center" }}>{rewardCard.label.split(" ")[0]}</div>
            <div style={{ textAlign: "center", marginBottom: 8 }}>{rewardCard.label.split(" ")[1]}</div>
            <button style={styles.okBtn} onClick={() => setShowReward(false)}>
              うれしい！つぎへ
            </button>
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        <small>© かりんの共通テスト地理トレーナー（MVP）</small>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
  styles
────────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  wrap: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif",
    maxWidth: 880,
    margin: "0 auto",
    padding: 16,
    lineHeight: 1.6,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  stats: {
    display: "flex",
    gap: 12,
    fontSize: 14,
  },
  toggles: {
    display: "flex",
    gap: 16,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  switch: { display: "flex", gap: 6, alignItems: "center", fontSize: 14 },
  main: { marginTop: 10 },
  qmeta: { display: "flex", gap: 12, alignItems: "baseline", marginBottom: 6 },
  theme: {
    background: "#eef6ff",
    color: "#1062c9",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  qbox: { background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 16 },
  qtext: { fontSize: 18, fontWeight: 700, marginBottom: 10 },
  choices: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  choiceBtn: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    textAlign: "left",
    transition: "transform .02s ease",
  },
  hintCard: {
    marginTop: 12,
    background: "#fff8e6",
    border: "1px solid #f2e7c7",
    borderRadius: 12,
    padding: 12,
  },
  message: { marginTop: 12, fontWeight: 700, color: "#0f766e" },
  cards: { marginTop: 18 },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 10,
  },
  cardItem: {
    position: "relative",
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 12,
    textAlign: "center",
  },
  lock: {
    position: "absolute",
    bottom: 8,
    right: 8,
    fontSize: 11,
    background: "#eee",
    borderRadius: 8,
    padding: "1px 6px",
  },
  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.2)",
    display: "grid",
    placeItems: "center",
  },
  modal: {
    width: 280,
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    border: "1px solid #eee",
  },
  okBtn: {
    width: "100%",
    background: "#1062c9",
    color: "white",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    marginTop: 8,
  },
  footer: { marginTop: 24, textAlign: "center", opacity: 0.6 },
};
