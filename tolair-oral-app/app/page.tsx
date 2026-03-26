"use client";

import { useState, useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatSpecialty(raw: string): string {
  const map: Record<string, string> = {
    GENERAL_DENTISTRY: "General Dentistry",
    ORAL_MAXILLOFACIAL_SURGERY: "Oral & Maxillofacial Surgery",
    ORTHODONTICS: "Orthodontics",
    PEDIATRIC_DENTISTRY: "Pediatric Dentistry",
    PERIODONTICS: "Periodontics",
    PROSTHODONTICS: "Prosthodontics",
    ENDODONTICS: "Endodontics",
    ORAL_PATHOLOGY: "Oral Pathology",
    DENTAL_PUBLIC_HEALTH: "Dental Public Health",
    ORAL_RADIOLOGY: "Oral Radiology",
  };
  if (map[raw]) return map[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-text-secondary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProviderResult {
  npi: string;
  displayName: string;
  specialty?: string;
  city?: string;
  state?: string;
  ogsScore?: number;
  dsoName?: string | null;
  dsoSlug?: string | null;
  type: "provider";
}

interface DsoResult {
  slug: string;
  dsoName: string;
  providerCount?: number;
  type: "dso";
}

type SearchResult = ProviderResult | DsoResult;

/* ------------------------------------------------------------------ */
/*  Stats bar                                                         */
/* ------------------------------------------------------------------ */

const stats = [
  { label: "Oral Health Providers", value: "200,000+" },
  { label: "DSOs Indexed", value: "150+" },
  { label: "All 50 States", value: "50" },
  { label: "Real NPI Data, Updated Monthly", value: "NPI" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const isSearchActive = query.trim().length >= 2;

  return (
    <div className="flex flex-col items-center">
      {/* ---- Hero ---- */}
      <section className="w-full px-4 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
        <p className="text-xs sm:text-sm font-semibold tracking-widest text-primary uppercase mb-4">
          Oral Health Intelligence
        </p>
        <h1 className="mx-auto max-w-3xl text-3xl sm:text-5xl font-bold leading-tight text-text-primary">
          What does your practice look like from the outside?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg text-text-secondary">
          Search 200,000+ dental providers and DSOs. Free, no login required.
        </p>

        {/* ---- Search bar ---- */}
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by provider name, NPI, city, or DSO..."
              className="w-full rounded-xl border border-border bg-surface py-4 pl-12 pr-4 text-base text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            />
            {loading && (
              <div className="absolute inset-y-0 right-4 flex items-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- Search Results or Stats ---- */}
      {isSearchActive ? (
        <section className="w-full max-w-4xl px-4 pb-16">
          {loading && results.length === 0 && (
            <p className="text-center text-text-secondary">Searching...</p>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="text-center text-text-secondary">
              No results found for &ldquo;{query}&rdquo;. Try a different name,
              NPI, or city.
            </p>
          )}

          {results.length > 0 && (
            <div className="grid gap-3">
              {results.map((r) =>
                r.type === "dso" ? (
                  <a
                    key={`dso-${r.slug}`}
                    href={`/dso/${r.slug}`}
                    className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-sm">
                      DSO
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                        {r.dsoName}
                      </p>
                      {r.providerCount !== undefined && (
                        <p className="text-sm text-text-secondary">
                          {r.providerCount} affiliated providers
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
                      DSO
                    </span>
                  </a>
                ) : (
                  <a
                    key={`prov-${r.npi}`}
                    href={`/provider/${r.npi}`}
                    className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-secondary font-bold text-sm">
                      {r.displayName?.charAt(0) ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                        {r.displayName}
                      </p>
                      <p className="text-sm text-text-secondary truncate">
                        {r.specialty ? formatSpecialty(r.specialty) : "Dentist"}
                        {r.city && r.state && ` · ${r.city}, ${r.state}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.dsoName && (
                        <span className="text-xs font-medium text-info bg-info/10 rounded-full px-2.5 py-0.5 hidden sm:inline-block truncate max-w-[140px]">
                          {r.dsoName}
                        </span>
                      )}
                      {r.ogsScore !== undefined && (
                        <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
                          OGS {r.ogsScore}
                        </span>
                      )}
                    </div>
                  </a>
                )
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="w-full max-w-5xl px-4 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border bg-surface p-5 text-center"
              >
                <p className="text-2xl sm:text-3xl font-bold text-primary">
                  {s.value}
                </p>
                <p className="mt-1 text-xs sm:text-sm text-text-secondary">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
