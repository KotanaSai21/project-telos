import type { ConsentProfile, Decision } from '@project-telos/contracts';

export type ViewerGoal = 'learn' | 'entertainment' | 'inspiration' | 'informed';

export const VIEWER_GOALS: Record<ViewerGoal, string> = {
  learn: 'Learn', entertainment: 'Be entertained', inspiration: 'Get inspired', informed: 'Stay informed',
};

export interface TopicMatch {
  status: 'matched' | 'off-topic' | 'unrestricted' | 'unknown';
  topics: string[];
  matchedInterests: string[];
  /** Interests Gemini judged covered (synonyms, sub-topics) that exact phrase matching missed. */
  judgedInterests?: string[];
}

export interface ProjectTelosFixture {
  id: string;
  title: string;
  hook: string;
  promiseTopics: string[];
  durationSec: number;
}

export interface ProjectTelosItem {
  sessionId: string;
  itemId: string;
  profileId: string;
  assetId: string;
  status: 'allowed' | 'protected' | 'held' | 'reframed';
  holdAtSec: number;
  analysisBy: string;
  decision: Decision;
  topicMatch?: TopicMatch;
  bait: {
    index: number;
    switchSec: number | null;
    mismatchShare: number;
    evidence: Array<{ startSec: number; endSec: number; topics: string[]; mismatch: number }>;
    method: string;
  };
  summary?: string;
  summaryBy?: string;
  illustration?: string;
  illustrationBy?: string;
}

export interface ProjectTelosReceipt {
  sessionId: string;
  itemsPushed: number;
  baitTrapsNeutralized: number;
  reframed: number;
  pending: number;
  consentRate: number | null;
  note: string;
}

export interface Health {
  provider: string;
  uses_model_calls: boolean;
  offline_fallback: boolean;
  integrations?: Record<string, boolean | string>;
}

export interface YouTubeStatus {
  searchConfigured: boolean;
  analysisConfigured: boolean;
  model: string;
  note: string;
}

export interface YouTubeCandidate {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  canonicalUrl: string;
  durationSec: number | null;
}

export interface YouTubeSearch {
  profileId: string;
  query: string;
  videos: YouTubeCandidate[];
  source: string;
  note: string;
}

export interface YouTubeLinkResult {
  video: YouTubeCandidate;
  note: string;
}

export interface YouTubeAudit {
  profileId: string;
  video: YouTubeCandidate;
  audit: {
    evidenceStatus: 'sufficient' | 'insufficient';
    baitScore: number | null;
    explanation: string;
    summary: string;
    confidence: number;
    evidence: Array<{
      startSec: number; endSec: number; promised: string; observed: string; mismatch: boolean;
    }>;
  };
  decision: Decision | null;
  recommendation: 'eligible' | 'hold' | 'unverified';
  topicMatch?: TopicMatch;
  analysedBy: string;
  analysedAt: string;
  note: string;
}

export interface ThumbnailTruthStatus {
  liveConfigured: boolean;
  model: string;
  maxThumbnailBytes: number;
  maxVideoBytes: number;
  note: string;
  imagenConfigured?: boolean;
  imagenModel?: string;
  translationEnabled?: boolean;
  analyticsEnabled?: boolean;
}

export type RiskBand = 'safe' | 'review' | 'high' | 'unverified';

export interface ThumbnailTruthResult {
  source: 'gemini' | 'reviewed-sample';
  model: string | null;
  evidenceStatus: 'sufficient' | 'insufficient';
  riskScore: number | null;
  band: RiskBand;
  bandLabel: string;
  breakdown: { visualRisk: number; sentimentRisk: number; penalties: number } | null;
  ghostTracker: Array<{ entity: string; status: 'verified' | 'ghost' | 'unconfirmed' }>;
  visualExaggeration: { detected: boolean; details: string };
  sentiment: { thumbnail: string; video: string; contradiction: boolean; thematicMismatch: boolean };
  rationale: string[];
  remediationTip: string;
  videoProvided: boolean;
  note: string;
  translation?: { detectedLanguage: string; translated: boolean; provider: string } | null;
  youtubeVideo?: YouTubeCandidate | null;
  analysedWindowSec?: number | null;
  promisedTopics?: string[];
  actualTopics?: string[];
  evidence?: Array<{ promised: string; observed: string; startSec: number | null; endSec: number | null }>;
  improvedTitle?: string;
}

export interface ThumbnailTruthSample {
  id: string;
  label: string;
  title: string;
  description: string;
  transcript: string;
  region: string;
  thumbnailCaption: string;
  thumbnailText: string;
  thumbnailTone: 'calm' | 'shock' | 'grief';
  result: ThumbnailTruthResult;
}

export interface MediaUpload {
  mimeType: string;
  dataBase64: string;
}

export interface ThumbnailTruthRequest {
  title: string;
  description: string;
  transcript: string;
  region: string;
  thumbnail: MediaUpload;
  video?: MediaUpload;
  consentToGoogleAnalysis: boolean;
}

export interface ThumbnailTruthYouTubeRequest {
  url: string;
  transcript: string;
  region: string;
  consentToGoogleAnalysis: boolean;
  /** Analyse only the opening seconds; omit for the whole video. */
  clipSeconds?: number;
}

export interface ThumbnailTruthYouTubePreview {
  video: YouTubeCandidate;
  maxFullSeconds: number;
}

export interface ThumbnailRedesignRequest {
  title: string;
  videoSummary: string;
  avoid: string[];
  remediationTip: string;
  consentToGoogleAnalysis: boolean;
}

export interface ThumbnailRedesignResult {
  imageBase64: string;
  mimeType: string;
  model: string;
  prompt: string;
  note: string;
}



export type { ConsentProfile, Decision };
