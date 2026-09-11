export interface LeadScanPayload {
  userId: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  keywords?: string[];
  maxResults?: number;
}

export interface EnrichedLead {
  name: string;
  jobTitle: string | null;
  company: string;
  email: string | null;
  linkedinUrl: string | null;
  location: string;
  industry: string;
  domain: string | null;
  sourcePlatform: string;
  confidence: number; // 0–1 match confidence score
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'INVALID' | 'CATCH_ALL';
}
