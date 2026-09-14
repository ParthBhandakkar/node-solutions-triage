import { useEffect, useMemo, useState } from "react";
import type { Category, Owner, Priority, TriagedRequest, TriageInput } from "@triage/shared";
import { CATEGORIES, OWNERS, PRIORITIES } from "@triage/shared";
import { api } from "./lib/api.js";
import { MOCK_REQUESTS } from "./data/mockRequests.js";
import { channelLabel, countByPriority, formatDate, priorityClass, priorityIcon, relativeTime } from "./lib/format.js";

const sampleByLabel = Object.fromEntries(MOCK_REQUESTS.map((item) => [item.label, item]));
type View = "inbox" | "board";
type Stage = "idle" | "Analyzing request…" | "Applying policy…" | "Drafting reply…" | "Running batch triage…";

function PriorityPill({ value }: { value: Priority }) { return <span className={`priority-pill ${priorityClass[value]}`}><b>{priorityIcon[value]}</b>{value}</span>; }
function OwnerChip({ value }: { value: Owner }) { return <span className="owner-chip"><span className="owner-dot" />{value}</span>; }
function Bar({ value }: { value: number }) { return <span className="confidence"><span style={{ width: `${Math.round(value * 100)}%` }} /><small>{Math.round(value * 100)}%</small></span>; }
function PlaceholderText({ text }: { text: string }) { return <>{text.split(/(\[[^\]]+\])/g).map((part, index) => part.startsWith("[") ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>)}</>; }

export function App() {
  const [items, setItems] = useState<TriagedRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [view, setView] = useState<View>("inbox");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<TriageInput["channel"]>("email");
  const [senderName, setSenderName] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<{ name: string; model: string; isLlm: boolean } | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const filtered = useMemo(() => filter === "All" ? items : items.filter((item) => item.final.priority === filter || item.final.owner === filter || item.final.category === filter), [filter, items]);

  useEffect(() => {
    void Promise.all([api.list(), api.config()]).then(([list, config]) => {
      setItems(list.items);
      setSelectedId(list.items[0]?.id);
      setProvider(config.provider);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load the triage desk."));
  }, []);

  useEffect(() => {
    if (selected) { setDraftSubject(selected.draft.subject); setDraftBody(selected.draft.body); }
  }, [selected?.id]);

  const replaceItem = (item: TriagedRequest) => { setItems((current) => current.map((entry) => entry.id === item.id ? item : entry)); setSelectedId(item.id); };

  async function submit() {
    if (text.trim().length < 5) { setError("Write at least five characters so the assistant has something to triage."); return; }
    setError(""); setStage("Analyzing request…");
    try {
      const result = await api.triage({ text, channel, sender_name: senderName || null });
      setStage("idle"); setItems((current) => [result, ...current]); setSelectedId(result.id); setText("");
    } catch (cause: unknown) { setStage("idle"); setError(cause instanceof Error ? cause.message : "Triage failed."); }
  }

  async function runBatch() {
    setError(""); setStage("Running batch triage…");
    try {
      const result = await api.batch({ items: MOCK_REQUESTS });
      setItems(result.results); setSelectedId(result.results.find((item) => item.raw_text === sampleByLabel["05"]?.text)?.id ?? result.results[0]?.id); setView("inbox");
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Batch triage failed."); }
    finally { setStage("idle"); }
  }

  async function update(patch: Parameters<typeof api.patch>[1]) {
    if (!selected) return;
    try { replaceItem(await api.patch(selected.id, patch)); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Could not save the change."); }
  }

  async function redraft(tone: "standard" | "formal" | "warmer" | "shorter") {
    if (!selected) return;
    setStage("Drafting reply…");
    try { replaceItem(await api.redraft(selected.id, tone)); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Could not redraft the reply."); }
    finally { setStage("idle"); }
  }

  const healthLabel = provider ? `${provider.name} · ${provider.model}` : "Connecting…";
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">N</div><div><strong>Node Solutions</strong><span>AI request triage desk</span></div></div>
      <div className="header-actions">
        <span className={`provider-badge ${provider?.isLlm ? "live" : "fallback"}`}><i />{healthLabel}</span>
        <button className={`view-button ${view === "inbox" ? "active" : ""}`} onClick={() => setView("inbox")}>Inbox</button>
        <button className={`view-button ${view === "board" ? "active" : ""}`} onClick={() => setView("board")}>Route board</button>
        <button className="button ghost" onClick={() => void runBatch()}>Run six mocks</button>
      </div>
    </header>

    <main className="workspace">
      <section className="submit-card card">
        <div className="section-kicker">NEW REQUEST <span>01</span></div>
        <h1>Turn a message into a next step.</h1>
        <p className="muted">Paste an email, chat, or form submission. The assistant classifies, routes, explains, and drafts a reply for human review.</p>
        <div className="field-row"><label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value as TriageInput["channel"])}><option value="email">Email</option><option value="web_form">Web form</option><option value="chat">Chat</option></select></label><label>Sender <em>optional</em><input value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="e.g. Alex Morgan" /></label></div>
        <label className="request-label">Incoming request<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the customer's request here…" maxLength={8000} /></label>
        <div className="textarea-footer"><span>{text.length.toLocaleString()} / 8,000</span><button className="button primary" disabled={stage !== "idle"} onClick={() => void submit()}>{stage !== "idle" ? <><span className="spinner" />{stage}</> : <>Triage request <span>→</span></>}</button></div>
        <div className="quick-fill"><span>Try a mock</span>{MOCK_REQUESTS.map((mock) => <button key={mock.label} onClick={() => { setText(mock.text); setChannel(mock.channel); }}>{mock.label}</button>)}</div>
      </section>

      {view === "inbox" ? <>
        <section className="inbox-card card">
          <div className="inbox-header"><div><div className="section-kicker">QUEUE <span>{items.length.toString().padStart(2, "0")}</span></div><h2>Requests</h2></div><div className="priority-counts"><span><b className="count-dot urgent" />{countByPriority(items, "Urgent")}</span><span><b className="count-dot high" />{countByPriority(items, "High")}</span><span><b className="count-dot medium" />{countByPriority(items, "Medium")}</span><span><b className="count-dot low" />{countByPriority(items, "Low")}</span></div></div>
          <div className="filters"><button className={filter === "All" ? "selected" : ""} onClick={() => setFilter("All")}>All</button>{PRIORITIES.map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>)}<button className={filter === "Engineering" ? "selected" : ""} onClick={() => setFilter("Engineering")}>Engineering</button></div>
          <div className="request-list">{filtered.length ? filtered.map((item) => <button className={`request-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><div className="row-top"><PriorityPill value={item.final.priority} /><span className="channel-label">{channelLabel(item.channel)}</span><span className="row-time">{relativeTime(item.sla.acknowledge_by)}</span></div><strong>{item.final.category} · {item.analysis.summary}</strong><div className="row-bottom"><OwnerChip value={item.final.owner} />{item.needs_human_review && <span className="review-flag">⚠ review</span>}<span className="row-rule-count">{item.applied_rules.length ? `${item.applied_rules.length} policy ${item.applied_rules.length === 1 ? "rule" : "rules"}` : "AI classified"}</span></div></button>) : <div className="empty-state"><span>✦</span><strong>Your queue is clear</strong><p>Use a mock above or paste a new request to start.</p><button className="button soft" onClick={() => setText(MOCK_REQUESTS[1]?.text ?? MOCK_REQUESTS[0]!.text)}>Try request 02 →</button></div>}</div>
        </section>
        <DetailPane selected={selected} draftSubject={draftSubject} draftBody={draftBody} setDraftSubject={setDraftSubject} setDraftBody={setDraftBody} update={update} redraft={redraft} />
      </> : <RouteBoard items={items} onSelect={(id) => { setSelectedId(id); setView("inbox"); }} />}
    </main>
    {error && <div className="toast error-toast"><b>Could not complete that action</b><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    {stage !== "idle" && <div className="stage-bar"><span className="spinner" />{stage}<small>Local inference can take a few seconds</small></div>}
    <footer><span>Model proposes · policy decides · human approves</span><span>Prototype · fictional data only</span></footer>
  </div>;
}

type DetailProps = { selected: TriagedRequest | undefined; draftSubject: string; draftBody: string; setDraftSubject: (value: string) => void; setDraftBody: (value: string) => void; update: (patch: Parameters<typeof api.patch>[1]) => Promise<void>; redraft: (tone: "standard" | "formal" | "warmer" | "shorter") => Promise<void> };
function DetailPane({ selected, draftSubject, draftBody, setDraftSubject, setDraftBody, update, redraft }: DetailProps) {
  const [showInternals, setShowInternals] = useState(false);
  if (!selected) return <section className="detail-card card detail-empty"><span className="detail-icon">↗</span><h2>Select a request</h2><p>Decision details, rationale, SLA, and a reviewable first response will appear here.</p></section>;
  const security = selected.final.tags.includes("security_incident") || selected.final.tags.includes("pii");
  const saveDraft = () => void update({ draft: { subject: draftSubject, body: draftBody, internal_note: selected.draft.internal_note, next_steps: selected.draft.next_steps } });
  return <section className="detail-card card">
    {security && <div className="risk-banner"><span className="risk-icon">!</span><div><strong>Potential data-exposure incident</strong><p>Auto-escalated to Urgent and routed to Engineering by <code>DATA_EXPOSURE_01</code>. Contain first; do not send customer data in replies.</p></div></div>}
    <div className="detail-heading"><div><div className="section-kicker">TRIAGE RESULT <span>{selected.id}</span></div><div className="decision-line"><PriorityPill value={selected.final.priority} /><select aria-label="Change category" value={selected.final.category} onChange={(event) => void update({ category: event.target.value as Category })}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Change owner" value={selected.final.owner} onChange={(event) => void update({ owner: event.target.value as Owner })}>{OWNERS.map((value) => <option key={value}>{value}</option>)}</select></div></div><div className="sla"><span>Acknowledge by</span><strong>{relativeTime(selected.sla.acknowledge_by)}</strong><small>{formatDate(selected.sla.acknowledge_by)}</small></div></div>
    <div className="summary-block"><span className="label">SUMMARY</span><p>{selected.analysis.summary}</p></div>
    <div className="why-grid"><div><span className="label">WHY THIS PRIORITY</span><p>{selected.final.priority_reason}</p><div className="signals">{selected.analysis.risk_signals.map((signal) => <span key={signal}>{signal.replaceAll("_", " ")}</span>)}</div></div><div><span className="label">CONFIDENCE</span><div className="confidence-line"><small>Category</small><Bar value={selected.analysis.confidence.category} /></div><div className="confidence-line"><small>Priority</small><Bar value={selected.analysis.confidence.priority} /></div><div className="confidence-line"><small>Owner</small><Bar value={selected.analysis.confidence.owner} /></div></div></div>
    {selected.applied_rules.length > 0 && <div className="rules-block"><span className="label">POLICY OVERRIDES</span>{selected.applied_rules.map((rule) => <div className="rule" key={rule.id}><code>{rule.id}</code><span><strong>{rule.effect}</strong><small>{rule.because}</small></span></div>)}</div>}
    <div className="draft-block"><div className="draft-head"><div><span className="label">DRAFT FIRST RESPONSE</span><p>Review and edit before sending. Bracketed text needs a human decision.</p></div><div className="draft-actions"><select aria-label="Regenerate draft" defaultValue="" onChange={(event) => { if (event.target.value) void redraft(event.target.value as "standard" | "formal" | "warmer" | "shorter"); }}><option value="" disabled>Regenerate…</option><option value="standard">Standard tone</option><option value="formal">More formal</option><option value="warmer">Warmer</option><option value="shorter">Shorter</option></select><button className="button soft" onClick={() => { void navigator.clipboard?.writeText(draftBody); }}>Copy body</button></div></div><input className="draft-subject" value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} /><textarea className="draft-body" value={draftBody} onChange={(event) => setDraftBody(event.target.value)} /><div className="draft-footer"><span>{selected.status === "approved" ? "✓ Approved for sending" : "Human review required"}</span><div><button className="button soft" onClick={saveDraft}>Save edits</button><button className="button approve" onClick={() => void update({ draft: { subject: draftSubject, body: draftBody }, status: "approved" })}>Approve & mark sent</button></div></div></div>
    <div className="internal-grid"><div><span className="label">INTERNAL NOTE</span><p>{selected.draft.internal_note}</p></div><div><span className="label">NEXT STEPS</span><ul>{selected.draft.next_steps.map((step) => <li key={step}><span>□</span>{step}</li>)}</ul></div></div>
    <button className="under-toggle" onClick={() => setShowInternals(!showInternals)}>{showInternals ? "Hide" : "Show"} under the hood <span>{showInternals ? "↑" : "↓"}</span></button>{showInternals && <div className="under-hood"><div><span>Provider</span><strong>{selected.meta.provider} / {selected.meta.model}</strong></div><div><span>Latency</span><strong>{selected.meta.total_ms}ms total · {selected.meta.analyze_ms}ms analyze · {selected.meta.compose_ms}ms draft</strong></div><div><span>Prompt</span><strong>{selected.meta.prompt_version}</strong></div><div><span>Generated JSON</span><pre>{JSON.stringify(selected.analysis, null, 2)}</pre></div></div>}
  </section>;
}

function RouteBoard({ items, onSelect }: { items: TriagedRequest[]; onSelect: (id: string) => void }) {
  return <section className="board card"><div className="board-header"><div><div className="section-kicker">OWNERSHIP VIEW <span>04 TEAMS</span></div><h2>Route board</h2><p className="muted">Every request has one accountable owner. Secondary notifications remain visible on the detail view.</p></div><div className="board-total"><strong>{items.length}</strong><span>requests routed</span></div></div><div className="board-columns">{OWNERS.map((owner) => { const owned = items.filter((item) => item.final.owner === owner); return <div className="board-column" key={owner}><div className="column-heading"><OwnerChip value={owner} /><span>{owned.length}</span></div>{owned.length ? owned.map((item) => <button className="board-ticket" key={item.id} onClick={() => onSelect(item.id)}><div><PriorityPill value={item.final.priority} /><span>{relativeTime(item.sla.acknowledge_by)}</span></div><strong>{item.final.category}</strong><p>{item.analysis.summary}</p><small>{item.applied_rules.length ? `↳ ${item.applied_rules[0]?.id}` : "AI classified"}</small></button>) : <div className="column-empty">No requests routed here yet</div>}</div>; })}</div></section>;
}
