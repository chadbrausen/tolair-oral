"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";

// Use relative URLs to go through Next.js API proxy routes
const API = "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "CRITICAL" | "ELEVATED" | "WARN" | "INFO";

interface Provider {
  npi: string;
  displayName: string;
  practiceName?: string;
  specialty: string;
  city: string;
  state: string;
  practiceType?: string;
  dsoAffiliation?: string | null;
  hrsaHpsaDesignated?: boolean;
}

interface Signal {
  domain: string;
  signalCode?: string;
  code?: string;
  severity: Severity;
  narrative?: string;
  narrativeText?: string;
  dollarImpactMin?: number;
  dollarImpactMax?: number;
  dollarImpactLow?: number;
  dollarImpactHigh?: number;
  impactUnit?: string;
}

interface BenchmarkMetric {
  metricName?: string;
  metricLabel?: string;
  metric?: string;
  p25: number | null;
  median: number | null;
  p75: number | null;
  unit: string;
  dataSource?: string;
}

interface Briefing {
  executiveSummary?: string;
  topSignals: Signal[];
  benchmarkSnapshot: BenchmarkMetric[];
}

interface OgsScore {
  score: number;
  percentile?: number;
}

interface PreviewResponse {
  provider: Provider;
  ogsScore: number | OgsScore | null;
  topDomain: string | null;
  topSeverity: Severity | null;
  gated: boolean;
}

interface FullBriefingResponse {
  provider: Provider;
  ogs: OgsScore;
  briefing: Briefing;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CompassResponse {
  response: string;
  requestHash: string;
  citations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEnum(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function scoreColor(score: number): string {
  if (score < 50) return "#EF4444";
  if (score < 75) return "#F59E0B";
  if (score < 90) return "#00B4A0";
  return "#22C55E";
}

const SEVERITY_STYLES: Record<
  Severity,
  { bg: string; text: string; border: string }
> = {
  CRITICAL: {
    bg: "bg-critical/20",
    text: "text-critical",
    border: "border-critical",
  },
  ELEVATED: {
    bg: "bg-elevated/20",
    text: "text-elevated",
    border: "border-elevated",
  },
  WARN: { bg: "bg-warn/20", text: "text-warn", border: "border-warn" },
  INFO: { bg: "bg-info/20", text: "text-info", border: "border-info" },
};

const SEVERITY_LEFT_BORDER: Record<Severity, string> = {
  CRITICAL: "border-l-critical",
  ELEVATED: "border-l-elevated",
  WARN: "border-l-warn",
  INFO: "border-l-info",
};

// ---------------------------------------------------------------------------
// OgsScoreCircle
// ---------------------------------------------------------------------------

function OgsScoreCircle({
  score,
  percentile,
  blurred = false,
}: {
  score: number;
  percentile?: number;
  blurred?: boolean;
}) {
  const radius = 45;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => setOffset(circumference - progress), 100);
    return () => clearTimeout(timer);
  }, [circumference, progress]);

  const color = scoreColor(score);

  return (
    <div className={`flex flex-col items-center ${blurred ? "blur-sm select-none" : ""}`}>
      <svg width="140" height="140" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#1E3A5F"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#F8FAFC"
          fontSize="22"
          fontWeight="bold"
        >
          {score}
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#94A3B8"
          fontSize="8"
        >
          out of 100
        </text>
      </svg>
      {percentile != null && (
        <p className="mt-2 text-sm text-text-secondary">
          {percentile}
          {ordinalSuffix(percentile)} percentile in your cohort
        </p>
      )}
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ---------------------------------------------------------------------------
// SeverityBadge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.INFO;
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text} ${s.border}`}
    >
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SignalCard
// ---------------------------------------------------------------------------

function SignalCard({
  signal,
  onAskCompass,
}: {
  signal: Signal;
  onAskCompass: (query: string) => void;
}) {
  const leftBorder = SEVERITY_LEFT_BORDER[signal.severity] || "border-l-info";

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-5 border-l-4 ${leftBorder}`}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-secondary">
        {formatEnum(signal.domain)}
      </p>
      <h3 className="mb-2 text-base font-semibold text-text-primary">
        {formatEnum(signal.signalCode || signal.code || '')}
      </h3>
      <div className="mb-3 flex items-center gap-2">
        <SeverityBadge severity={signal.severity} />
        {(signal.dollarImpactMin ?? signal.dollarImpactLow) != null && (signal.dollarImpactMax ?? signal.dollarImpactHigh) != null && (
          <span className="text-sm font-medium text-primary">
            {formatDollars(signal.dollarImpactMin ?? signal.dollarImpactLow ?? 0)} &ndash;{" "}
            {formatDollars(signal.dollarImpactMax ?? signal.dollarImpactHigh ?? 0)}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm leading-relaxed text-text-secondary">
        {signal.narrative || signal.narrativeText || ''}
      </p>
      <button
        onClick={() =>
          onAskCompass(
            `Tell me more about the ${formatEnum(signal.signalCode || signal.code || '')} finding.`
          )
        }
        className="rounded border border-primary/40 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
      >
        Ask Compass
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BenchmarkBar
// ---------------------------------------------------------------------------

function BenchmarkBar({ metric }: { metric: BenchmarkMetric }) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-primary">
          {metric.metricLabel || metric.metric || metric.metricName || ''}
        </span>
        <span className="text-xs text-text-secondary">
          Median: {metric.median} {metric.unit}
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-surface-hover">
        {/* p25 marker */}
        <div
          className="absolute top-0 h-full border-l border-dashed border-text-secondary/50"
          style={{ left: "25%" }}
        />
        {/* median marker */}
        <div
          className="absolute top-0 h-full border-l-2 border-solid border-text-primary"
          style={{ left: "50%" }}
        />
        {/* p75 marker */}
        <div
          className="absolute top-0 h-full border-l border-dashed border-text-secondary/50"
          style={{ left: "75%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-secondary">
        <span>p25: {metric.p25}</span>
        <span>p75: {metric.p75}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmailGateModal
// ---------------------------------------------------------------------------

function EmailGateModal({
  npi,
  onSuccess,
  onClose,
}: {
  npi: string;
  onSuccess: (token: string) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npi,
          email,
          ...(firstName && { firstName }),
          ...(title && { title }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to submit");
      }
      const data = await res.json();
      localStorage.setItem(`briefing_token_${npi}`, data.sessionToken);
      onSuccess(data.sessionToken);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-1 text-xl font-bold text-text-primary">
          Unlock Your Full Governance Briefing
        </h2>
        <p className="mb-6 text-sm text-text-secondary">
          See all governance findings, benchmark comparisons, and AI insights
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Email <span className="text-critical">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-primary focus:outline-none"
              placeholder="you@practice.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-border bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-primary focus:outline-none"
              placeholder="Jane"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-primary focus:outline-none"
              placeholder="Office Manager"
            />
          </div>
          {error && (
            <p className="rounded bg-critical/10 px-3 py-2 text-sm text-critical">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy transition hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Unlock Briefing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompassChat
// ---------------------------------------------------------------------------

function CompassChat({
  npi,
  practiceName,
  sessionToken,
  initialQuery,
  onInitialQueryConsumed,
}: {
  npi: string;
  practiceName: string;
  sessionToken: string;
  initialQuery: string | null;
  onInitialQueryConsumed: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      const userMsg: ChatMessage = { role: "user", content: query.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const conversationHistory = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const res = await fetch(`/api/compass`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npi,
            query: query.trim(),
            sessionToken,
            conversationHistory,
          }),
        });
        if (!res.ok) throw new Error("Compass request failed");
        const data: CompassResponse = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I was unable to process that request. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, npi, sessionToken]
  );

  // Handle initial query from "Ask Compass" buttons
  useEffect(() => {
    if (initialQuery) {
      sendMessage(initialQuery);
      onInitialQueryConsumed();
    }
  }, [initialQuery, onInitialQueryConsumed, sendMessage]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-base font-semibold text-text-primary">
          Ask Compass about {practiceName}
        </h3>
      </div>
      <div ref={scrollRef} className="h-72 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-text-secondary">
            Ask a question about this provider&apos;s governance profile...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-surface-hover text-text-primary"
                  : "bg-navy text-text-primary"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-navy px-4 py-2.5">
              <span className="inline-flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about governance risks, benchmarks..."
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy transition hover:bg-primary-hover disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-text-secondary/60">
          Powered by Anthropic Claude
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProviderPage({
  params,
}: {
  params: Promise<{ npi: string }>;
}) {
  const { npi } = use(params);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [briefing, setBriefing] = useState<FullBriefingResponse | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [compassQuery, setCompassQuery] = useState<string | null>(null);

  // Resolve token on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    const storedToken = localStorage.getItem(`briefing_token_${npi}`);
    const token = urlToken || storedToken || null;

    if (urlToken && !storedToken) {
      localStorage.setItem(`briefing_token_${npi}`, urlToken);
    }

    if (token) {
      setSessionToken(token);
      fetchFullBriefing(token);
    } else {
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npi]);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefing/${npi}?preview=true`);
      if (!res.ok) throw new Error("Failed to load provider preview");
      const data: PreviewResponse = await res.json();
      setPreview(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFullBriefing(token: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefing/${npi}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Token might be expired — fall back to preview
        localStorage.removeItem(`briefing_token_${npi}`);
        setSessionToken(null);
        await fetchPreview();
        return;
      }
      const data: FullBriefingResponse = await res.json();
      setBriefing(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function handleGateSuccess(token: string) {
    setSessionToken(token);
    setShowGate(false);
    fetchFullBriefing(token);
  }

  function handleAskCompass(query: string) {
    setCompassQuery(query);
    // Scroll to compass
    setTimeout(() => {
      document.getElementById("compass-chat")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  // Derive provider from whichever response we have
  const provider = briefing?.provider || preview?.provider;
  const ogsScore = (briefing as any)?.ogs || (briefing as any)?.ogsScore || preview?.ogsScore;
  const isFullBriefing = !!briefing && !!sessionToken;

  // ---- Loading / Error states ----

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
          <p className="text-sm text-text-secondary">Loading briefing...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy p-4">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-critical">Error</p>
          <p className="text-sm text-text-secondary">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!provider) return null;

  // Normalize ogsScore — API may return number, object, or null
  const normalizedOgs: OgsScore | null = ogsScore
    ? typeof ogsScore === 'number'
      ? { score: ogsScore }
      : ogsScore
    : null;

  // ---- Render ----

  return (
    <div className="min-h-screen bg-navy">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
              {provider.displayName || provider.practiceName}
            </h1>
            <span className="mt-1 inline-block rounded bg-surface-hover px-2 py-0.5 text-xs font-mono text-text-secondary border border-border">
              NPI {provider.npi}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span>{formatEnum(provider.specialty)}</span>
            <span className="text-border">|</span>
            <span>
              {provider.city}, {provider.state}
            </span>
            {provider.dsoAffiliation && (
              <>
                <span className="text-border">|</span>
                <span className="rounded bg-info/10 px-2 py-0.5 text-xs font-medium text-info border border-info/30">
                  DSO: {provider.dsoAffiliation}
                </span>
              </>
            )}
          </div>
        </header>

        {/* OGS Score */}
        <section className="mb-8 rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Oral Governance Score
          </h2>
          <div className="flex flex-col items-center sm:flex-row sm:items-start sm:gap-8">
            <OgsScoreCircle
              score={normalizedOgs?.score ?? 0}
              percentile={normalizedOgs?.percentile}
              blurred={!isFullBriefing}
            />
            {!isFullBriefing && (
              <div className="mt-4 flex-1 sm:mt-0">
                <p className="text-sm text-text-secondary">
                  Your Oral Governance Score evaluates clinical, financial, and
                  regulatory risk across your practice. Unlock the full briefing to
                  see detailed findings and recommendations.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================ */}
        {/* STATE 1: TEASER */}
        {/* ================================================================ */}
        {!isFullBriefing && preview && (
          <>
            {/* Top finding teaser */}
            <section className="mb-8 rounded-xl border border-border bg-surface p-6">
              <h2 className="mb-3 text-lg font-semibold text-text-primary">
                Top Governance Finding
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-primary">
                  {formatEnum(preview.topDomain || 'BENCHMARK_POSITION')}
                </span>
                <SeverityBadge severity={preview.topSeverity || 'INFO'} />
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                Details are available in the full briefing.
              </p>
            </section>

            {/* CTA */}
            <section className="mb-8 text-center">
              <button
                onClick={() => setShowGate(true)}
                className="rounded-xl bg-primary px-8 py-3 text-base font-bold text-navy shadow-lg transition hover:bg-primary-hover hover:shadow-primary/20"
              >
                Unlock Full Briefing
              </button>
            </section>

            {showGate && (
              <EmailGateModal
                npi={npi}
                onSuccess={handleGateSuccess}
                onClose={() => setShowGate(false)}
              />
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* STATE 2: FULL BRIEFING */}
        {/* ================================================================ */}
        {isFullBriefing && briefing && (
          <>
            {/* Executive Summary */}
            <section className="mb-8 rounded-xl border border-border bg-surface p-6">
              <h2 className="mb-3 text-lg font-semibold text-text-primary">
                Executive Summary
              </h2>
              <p className="text-sm leading-relaxed text-text-secondary">
                {briefing.briefing.executiveSummary ||
                  "A detailed executive summary will be available once the full analysis is complete."}
              </p>
            </section>

            {/* Signal Cards Grid */}
            {briefing.briefing.topSignals.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                  Governance Signals
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {briefing.briefing.topSignals.map((signal, i) => (
                    <SignalCard
                      key={i}
                      signal={signal}
                      onAskCompass={handleAskCompass}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Benchmark Panel */}
            {briefing.briefing.benchmarkSnapshot.length > 0 && (
              <section className="mb-8 rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                  Benchmark Comparison
                </h2>
                {briefing.briefing.benchmarkSnapshot.map((m, i) => (
                  <BenchmarkBar key={i} metric={m} />
                ))}
              </section>
            )}

            {/* HRSA Panel */}
            {provider.hrsaHpsaDesignated && (
              <section className="mb-8 rounded-xl border border-info/30 bg-info/5 p-6">
                <h2 className="mb-2 text-lg font-semibold text-info">
                  HRSA HPSA Designation
                </h2>
                <p className="text-sm text-text-secondary">
                  This provider operates in a Health Professional Shortage Area
                  (HPSA). Special grant programs, enhanced reimbursement, and
                  loan repayment opportunities may be available.
                </p>
              </section>
            )}

            {/* DSO Panel */}
            {provider.dsoAffiliation && (
              <section className="mb-8 rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-2 text-lg font-semibold text-text-primary">
                  DSO Affiliation
                </h2>
                <p className="text-sm text-text-secondary">
                  This provider is affiliated with{" "}
                  <span className="font-medium text-primary">
                    {provider.dsoAffiliation}
                  </span>
                  . DSO-specific governance considerations have been factored
                  into the signals above.
                </p>
              </section>
            )}

            {/* Compass Chat */}
            <section id="compass-chat" className="mb-8">
              <CompassChat
                npi={npi}
                practiceName={provider.displayName || provider.practiceName || ''}
                sessionToken={sessionToken!}
                initialQuery={compassQuery}
                onInitialQueryConsumed={() => setCompassQuery(null)}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
