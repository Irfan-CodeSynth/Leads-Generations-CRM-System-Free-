export interface JobSummary {
  id: number;
  status: string;
  phase: string | null;
  phaseTotal: number | null;
  phaseDone: number | null;
  cancelRequested: boolean;
  keywords: string[];
  locations: string[];
  leadsFound: number;
  leadsSkipped: number;
  errorMsg: string | null;
  createdAt: string;
}

export interface LeadRow {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  status: string;
  notes: string | null;
  emails: string[] | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  youtube: string | null;
}

export interface JobDetail {
  id: number;
  status: string;
  keywords: string[];
  locations: string[];
  leadsFound: number;
  errorMsg: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalLeads: number;
  totalKnownPlaces: number;
  totalJobs: number;
  activeJobs: number;
  enrichedCount: number;
  emailsCount: number;
  enrichmentRate: number;
  statusBreakdown: Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  recentJobs: JobSummary[];
  recentLeads: Array<{
    id: number;
    jobId: number;
    name: string;
    category: string | null;
    rating: number | null;
    website: string | null;
    phone: string | null;
    status: string;
    createdAt: string;
    emails: string[] | null;
  }>;
}
