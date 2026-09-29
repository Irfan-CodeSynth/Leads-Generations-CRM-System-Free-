import NewJobForm from "@/components/NewJobForm";
import { Sparkles, Shield, Zap, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NewJobPage() {
  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            <Zap className="h-3.5 w-3.5" />
            High-Performance Lead Scraper
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Launch New Lead Search
          </h1>
          <p className="mt-1 text-sm text-muted">
            Target high-intent local businesses by keywords and locations with automated Google Maps extraction & contact enrichment.
          </p>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Search className="h-4 w-4" />
          </div>
          <div className="text-sm font-semibold text-ink">Multi-Keyword × Location</div>
          <div className="mt-1 text-xs text-muted">
            Combines every keyword with every location into targeted search matrices.
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ok-fg/10 text-ok-fg">
            <Shield className="h-4 w-4" />
          </div>
          <div className="text-sm font-semibold text-ink">Global Deduplication</div>
          <div className="mt-1 text-xs text-muted">
            Places previously mined are automatically skipped — zero wasted requests.
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-info-fg/10 text-info-fg">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-sm font-semibold text-ink">Deep Site Enrichment</div>
          <div className="mt-1 text-xs text-muted">
            Crawls websites for verified emails and LinkedIn, Instagram, Facebook, and X handles.
          </div>
        </div>
      </div>

      {/* Form Container */}
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <NewJobForm />
      </div>
    </div>
  );
}
