import { useState, useEffect, useRef } from "react";
import "./App.css";

// ─── PROMPTS ────────────────────────────────────────────────────────────────

const DIAGNOSIS_SYSTEM = `You are an expert orthopedic and sports medicine AI assistant helping users identify and manage musculoskeletal ailments.

Ask targeted follow-up questions (1-2 at a time) to understand the user's condition. When you have enough information, output a structured response in this EXACT JSON format wrapped in <CASE_DATA> tags:

<CASE_DATA>
{
  "diagnosis": "Name of condition (e.g. Lumbar Disc Herniation, Rotator Cuff Tendinopathy)",
  "summary": "2-3 sentence plain-English explanation of the condition and why these exercises help",
  "severity": "mild|moderate|severe",
  "exercises": [
    {
      "name": "Exercise name",
      "duration": "30 seconds / 10 reps",
      "instructions": "Step-by-step instructions",
      "benefit": "Why this specific exercise helps this condition"
    }
  ],
  "frequency": "Daily / 3x per week",
  "disclaimer": "This is informational only and not a substitute for professional medical diagnosis or treatment."
}
</CASE_DATA>

Include 4-6 exercises. Until you have enough info, ask conversational questions. When you do output the JSON, also write a brief friendly message before the <CASE_DATA> tag summarizing your assessment.`;

const ADAPTATION_SYSTEM = `You are an expert orthopedic and sports medicine AI. Based on a patient's pain tracking data, analyze their progress and recommend adjustments to their exercise routine.

Given the condition, current exercises, and pain rating history, provide:
1. A brief progress assessment
2. Specific modifications (increase intensity, add exercises, remove, modify, or continue as-is)

Output ONLY in this JSON format:
{
  "assessment": "2-3 sentence progress summary",
  "trend": "improving|stable|worsening",
  "recommendation": "overall recommendation text",
  "modifications": [
    {
      "exerciseName": "exact name from current routine",
      "action": "keep|modify|remove|intensity_up|intensity_down",
      "change": "what to change (or null if keeping)"
    }
  ],
  "newExercises": [
    {
      "name": "New exercise name",
      "duration": "duration",
      "instructions": "instructions",
      "benefit": "why adding this now"
    }
  ]
}`;

// ─── HELPERS ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().split("T")[0];
const formatDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const CASE_COLORS = ["#38bd95","#6366f1","#f59e0b","#ec4899","#06b6d4","#84cc16","#f97316","#a78bfa"];

async function callClaude(messages, system) {
  const res = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.map(c => c.text || "").join("") || "";
}

function parseCaseData(text) {
  const match = text.match(/<CASE_DATA>([\s\S]*?)<\/CASE_DATA>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function stripCaseData(text) {
  return text.replace(/<CASE_DATA>[\s\S]*?<\/CASE_DATA>/g, "").trim();
}

// ─── STORAGE (localStorage) ─────────────────────────────────────────────────

async function loadCases() {
  try {
    const r = localStorage.getItem("ortho-cases");
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

async function saveCases(cases) {
  try { localStorage.setItem("ortho-cases", JSON.stringify(cases)); } catch {}
}

async function loadCheckins() {
  try {
    const r = localStorage.getItem("ortho-checkins");
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

async function saveCheckins(checkins) {
  try { localStorage.setItem("ortho-checkins", JSON.stringify(checkins)); } catch {}
}


// ─── SPARKLINE CHART ────────────────────────────────────────────────────────

function SparklineChart({ data, color }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || data.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const pad = 10;
    const min = 0, max = 10;
    const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
    const ys = data.map(v => H - pad - ((v - min) / (max - min)) * (H - pad * 2));
    // gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + "40");
    grad.addColorStop(1, color + "05");
    ctx.beginPath();
    ctx.moveTo(xs[0], H - pad);
    xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
    ctx.lineTo(xs[xs.length - 1], H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // line
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    // dots
    xs.forEach((x, i) => {
      ctx.beginPath();
      ctx.arc(x, ys[i], 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }, [data, color]);
  if (data.length < 2) return <p style={{fontSize:'12px',color:'var(--muted)',fontStyle:'italic'}}>Not enough data yet. Complete more sessions to see your pain trend.</p>;
  return <canvas ref={canvasRef} width={500} height={90} style={{width:'100%',height:'90px',background:'rgba(255,255,255,0.02)',borderRadius:'8px'}} />;
}

// ─── PAIN MODAL ─────────────────────────────────────────────────────────────

function PainModal({ caseData, onSubmit, onDismiss }) {
  const [rating, setRating] = useState(null);
  const [notes, setNotes] = useState("");
  const getPainColor = (n) => {
    if (n <= 3) return "#4ade80";
    if (n <= 6) return "#fbbf24";
    return "#f87171";
  };
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>How do you feel? 🩺</h2>
        <p>Rate your pain/discomfort level right now, after completing today's routine for <strong style={{color:'var(--text)'}}>{caseData.diagnosis}</strong>.</p>
        <div className="pain-scale">
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} className={`pain-btn${rating===n?' selected':''}`}
              style={rating===n?{background:getPainColor(n)}:{}}
              onClick={() => setRating(n)}>{n}</button>
          ))}
        </div>
        <div className="pain-labels"><span>No pain</span><span>Moderate</span><span>Worst</span></div>
        <textarea className="pain-notes" placeholder="Optional notes (what felt different, any soreness, improvements...)" value={notes} onChange={e=>setNotes(e.target.value)} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onDismiss}>Skip</button>
          <button className="btn btn-primary" disabled={rating===null} onClick={()=>onSubmit(rating,notes)}>Save Rating</button>
        </div>
      </div>
    </div>
  );
}

// ─── CHAT VIEW ──────────────────────────────────────────────────────────────

function ChatView({ onCaseSaved }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCase, setPendingCase] = useState(null);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const startChat = async () => {
    setLoading(true);
    const initMsg = [{ role: "user", content: "Hello, I need help with an orthopedic or muscular issue." }];
    const reply = await callClaude(initMsg, DIAGNOSIS_SYSTEM).catch(() => "Sorry, couldn't connect.");
    setMessages([...initMsg, { role: "assistant", content: reply }]);
    setLoading(false);
  };

  useEffect(() => { startChat(); }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    taRef.current && (taRef.current.style.height = "48px");
    const newMsgs = [...messages, { role: "user", content: userMsg }];
    setMessages(newMsgs);
    setLoading(true);
    const reply = await callClaude(newMsgs, DIAGNOSIS_SYSTEM).catch(() => "Sorry, something went wrong.");
    const caseData = parseCaseData(reply);
    if (caseData) setPendingCase(caseData);
    setMessages([...newMsgs, { role: "assistant", content: reply }]);
    setLoading(false);
  };

  const saveCase = async () => {
    if (!pendingCase) return;
    const newCase = {
      id: uid(),
      ...pendingCase,
      color: CASE_COLORS[Math.floor(Math.random() * CASE_COLORS.length)],
      createdAt: todayStr(),
    };
    const existing = await loadCases();
    await saveCases([...existing, newCase]);
    setPendingCase(null);
    onCaseSaved(newCase);
  };

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.map((m, i) => {
          const isAI = m.role === "assistant";
          const caseData = isAI ? parseCaseData(m.content) : null;
          const displayText = isAI ? stripCaseData(m.content) : m.content;
          return (
            <div key={i} className={`msg ${m.role}`}>
              <div className={`msg-avatar ${isAI ? "ai" : "user"}`}>{isAI ? "🩺" : "👤"}</div>
              <div className={`msg-bubble ${isAI ? "ai" : "user"}`}>
                <p style={{whiteSpace:"pre-wrap"}}>{displayText}</p>
                {caseData && (
                  <div className="msg-case-preview">
                    <h4>📋 Diagnosis Ready: {caseData.diagnosis}</h4>
                    <p>{caseData.exercises?.length} exercises · {caseData.frequency}</p>
                    {i === messages.length - 1 && pendingCase && (
                      <button className="btn btn-primary" style={{marginTop:"12px"}} onClick={saveCase}>
                        💾 Save This Case & Routine
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="msg ai">
            <div className="msg-avatar ai">🩺</div>
            <div className="msg-bubble ai"><div className="typing"><span/><span/><span/></div></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea ref={taRef} className="chat-textarea" placeholder="Describe your symptoms..." value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
            disabled={loading} rows={1} />
          <button className="send-btn" onClick={send} disabled={loading || !input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",textAlign:"center"}}>⚠️ Informational only — not a substitute for professional medical advice</p>
      </div>
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

function Dashboard({ cases, checkins, onSelectCase }) {
  if (cases.length === 0) return (
    <div className="empty">
      <div className="empty-icon">🦴</div>
      <h3>No cases yet</h3>
      <p>Chat with the AI to get a diagnosis and save your first case & routine.</p>
    </div>
  );

  return (
    <div className="dashboard-grid">
      {cases.map(c => {
        const today = todayStr();
        const todayCheckin = checkins.find(ch => ch.caseId === c.id && ch.date === today);
        const completedToday = todayCheckin?.completedExercises?.filter(Boolean).length || 0;
        const total = c.exercises?.length || 0;
        const caseCheckins = checkins.filter(ch => ch.caseId === c.id && ch.painRating != null).slice(-7);
        const lastRating = caseCheckins[caseCheckins.length - 1]?.painRating;
        const firstRating = caseCheckins[0]?.painRating;
        const trend = caseCheckins.length < 2 ? "unknown"
          : lastRating < firstRating - 0.5 ? "improving"
          : lastRating > firstRating + 0.5 ? "worsening" : "stable";
        const pct = total ? (completedToday / total) * 100 : 0;

        return (
          <div key={c.id} className="case-card" onClick={() => onSelectCase(c)}>
            <div className="case-card-header">
              <div className="case-color-bar" style={{background: c.color}} />
              <div style={{flex:1}}>
                <div className="case-card-title">{c.diagnosis}</div>
                <div className="case-card-sub">Started {formatDate(c.createdAt)} · {c.frequency}</div>
              </div>
              <span className={`tag ${c.severity}`}>{c.severity}</span>
            </div>
            <div className="case-card-body">
              <div className="today-progress">
                <span style={{fontSize:"12px",color:"var(--muted)"}}>Today</span>
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{width:`${pct}%`, background: c.color}} />
                </div>
                <span className="progress-label">{completedToday}/{total}</span>
              </div>
              <div className="pain-trend">
                <span>Pain trend</span>
                {lastRating && <span style={{fontWeight:"600",color:lastRating<=3?"var(--green)":lastRating<=6?"var(--amber)":"var(--red)"}}>{lastRating}/10</span>}
                <span className={`trend-pill ${trend}`}>{trend === "unknown" ? "No data" : trend}</span>
              </div>
            </div>
            <div className="case-card-footer">
              <span style={{fontSize:"12px",color:"var(--muted)"}}>{total} exercises</span>
              {pct === 100 && <span style={{marginLeft:"auto",fontSize:"12px",color:"var(--teal)"}}>✓ Done today</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CASE DETAIL ─────────────────────────────────────────────────────────────

function CaseDetail({ caseData, checkins, onCheckinsUpdate, onDelete }) {
  const today = todayStr();
  const todayCheckin = checkins.find(ch => ch.caseId === caseData.id && ch.date === today);
  const [expanded, setExpanded] = useState({});
  const [showPainModal, setShowPainModal] = useState(false);

  const completedSet = new Set(
    todayCheckin?.completedExercises?.map((v, i) => v ? i : -1).filter(i => i >= 0) || []
  );
  const allDone = caseData.exercises?.length > 0 && completedSet.size === caseData.exercises.length;
  const hadPainToday = !!todayCheckin?.painRating;

  const toggleExercise = async (idx) => {
    const newSet = new Set(completedSet);
    newSet.has(idx) ? newSet.delete(idx) : newSet.add(idx);
    const arr = caseData.exercises.map((_, i) => newSet.has(i));
    const allCheckins = await loadCheckins();
    const existing = allCheckins.findIndex(ch => ch.caseId === caseData.id && ch.date === today);
    const updated = { id: existing >= 0 ? allCheckins[existing].id : uid(), caseId: caseData.id, date: today, completedExercises: arr, painRating: todayCheckin?.painRating || null, notes: todayCheckin?.notes || "" };
    const newCheckins = existing >= 0 ? allCheckins.map((ch, i) => i === existing ? updated : ch) : [...allCheckins, updated];
    await saveCheckins(newCheckins);
    onCheckinsUpdate(newCheckins);
    // prompt for pain if just completed all
    if (arr.every(Boolean) && !hadPainToday) setTimeout(() => setShowPainModal(true), 400);
  };

  const submitPain = async (rating, notes) => {
    setShowPainModal(false);
    const allCheckins = await loadCheckins();
    const existing = allCheckins.findIndex(ch => ch.caseId === caseData.id && ch.date === today);
    if (existing >= 0) {
      const newCheckins = allCheckins.map((ch, i) => i === existing ? { ...ch, painRating: rating, notes } : ch);
      await saveCheckins(newCheckins);
      onCheckinsUpdate(newCheckins);
    }
  };

  return (
    <div className="case-detail">
      {showPainModal && <PainModal caseData={caseData} onSubmit={submitPain} onDismiss={() => setShowPainModal(false)} />}

      <div className="detail-header">
        <div className="detail-color-accent" style={{background: caseData.color}} />
        <div>
          <div className="detail-title">{caseData.diagnosis}</div>
          <div className="detail-meta">
            <span className={`tag ${caseData.severity}`}>{caseData.severity}</span>
            <span style={{margin:"0 8px",color:"var(--border2)"}}>·</span>
            <span style={{fontSize:"13px",color:"var(--muted)"}}>Since {formatDate(caseData.createdAt)}</span>
          </div>
        </div>
        <button className="btn btn-danger btn-sm" style={{marginLeft:"auto"}} onClick={onDelete}>Remove</button>
      </div>

      <div className="detail-summary">{caseData.summary}</div>

      <div className="frequency-badge">
        <span>🗓️</span> {caseData.frequency}
      </div>

      {allDone && !hadPainToday && (
        <div className="session-complete-bar">
          <div className="complete-icon">🎉</div>
          <div className="complete-text">
            <h3>Session Complete!</h3>
            <p>All exercises done. How's your pain level?</p>
          </div>
          <button className="btn btn-primary btn-sm" style={{marginLeft:"auto"}} onClick={() => setShowPainModal(true)}>Rate Pain</button>
        </div>
      )}
      {hadPainToday && (
        <div className="session-complete-bar">
          <div className="complete-icon">✅</div>
          <div className="complete-text">
            <h3>Pain logged — {todayCheckin.painRating}/10</h3>
            <p>Great job tracking your progress today.</p>
          </div>
          <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={() => setShowPainModal(true)}>Update</button>
        </div>
      )}

      <div className="section-heading">Today's Routine</div>
      <div className="exercises-list">
        {caseData.exercises?.map((ex, i) => {
          const done = completedSet.has(i);
          const open = expanded[i];
          return (
            <div key={i} className={`exercise-row${done ? " done" : ""}`}>
              <div className="exercise-row-header" onClick={() => toggleExercise(i)}>
                <div className={`ex-checkbox${done ? " checked" : ""}`}>
                  {done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="#000" strokeWidth="2" strokeLinecap="round"/></svg>}
                </div>
                <span className="ex-name" style={done?{textDecoration:"line-through",opacity:.55}:{}}>{ex.name}</span>
                <span className="ex-duration">{ex.duration}</span>
                <span className="ex-expand" onClick={e=>{e.stopPropagation();setExpanded(p=>({...p,[i]:!p[i]}))}}>
                  {open?"▲":"▼"}
                </span>
              </div>
              {open && (
                <div className="exercise-detail">
                  <p>{ex.instructions}</p>
                  <p className="benefit">💡 {ex.benefit}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px"}}>⚠️ Stop any exercise that causes sharp or worsening pain. Consult a healthcare professional before beginning any new exercise program.</p>
    </div>
  );
}

// ─── PROGRESS VIEW ───────────────────────────────────────────────────────────

function ProgressView({ cases, checkins }) {
  const [adaptations, setAdaptations] = useState({});
  const [loadingAdapt, setLoadingAdapt] = useState({});

  const getAdaptation = async (c) => {
    setLoadingAdapt(p => ({ ...p, [c.id]: true }));
    const caseCheckins = checkins.filter(ch => ch.caseId === c.id && ch.painRating != null).slice(-14);
    if (caseCheckins.length < 3) {
      setAdaptations(p => ({ ...p, [c.id]: { assessment: "Not enough data yet. Complete at least 3 rated sessions to receive AI recommendations.", trend: "stable", recommendation: "", modifications: [], newExercises: [] } }));
      setLoadingAdapt(p => ({ ...p, [c.id]: false }));
      return;
    }
    const prompt = `Condition: ${c.diagnosis}\nSeverity: ${c.severity}\n\nCurrent exercises:\n${c.exercises.map((e,i)=>`${i+1}. ${e.name} (${e.duration})`).join("\n")}\n\nPain ratings (oldest to newest, scale 1-10):\n${caseCheckins.map(ch=>`${ch.date}: ${ch.painRating}/10${ch.notes?" — "+ch.notes:""}`).join("\n")}\n\nAnalyze progress and recommend routine modifications.`;
    const reply = await callClaude([{ role: "user", content: prompt }], ADAPTATION_SYSTEM).catch(() => null);
    if (reply) {
      try {
        const clean = reply.replace(/```json|```/g,"").trim();
        const parsed = JSON.parse(clean);
        setAdaptations(p => ({ ...p, [c.id]: parsed }));
      } catch { setAdaptations(p => ({ ...p, [c.id]: { assessment: reply, trend:"stable", modifications:[], newExercises:[] } })); }
    }
    setLoadingAdapt(p => ({ ...p, [c.id]: false }));
  };

  const getPainColor = (n) => n <= 3 ? "#4ade80" : n <= 6 ? "#fbbf24" : "#f87171";
  const actionLabel = a => ({ keep:"Keep", modify:"Modify", remove:"Remove", intensity_up:"↑ Intensity", intensity_down:"↓ Intensity" }[a] || a);

  if (cases.length === 0) return (
    <div className="progress-view">
      <div className="empty"><div className="empty-icon">📈</div><h3>No progress data</h3><p>Save a case and complete sessions to track your progress here.</p></div>
    </div>
  );

  return (
    <div className="progress-view">
      <div className="progress-header">
        <h2>Progress Tracker</h2>
        <p>Monitor your pain trends and get AI-powered routine adaptations</p>
      </div>
      <div className="progress-cards">
        {cases.map(c => {
          const caseCheckins = checkins.filter(ch => ch.caseId === c.id).sort((a,b)=>a.date.localeCompare(b.date));
          const ratedCheckins = caseCheckins.filter(ch => ch.painRating != null);
          const sparkData = ratedCheckins.map(ch => ch.painRating);
          const adapt = adaptations[c.id];

          return (
            <div key={c.id} className="progress-card">
              <div className="progress-card-header">
                <div className="case-dot" style={{background:c.color,width:"10px",height:"10px",borderRadius:"50%"}} />
                <div className="progress-card-title">{c.diagnosis}</div>
                <span className={`tag ${c.severity}`}>{c.severity}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => getAdaptation(c)} disabled={loadingAdapt[c.id]}>
                  {loadingAdapt[c.id] ? "Analyzing..." : "🤖 Get AI Recommendation"}
                </button>
              </div>
              <div className="progress-card-body">
                <div className="sparkline-wrap">
                  <div className="sparkline-label">Pain Level Over Time (1=none, 10=worst)</div>
                  <SparklineChart data={sparkData} color={c.color} />
                </div>

                {ratedCheckins.length > 0 && (
                  <>
                    <div className="section-heading" style={{marginTop:"16px"}}>Recent Sessions</div>
                    <div className="checkins-list">
                      {ratedCheckins.slice(-7).reverse().map(ch => (
                        <div key={ch.id} className="checkin-row">
                          <span className="checkin-date">{formatDate(ch.date)}</span>
                          <span className="checkin-exercises">{ch.completedExercises?.filter(Boolean).length || 0}/{c.exercises?.length || 0} exercises</span>
                          {ch.notes && <span style={{flex:1,fontSize:"12px",color:"var(--muted)",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ch.notes}</span>}
                          <div className="pain-dot" style={{background:getPainColor(ch.painRating)+"22",color:getPainColor(ch.painRating)}}>
                            {ch.painRating}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {adapt && (
                  <div className="adaptation-block">
                    <h4>🤖 AI Assessment · <span className={`trend-pill ${adapt.trend}`} style={{padding:"1px 7px",borderRadius:"10px",fontSize:"10px",fontWeight:"600"}}>{adapt.trend}</span></h4>
                    <p>{adapt.assessment}</p>
                    {adapt.recommendation && <p style={{marginTop:"8px",color:"var(--muted2)"}}>{adapt.recommendation}</p>}
                    {(adapt.modifications?.length > 0 || adapt.newExercises?.length > 0) && (
                      <div className="adaptation-changes">
                        {adapt.modifications?.map((m,i) => (
                          <div key={i} className="adaptation-change-item">
                            <span className={`change-badge ${m.action}`}>{actionLabel(m.action)}</span>
                            <span><strong style={{color:"var(--text)"}}>{m.exerciseName}</strong>{m.change ? ` — ${m.change}` : ""}</span>
                          </div>
                        ))}
                        {adapt.newExercises?.map((ex,i) => (
                          <div key={"new"+i} className="adaptation-change-item">
                            <span className="change-badge new">Add</span>
                            <span><strong style={{color:"var(--text)"}}>{ex.name}</strong> ({ex.duration}) — {ex.benefit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("chat"); // chat | dashboard | case | progress
  const [cases, setCases] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, ch] = await Promise.all([loadCases(), loadCheckins()]);
      setCases(c); setCheckins(ch); setLoaded(true);
    })();
  }, []);

  const handleCaseSaved = (newCase) => {
    setCases(p => [...p, newCase]);
    setActiveCase(newCase);
    setView("case");
  };

  const handleSelectCase = (c) => { setActiveCase(c); setView("case"); };
  const handleCheckinsUpdate = (updated) => setCheckins(updated);

  const handleDeleteCase = async () => {
    if (!activeCase) return;
    const updated = cases.filter(c => c.id !== activeCase.id);
    await saveCases(updated);
    setCases(updated);
    setActiveCase(null);
    setView("dashboard");
  };

  const todayCheckins = checkins.filter(ch => ch.date === todayStr());
  const pendingToday = cases.filter(c => !todayCheckins.find(ch => ch.caseId === c.id && ch.completedExercises?.every(Boolean)));

  if (!loaded) return null;

  return (
    <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <h1>🦴 OrthoAssist</h1>
            <p>Musculoskeletal Advisor</p>
          </div>
          <nav className="sidebar-nav">
            <div className={`nav-item${view==="chat"?" active":""}`} onClick={() => setView("chat")}>
              <span className="icon">💬</span> New Diagnosis
            </div>
            <div className={`nav-item${view==="dashboard"?" active":""}`} onClick={() => setView("dashboard")}>
              <span className="icon">📋</span> My Cases
              {cases.length > 0 && <span className="nav-badge">{cases.length}</span>}
            </div>
            <div className={`nav-item${view==="progress"?" active":""}`} onClick={() => setView("progress")}>
              <span className="icon">📈</span> Progress
            </div>
          </nav>

          {cases.length > 0 && (
            <div className="sidebar-cases">
              <div className="sidebar-cases-label">Active Cases</div>
              {cases.map(c => (
                <div key={c.id} className={`case-chip${activeCase?.id === c.id && view === "case" ? " active" : ""}`} onClick={() => handleSelectCase(c)}>
                  <div className="case-dot" style={{background: c.color}} />
                  <span className="case-chip-name">{c.diagnosis}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div className="topbar-title-group">
              <h2>
                {view === "chat" && "New Diagnosis"}
                {view === "dashboard" && "My Cases"}
                {view === "case" && (activeCase?.diagnosis || "Case Detail")}
                {view === "progress" && "Progress Tracker"}
              </h2>
              {view === "dashboard" && pendingToday.length > 0 && (
                <span className="topbar-sub">· {pendingToday.length} routine{pendingToday.length !== 1 ? "s" : ""} pending today</span>
              )}
              {view === "case" && activeCase && (
                <span className="topbar-sub">· {activeCase.frequency}</span>
              )}
            </div>
          </div>

          <div className="content">
            {view === "chat" && <ChatView onCaseSaved={handleCaseSaved} />}
            {view === "dashboard" && (
              <div className="scroll-view">
                <Dashboard cases={cases} checkins={checkins} onSelectCase={handleSelectCase} />
              </div>
            )}
            {view === "case" && activeCase && (
              <div className="scroll-view">
                <CaseDetail
                  key={activeCase.id}
                  caseData={activeCase}
                  checkins={checkins}
                  onCheckinsUpdate={handleCheckinsUpdate}
                  onDelete={handleDeleteCase}
                />
              </div>
            )}
            {view === "case" && !activeCase && (
              <div className="scroll-view">
                <div className="empty"><div className="empty-icon">📂</div><h3>Select a case</h3><p>Choose a case from the sidebar.</p></div>
              </div>
            )}
            {view === "progress" && (
              <div className="scroll-view">
                <ProgressView cases={cases} checkins={checkins} />
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
