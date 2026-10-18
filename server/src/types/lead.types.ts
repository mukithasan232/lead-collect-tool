export interface LeadScanPayload {
  userId: string;
  query?: string;
  platform?: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  keywords?: string[];
  maxResults?: number;
  apiKey?: string;
  excludeUrls?: string[];
}

export interface EnrichedLead {
  name: string;
  jobTitle: string | null;
  company: string;
  email: string | null;
  linkedinUrl: string | null;
  location: string;
  region?: string;
  industry: string;
  companySize?: string;
  phone?: string;
  domain: string | null;
  sourcePlatform: string;
  confidence: number; // 0–1 match confidence score
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'INVALID' | 'CATCH_ALL';
  intentSignal?: string;
  intentCategory?: string;
  seniority?: string;
  pipelineStage?: string;
}

