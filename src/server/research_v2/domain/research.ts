/** PRIMARY = regulator, filing, annual report, concall transcript; SECONDARY = everything else (a lead only). */
export type ResearchTier = 'PRIMARY' | 'SECONDARY';

/** VERIFIED = traced to a primary source; UNVERIFIED_LEAD = untraced secondary; MANAGEMENT_CLAIM = concall. */
export type ResearchStatus = 'VERIFIED' | 'UNVERIFIED_LEAD' | 'REJECTED' | 'MANAGEMENT_CLAIM';

/** One third-party or primary item stored for a research brief. */
export interface ResearchItem {
  id: string;
  symbol: string;
  tier: ResearchTier;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  subQuestionIds: string[];
  status: ResearchStatus;
  /** URL or filing id of the primary source this item was traced to. */
  tracedTo?: string;
}
