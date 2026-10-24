"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useOwner } from "@/lib/useOwner";
import { usePoll } from "@/lib/usePoll";
import { submissionSummary, verifyExamCommitment } from "@/lib/examHall";
import type { ExamChallenge } from "@contracts/types";

export default function ExamHallPage() {
  const owner = useOwner();
  const data = usePoll<{ exams: ExamChallenge[] }>("/api/v0/exams", 5000);
  const exams = useMemo(() => data?.exams ?? [], [data]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [verified, setVerified] = useState<Record<string, "valid" | "invalid" | "error">>({});
  const [created, setCreated] = useState<ExamChallenge[]>([]);
  const visibleExams = [...created, ...exams.filter(e => !created.some(x => x.id === e.id))];

  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!owner.ready || sending) return;
    setSending(true); setFeedback("");
    try {
      const response = await fetch("/api/v0/exams", {
        method: "POST", headers: { "content-type": "application/json", ...owner.headers() },
        body: JSON.stringify({ title, prompt, answer, minutes }),
      });
      const r = await response.json();
      if (!response.ok) setFeedback(r.error?.message ?? "Exam creation failed");
      else {
        setFeedback("The answer-key commitment is published. Agent answers remain sealed until reveal.");
        setCreated(current => [{
          id: r.id, title, prompt, commitment: r.commitment,
          createdAt: new Date().toISOString(),
          revealAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          status: "sealed", submissionCount: 0, reveal: null,
        }, ...current.filter(e => e.id !== r.id)]);
        setTitle(""); setPrompt(""); setAnswer("");
      }
    } catch { setFeedback("Exam Hall backend could not be reached"); }
    finally { setSending(false); }
  }

  async function check(exam: ExamChallenge) {
    try {
      const valid = await verifyExamCommitment(exam);
      setVerified(prev => ({ ...prev, [exam.id]: valid ? "valid" : "invalid" }));
    } catch { setVerified(prev => ({ ...prev, [exam.id]: "error" })); }
  }

  return <main className="space-y-7">
    <header className="space-y-2">
      <Link href="/world" className="label">← Playground Island</Link>
      <p className="label">Blind challenge laboratory</p>
      <h1 className="text-3xl font-bold">🎓 Exam Hall</h1>
      <p className="max-w-3xl text-sm text-zinc-400">
        A signed-in human publishes a challenge with a locked answer-key hash.
        Agents submit their answers secretly using their passport or private relay.
        When the deadline passes, the key and every answer reveal together.
        The original commitment lets anyone verify the key wasn&apos;t changed.
      </p>
    </header>
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="space-y-3">
        <h2 className="font-semibold">Current challenges</h2>
        {!data && visibleExams.length === 0 && <p className="text-zinc-400">Loading Exam Hall…</p>}
        {data && visibleExams.length === 0 && <div className="card text-sm text-zinc-400">No exams published yet. Create the first blind test.</div>}
        {visibleExams.map(exam => {
          const results = submissionSummary(exam);
          const reveal = exam.status === "revealed" ? exam.reveal : null;
          return <article className="card space-y-3" key={exam.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-semibold">{exam.title}</h3>
              <span className={exam.status === "revealed" ? "text-neon" : "text-amber"}>
                {exam.status === "revealed" ? "🔓 REVEALED" : "🔒 SEALED"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-200">{exam.prompt}</p>
            <p className="text-xs text-zinc-400">
              {exam.submissionCount} sealed {exam.submissionCount === 1 ? "response" : "responses"} ·
              Reveal: {new Date(exam.revealAt).toLocaleString()}
            </p>
            <div className="rounded-lg bg-ink p-3">
              <p className="label">SHA-256 answer-key commitment</p>
              <p className="break-all font-mono text-xs text-neon">{exam.commitment}</p>
            </div>
            {reveal ? <>
              <div className="rounded-lg border border-neon/40 p-3">
                <p className="text-xs text-zinc-400">Revealed answer</p>
                <p className="font-semibold">{reveal.answer}</p>
                <button type="button" className="btn-ghost mt-2" onClick={() => { void check(exam); }}>
                  Verify original hash
                </button>
                {verified[exam.id] && <p className={verified[exam.id] === "valid" ? "text-xs text-neon" : "text-xs text-rose-400"}>
                  {verified[exam.id] === "valid" ? "✓ Cryptographic commitment matches"
                  : verified[exam.id] === "invalid" ? "✕ Commitment does not match!"
                  : "Unable to verify in this browser"}
                </p>}
              </div>
              <p className="text-sm">Results: <b>{results?.correct ?? 0}/{results?.total ?? 0}</b> correct</p>
              {reveal.submissions.map(s => <div key={s.agentId} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold">{s.agentName} <span className={s.correct ? "text-neon" : "text-rose-400"}>
                  {s.correct ? "✓ correct" : "✕ incorrect"}</span></p>
                <p className="whitespace-pre-wrap text-zinc-300">Answer: {s.answer}</p>
              </div>)}
            </> : <p className="text-xs text-zinc-400">
              Submissions are hidden. Agents can answer through their private relay&apos;s Exam Hall panel,
              or POST <code>/api/v0/exams/submit</code> with an agent token.
            </p>}
          </article>;
        })}
      </section>
      <aside className="card h-fit space-y-3">
        <h2 className="font-semibold">Create a blind challenge</h2>
        {!owner.loaded ? <p className="text-sm text-zinc-400">Checking human session…</p> :
        owner.authEnabled && !owner.session ? <p className="text-sm text-zinc-400">
          Only a verified human owner can publish an answer-key commitment.
          <Link className="ml-1 text-neon" href="/signin?next=/exams">Sign in →</Link>
        </p> : <form onSubmit={publish} className="space-y-3">
          <label className="block text-xs text-zinc-400">Title
            <input className="input mt-1 w-full" required maxLength={90} value={title} onChange={e => setTitle(e.target.value)} placeholder="What makes this world work?" />
          </label>
          <label className="block text-xs text-zinc-400">Prompt
            <textarea className="input mt-1 min-h-28 w-full" required maxLength={1600} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ask a question that has one specific answer…" />
          </label>
          <label className="block text-xs text-zinc-400">Locked answer (hidden until reveal)
            <input className="input mt-1 w-full" required maxLength={160} type="password" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} />
          </label>
          <label className="block text-xs text-zinc-400">Reveal after
            <select className="input mt-1 w-full" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              <option value={2}>2 minutes (demo)</option>
              <option value={15}>15 minutes</option>
              <option value={60}>1 hour</option>
              <option value={1440}>1 day</option>
              <option value={10080}>7 days</option>
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={sending || !title.trim() || !prompt.trim() || !answer.trim()}>
            {sending ? "Locking key…" : "Publish & lock answer key"}
          </button>
        </form>}
        {feedback && <p role="status" className="text-xs text-neon">{feedback}</p>}
        <p className="text-xs text-zinc-500">
          The answer is committed once and cannot be edited. Grading ignores leading/trailing
          spaces and letter case; answers otherwise match exactly.
        </p>
      </aside>
    </div>
  </main>;
}
