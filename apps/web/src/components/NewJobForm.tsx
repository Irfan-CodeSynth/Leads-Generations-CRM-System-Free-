"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Sparkles, AlertCircle, RotateCcw, Building2, MapPin, Check } from "lucide-react";

const MAX = 20;

function parseLines(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}

const PRESETS = [
  {
    name: "Home Services",
    keywords: ["plumber", "electrician", "hvac contractor", "roofing company"],
    locations: ["Austin, TX", "Dallas, TX"],
  },
  {
    name: "Healthcare",
    keywords: ["dental clinic", "orthodontist", "chiropractor", "dermatologist"],
    locations: ["Miami, FL", "Tampa, FL"],
  },
  {
    name: "Real Estate & Legal",
    keywords: ["real estate agency", "property management", "personal injury lawyer"],
    locations: ["Phoenix, AZ", "Scottsdale, AZ"],
  },
];

export default function NewJobForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [keywords, setKeywords] = useState("");
  const [locations, setLocations] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const kw = parseLines(keywords);
  const loc = parseLines(locations);
  const searches = kw.length * loc.length;
  const maxPotentialLeads = searches * 100;

  function applyPreset(preset: (typeof PRESETS)[0]) {
    setKeywords(preset.keywords.join("\n"));
    setLocations(preset.locations.join("\n"));
    setActivePreset(preset.name);
    setError(null);
  }

  function handleReset() {
    setKeywords("");
    setLocations("");
    setActivePreset(null);
    setError(null);
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (kw.length === 0) return setError("Please add at least one keyword");
    if (loc.length === 0) return setError("Please add at least one location");
    if (kw.length > MAX) return setError(`Too many keywords (max ${MAX})`);
    if (loc.length > MAX) return setError(`Too many locations (max ${MAX})`);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: kw, locations: loc }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not create the job");
        setBusy(false);
        return;
      }

      const data = await res.json();
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/jobs/${data.id}`);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-surface2/60 p-4 font-mono text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15";

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Quick Presets */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Instant Industry Presets
          </span>
          {(keywords || locations) && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-soft hover:text-bad-fg transition"
            >
              <RotateCcw className="h-3 w-3" /> Clear fields
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const isSelected = activePreset === p.name;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition active:scale-95 ${
                  isSelected
                    ? "bg-accent text-white shadow-accent"
                    : "border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink"
                }`}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Keywords */}
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card transition-all focus-within:border-accent/50 focus-within:shadow-lift">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="keywords" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Building2 className="h-4 w-4 text-accent" />
              Target Keywords / Niches
            </label>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums transition ${
                kw.length > 0 ? "bg-accent/15 text-accent" : "bg-surface2 text-soft"
              }`}
            >
              {kw.length} / {MAX}
            </span>
          </div>
          <p className="mb-3 text-xs text-muted">
            Enter business categories (one per line, e.g. <code>dentist</code>, <code>plumber</code>)
          </p>
          <textarea
            id="keywords"
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
              setActivePreset(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            rows={6}
            placeholder={"dentist\ncosmetic dental\northodontist"}
            className={field}
          />
        </div>

        {/* Locations */}
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card transition-all focus-within:border-accent/50 focus-within:shadow-lift">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="locations" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <MapPin className="h-4 w-4 text-info-fg" />
              Target Locations
            </label>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums transition ${
                loc.length > 0 ? "bg-info-fg/15 text-info-fg" : "bg-surface2 text-soft"
              }`}
            >
              {loc.length} / {MAX}
            </span>
          </div>
          <p className="mb-3 text-xs text-muted">
            Enter target cities or postal codes (one per line, e.g. <code>Austin, TX</code>)
          </p>
          <textarea
            id="locations"
            value={locations}
            onChange={(e) => {
              setLocations(e.target.value);
              setActivePreset(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            rows={6}
            placeholder={"Austin, TX\nRound Rock, TX\nSan Marcos, TX"}
            className={field}
          />
        </div>
      </div>

      {/* Projection Banner */}
      {searches > 0 && (
        <div className="animate-fade-in flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/20 bg-accent-soft/40 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">
                {searches} Google Maps {searches === 1 ? "Search Matrix" : "Search Matrices"}
              </div>
              <div className="text-xs text-muted">
                Extracts up to <span className="font-semibold text-ink">{maxPotentialLeads} leads</span>.
                Global ledger will bypass any already captured business at zero cost.
              </div>
            </div>
          </div>
          <div className="text-xs font-medium text-accent">Press Ctrl + Enter to launch</div>
        </div>
      )}

      {error && (
        <div className="animate-fade-in flex items-center gap-2.5 rounded-xl border border-bad-bg bg-bad-bg/30 p-3.5 text-sm font-medium text-bad-fg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={busy || searches === 0}
          className="inline-flex items-center gap-2 rounded-2xl bg-accent-strong px-7 py-3 text-sm font-semibold text-white shadow-accent transition hover:bg-accent-dark hover:shadow-lift active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner /> Starting Scraper…
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" /> Launch Scraping Job
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
