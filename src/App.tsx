import { useEffect, useMemo, useState } from "react";

/***** かりんちゃん専用の褒め言葉／励まし *****/
const PRAISE = [
  "かりんちゃん、完璧！","ナイス集中力！","いいね、その調子！",
  "秒速で正解、天才！","キレッキレ！","地理王への道まっしぐら！",
  "見事！","判断が速い！","かりんちゃん、覚え方がうまい！",
  "積み上げが効いてる！","連続正解が気持ちいい！","今日は冴えてる！",
  "正確で美しい！","学習効率MAX！","スゴい記憶力！",
  "ばっちり！","安定感ハンパない！","プロフェッショナル！",
  "医学部合格モード突入！","高得点の未来が見える！",
];
const ENCOURAGE = [
  "惜しい！今ので覚えたよ","大丈夫、かりんちゃんは確実に強くなってる",
  "ヒント見てからでOK！","丁寧に行こう、次は取れる",
  "ここで覚えれば勝ち！","あと少し、いける！","焦らずもう一回！",
  "一歩ずつ確実に！","ここで踏ん張るのが地力！",
];

const ENABLE_SFX = true;        // 効果音ON/OFF
const ENABLE_CONFETTI = false;  // ← ここを false に

/***** 効果音（WebAudio） *****/
let _ac: AudioContext | null = null;
function ac(){ if(!_ac) _ac = new (window.AudioContext||(window as any).webkitAudioContext)(); return _ac!; }
function tone(freq:number, ms=140, type:OscillatorType="sine", gain=0.06){
  const ctx = ac(), osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
  osc.connect(g).connect(ctx.destination); const t = ctx.currentTime; osc.start(t); osc.stop(t+ms/1000);
}
function sfxOK(){ if(!ENABLE_SFX) return; tone(880,90,"triangle",.05); setTimeout(()=>tone(1175,120,"triangle",.05),90);
  setTimeout(()=>{ tone(1568,140,"sine",.035); tone(1976,140,"sine",.03); },140); if(navigator.vibrate) navigator.vibrate(15); }
function sfxNG(){ if(!ENABLE_SFX) return; const ctx = ac(), osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type="sawtooth"; osc.frequency.value=220; g.gain.value=.05; osc.connect(g).connect(ctx.destination);
  const t=ctx.currentTime; const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=7; lg.gain.value=20;
  lfo.connect(lg).connect(osc.frequency); osc.start(t); lfo.start(t); osc.stop(t+.22); lfo.stop(t+.22);
  if(navigator.vibrate) navigator.vibrate(60); }

/***** 🎉絵文字コンフェッティ *****/
const EMOJIS = ["🎉","🎊","✨","👏","🌟","🎈","🗺️","📍","📚","💫","⭐️","🧠","💡"];
let confettiRoot: HTMLDivElement | null = null;
(function(){
  const id="emoji-confetti-style"; if(document.getElementById(id)) return;
  const style=document.createElement("style"); style.id=id;
  style.textContent=`@keyframes fall-emoji{0%{transform:translateY(-10vh) rotate(0);opacity:0}
  10%{opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:.9}}`;
  document.head.appendChild(style);
})();
function getConfettiRoot(){ if(!confettiRoot){ confettiRoot=document.createElement("div"); Object.assign(confettiRoot.style,{
  position:"fixed", inset:"0", zIndex:"9999", pointerEvents:"none", overflow:"hidden"}); document.body.appendChild(confettiRoot);} return confettiRoot!; }
function burstEmojiConfetti(){
  if(!ENABLE_CONFETTI) return; const root=getConfettiRoot(); const W=window.innerWidth; const N=Math.min(36, Math.max(16, Math.floor(W/25)));
  for(let i=0;i<N;i++){ const span=document.createElement("span"); span.textContent=EMOJIS[(Math.random()*EMOJIS.length)|0];
    const left=Math.random()*100, dur=1.6+Math.random()*1.7, delay=Math.random()*0.15, size=18+Math.random()*16;
    Object.assign(span.style,{position:"absolute",left:`${left}vw`,top:"-10vh",fontSize:`${size}px`,
      animation:`fall-emoji ${dur}s linear ${delay}s 1 both`, filter:"drop-shadow(0 2px 2px rgba(0,0,0,.15))"} as CSSStyleDeclaration);
    root.appendChild(span); setTimeout(()=>root.removeChild(span),(dur+delay)*1000+50); }
}

/***** 型 *****/
type Card = {
  id?: string; front: string; back: string; hint?: string;
  choices?: string[];   // 明示的に4択を指定する場合
  answer?: number;      // 上のchoicesに対する正解インデックス(0-3)
};
type Deck = { id?: string; title: string; description?: string; cards: Card[] };
type DeckMeta = { id:string; title:string; description?:string; file?:string; path?:string; count?:number };

/***** Leitner 間隔 *****/
const BOX_INTERVAL_MS = [0, 1*60e3, 10*60e3, 60*60e3, 6*60*60e3, 24*60*60e3, 72*60*60e3] as const;

type CardState = { box:number; next:number; streak:number };
type SaveBlob = { deckId:string; version:number; perCard:Record<string,CardState> };
const SAVE_VERSION = 1;
const now = () => Date.now();
const keyFor = (deckId:string)=>`geo-trainer:deck:${deckId}`;
function readSave(deckId:string):SaveBlob|null{ try{const raw=localStorage.getItem(keyFor(deckId)); if(!raw) return null;
  const j=JSON.parse(raw) as SaveBlob; if(j.version!==SAVE_VERSION||j.deckId!==deckId) return null; return j;}catch{return null;} }
function writeSave(deckId:string, blob:SaveBlob){ try{localStorage.setItem(keyFor(deckId), JSON.stringify(blob));}catch{} }

const INDEX_URL = "/decks/index.json";
const deckUrl = (m:DeckMeta)=> m.path ?? (m.file ? `/decks/${m.file}` : `/decks/${m.id}.json`);

/***** デッキJSONのゆらぎ吸収（配列だけ もOK） *****/
async function fetchDeckNormalized(meta:DeckMeta):Promise<Deck>{
  const res = await fetch(deckUrl(meta), { cache:"no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if(raw && Array.isArray(raw.cards)){
    const d = raw as Partial<Deck>;
    return { id:d.id ?? meta.id, title:d.title ?? meta.title, description:d.description ?? meta.description, cards:d.cards as Card[] };
  }
  if(Array.isArray(raw)){
    return { id:meta.id, title:meta.title, description:meta.description, cards:raw as Card[] };
  }
  return { id:meta.id, title:meta.title, description:meta.description, cards:[] };
}

/***** ユーティリティ *****/
function shuffle<T>(arr:T[]):T[]{ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

/** 4択データを生成（明示choicesがあればそれ優先。なければ同一デッキのbackから自動生成） */
function buildMCQ(card:Card, deck:Deck){
  // 明示指定がある
  if(card.choices && card.choices.length>=2){
    // 正解が分からなければ back を探す
    const baseChoices = [...card.choices];
    if(!baseChoices.includes(card.back)) baseChoices[0] = card.back; // backを必ず含める
    while(baseChoices.length<4){
      // 足りない分は他カードから補完
      const cand = shuffle(deck.cards.map(c=>c.back).filter(b=>b && !baseChoices.includes(b) && b!==card.back))[0];
      if(!cand) break;
      baseChoices.push(cand);
    }
    const trimmed = baseChoices.slice(0,4);
    const shuffled = shuffle(trimmed);
    const correct = shuffled.indexOf(card.back);
    return { choices: shuffled, correct };
  }
  // 自動生成：back の集合から
  const uniqBacks = Array.from(new Set(deck.cards.map(c=>c.back))).filter(b=>b && b!==card.back);
  if(uniqBacks.length<3) return null; // フォールバック
  const distractors = shuffle(uniqBacks).slice(0,3);
  const opts = shuffle([card.back, ...distractors]);
  const correct = opts.indexOf(card.back);
  return { choices: opts, correct };
}

/***** メイン *****/
export default function App(){
  const [menus, setMenus] = useState<DeckMeta[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deck, setDeck] = useState<Deck|null>(null);
  const [save, setSave] = useState<SaveBlob|null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [flash, setFlash] = useState<{text:string; ok:boolean}|null>(null);

  useEffect(()=>{ (async()=>{
    try{ setMenuLoading(true); const r=await fetch(INDEX_URL,{cache:"no-store"}); const data=await r.json() as DeckMeta[]; setMenus(data); }
    catch(e){ console.error("index.json 読み込み失敗:",e); setMenus([]); }
    finally{ setMenuLoading(false); }
  })(); },[]);

  // 実枚数のカウント（index.jsonのcountに頼らない）
  useEffect(()=>{ if(!menus.length) return; (async()=>{
    const entries = await Promise.all(menus.map(async m=>{
      try{ const res=await fetch(deckUrl(m),{cache:"no-store"}); if(!res.ok) throw new Error();
        const raw=await res.json(); const n = Array.isArray(raw?.cards)? raw.cards.length : Array.isArray(raw)? raw.length : 0;
        return [m.id,n] as const;
      }catch{ return [m.id,0] as const; }
    }));
    setCounts(Object.fromEntries(entries));
  })(); },[menus]);

  async function openDeck(m:DeckMeta){
    try{
      const d=await fetchDeckNormalized(m);
      d.cards = (d.cards??[]).map((c,i)=>({ ...c, id: c.id ?? `${d.id ?? m.id}#${i}` }));
      setDeck(d);
      const deckId = d.id ?? m.id;
      const loaded = readSave(deckId);
      if(loaded) setSave(loaded);
      else{ const init:SaveBlob={deckId,version:SAVE_VERSION,perCard:{}}; writeSave(deckId,init); setSave(init); }
      setCurrentIdx(0);
    }catch(e){ alert(`デッキを読み込めませんでした: ${e}`); }
  }

  const updateSave = (mutate:(draft:SaveBlob)=>void)=>{
    if(!deck) return; const deckId=deck.id ?? "unknown";
    setSave(prev=>{
      const base:SaveBlob = prev ?? { deckId, version:SAVE_VERSION, perCard:{} };
      const draft:SaveBlob = JSON.parse(JSON.stringify(base));
      mutate(draft); writeSave(deckId,draft); return draft;
    });
  };

  const stateOf = (c:Card):CardState => save?.perCard[c.id!] ?? { box:0, next:0, streak:0 };

  const nextIndex = useMemo(()=>{ if(!deck) return 0; const t=now();
    const due = deck.cards.map((c,i)=>({i,st:stateOf(c)})).filter(x=>x.st.next<=t).sort((a,b)=>a.st.next-b.st.next)[0]?.i;
    if(due!=null) return due;
    const idx = deck.cards.map((c,i)=>({i,st:stateOf(c)})).sort((a,b)=> a.st.box!==b.st.box? a.st.box-b.st.box : a.st.next-b.st.next )[0]?.i;
    return idx ?? 0;
  },[deck,save]);

  const progress = useMemo(()=>{ if(!deck) return {learned:0,total:0,percent:0};
    const total=deck.cards.length, learned=deck.cards.filter(c=>stateOf(c).box>=3).length;
    return { learned, total, percent: total? Math.round(learned/total*100) : 0 };
  },[deck,save]);

  const card = useMemo(()=> (deck ? deck.cards[currentIdx ?? nextIndex] ?? null : null), [deck,currentIdx,nextIndex]);

  /** 正誤反映（Leitner + 効果音/🎉/メッセージ） */
  function gradeAndAdvance(ok:boolean){
    if(!deck || !card) return;
    const id = card.id!, t=now(); let streakLocal=0;
    updateSave(draft=>{
      const cur = draft.perCard[id] ?? { box:0, next:0, streak:0 };
      if(ok){ const nb=Math.min(cur.box+1, BOX_INTERVAL_MS.length-1); streakLocal=cur.streak+1;
        draft.perCard[id] = { box:nb, next:t+BOX_INTERVAL_MS[nb], streak:streakLocal };
      }else{ streakLocal=0; draft.perCard[id]={ box:0, next:t+BOX_INTERVAL_MS[1], streak:0 }; }
    });

    if(ok){ sfxOK(); burstEmojiConfetti(); setFlash({ text:`${PRAISE[(Math.random()*PRAISE.length)|0]}（連続${streakLocal}）`, ok:true }); }
    else { sfxNG(); setFlash({ text: ENCOURAGE[(Math.random()*ENCOURAGE.length)|0], ok:false }); }
    setTimeout(()=>setFlash(null),1200);

    setCurrentIdx(nextIndex);
  }

  function resetDeck(){
    if(!deck) return; if(!confirm("このデッキの学習履歴をリセットします。よろしいですか？")) return;
    const deckId=deck.id ?? "unknown"; const blank:SaveBlob={deckId,version:SAVE_VERSION,perCard:{}}; writeSave(deckId,blank);
    setSave(blank); setCurrentIdx(0);
  }

  /** ---- UI: デッキ選択 ---- */
  if(!deck){
    return (
      <div style={{maxWidth:900, margin:"32px auto", padding:"0 16px"}}>
        <h1 style={{fontSize:28, fontWeight:800, marginBottom:16}}>地理攻略トレーナー（ミニ）</h1>
        {menuLoading && <p>読み込み中...</p>}
        {!menuLoading && menus.length===0 && (
          <div style={{padding:"12px 16px", border:"1px solid #eee", borderRadius:8, background:"#fff"}}>
            <strong>decks/index.json</strong> が空か見つかりません。まずは <strong>index.json</strong> とデッキを追加してください。
          </div>
        )}
        <ul style={{display:"grid", gap:12, marginTop:12, listStyle:"none", paddingLeft:0}}>
          {menus.map(m=>{
            const count = counts[m.id] ?? m.count ?? "…";
            const fileLabel = m.file ?? m.path ?? `${m.id}.json`;
            return (
              <li key={m.id}>
                <button onClick={()=>openDeck(m)} style={{
                  width:"100%", textAlign:"left", border:"1px solid #e5e7eb", borderRadius:8,
                  padding:"14px 16px", background:"white", cursor:"pointer"
                }}>
                  <div style={{fontSize:18, fontWeight:700}}>{m.title}</div>
                  {m.description && <div style={{color:"#6b7280", marginTop:4}}>{m.description}</div>}
                  <div style={{color:"#6b7280", marginTop:4, fontSize:14}}>カード: {count}　/　ファイル: {fileLabel}</div>
                </button>
              </li>
            );
          })}
        </ul>
        <p style={{marginTop:24, color:"#6b7280", fontSize:13}}>
          ※ メニューは <code>/public/decks/index.json</code>、各デッキは <code>/public/decks/*.json</code> に置きます。
          「<code>{`{ cards:[...] }`}</code>」形式でも「<code>[...]</code>（配列だけ）」でもOKです。
        </p>
      </div>
    );
  }

  /** ---- UI: 学習画面 ---- */
  const mcq = useMemo(()=> (deck && card ? buildMCQ(card, deck) : null), [deck, card]);
  const [selected, setSelected] = useState<number|null>(null);
  useEffect(()=>{ setSelected(null); }, [currentIdx, deck?.id]);

  return (
    <div style={{maxWidth:980, margin:"24px auto", padding:"0 16px"}}>
      <div style={{display:"flex", alignItems:"center", gap:12}}>
        <button onClick={()=>setDeck(null)} style={{padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:6, background:"white", cursor:"pointer"}}>← デッキ選択に戻る</button>
        <h2 style={{fontSize:22, fontWeight:800, margin:0}}>{deck.title}</h2>
        <div style={{flex:1}} />
        <button onClick={resetDeck} style={{padding:"6px 12px", border:"1px solid #e5e7eb", borderRadius:6, background:"white", cursor:"pointer"}}>リセット</button>
      </div>

      <div style={{marginTop:12, marginBottom:8, color:"#6b7280"}}>
        進捗：{deck.cards.filter(c=>(save?.perCard[c.id!]?.box ?? 0) >= 3).length}/{deck.cards.length}
      </div>
      <div style={{width:"100%", height:8, background:"#f3f4f6", borderRadius:999, overflow:"hidden"}}>
        <div style={{
          width: `${deck.cards.length ? Math.round((deck.cards.filter(c=>(save?.perCard[c.id!]?.box ?? 0) >= 3).length / deck.cards.length)*100) : 0}%`,
          height:"100%", background:"#10b981"
        }}/>
      </div>

      {/* 正解/不正解メッセージ */}
      {flash && (
        <div aria-live="polite" style={{
          marginTop:16, marginBottom:8, padding:"10px 12px", borderRadius:8,
          color: flash.ok ? "#065f46" : "#7f1d1d",
          background: flash.ok ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${flash.ok ? "#10b981" : "#ef4444"}`, fontWeight:700,
        }}>
          {flash.text}
        </div>
      )}

      {/* カード本体 */}
      {card ? (
        <div style={{marginTop:16, border:"1px solid #e5e7eb", borderRadius:12, padding:16, background:"white"}}>
          <div style={{color:"#6b7280", fontSize:14}}>{deck.title} → {card.front}</div>
          <h1 style={{fontSize:34, margin:"10px 0 4px 0"}}>{card.front}</h1>

          {/* --- 4択モード --- */}
          {mcq ? (
            <>
              {card.hint && <div style={{margin:"6px 0 10px", color:"#6b7280"}}>ヒント: {card.hint}</div>}
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:8}}>
                {mcq.choices.map((opt, i)=>{
                  const isSelected = selected===i;
                  const isCorrect = selected!=null && i===mcq.correct;
                  const isWrongSelected = selected!=null && i===selected && i!==mcq.correct;
                  const bg = isCorrect ? "#10b981" : isWrongSelected ? "#ef4444" : "#f9fafb";
                  const color = isCorrect || isWrongSelected ? "white" : "#111827";
                  return (
                    <button key={i} disabled={selected!=null}
                      onClick={()=>{ if(selected!=null) return; setSelected(i); setTimeout(()=>gradeAndAdvance(i===mcq.correct), 400); }}
                      style={{padding:"12px", borderRadius:10, border:"1px solid #e5e7eb", background:bg, color, fontSize:18, cursor:"pointer"}}
                    >
                      {["①","②","③","④"][i]}　{opt}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            // --- フォールバック（自己採点） ---
            <>
              <div style={{marginTop:12, padding:16, borderRadius:8, background:"#f9fafb", fontSize:24}}>
                {card.back}
                {card.hint && <div style={{marginTop:6, color:"#6b7280", fontSize:14}}>ヒント: {card.hint}</div>}
              </div>
              <div style={{display:"flex", gap:12, marginTop:16}}>
                <button onClick={()=>gradeAndAdvance(false)} style={{flex:1, padding:"12px 16px", borderRadius:10, border:"none", background:"#ef4444", color:"white", fontSize:18, cursor:"pointer"}}>まだ</button>
                <button onClick={()=>gradeAndAdvance(true)}  style={{flex:1, padding:"12px 16px", borderRadius:10, border:"none", background:"#10b981", color:"white", fontSize:18, cursor:"pointer"}}>覚えた！</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{marginTop:24}}>カードがありません。</div>
      )}

      <div style={{marginTop:24, color:"#6b7280", fontSize:13}}>
        学習間隔：1分 → 10分 → 1h → 6h → 24h → 72h（正解が続くほど間隔が延びます）
      </div>
    </div>
  );
}
