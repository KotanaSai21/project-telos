import type {
  ConsentProfile,
  Health,
  ProjectTelosFixture,
  ProjectTelosItem,
  ProjectTelosReceipt,
  ThumbnailRedesignRequest,
  ThumbnailRedesignResult,
  ThumbnailTruthHistoryEntry,
  ThumbnailTruthRequest,
  ThumbnailTruthResult,
  ThumbnailTruthSample,
  ThumbnailTruthStatus,
  ThumbnailTruthYouTubePreview,
  ThumbnailTruthYouTubeRequest,
  YouTubeLinkResult,
  YouTubeStatus,
  YouTubeSearch,
  YouTubeAudit,
  ViewerGoal,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Fired when the API answers 401 because the access-code cookie is missing or expired. */
export const ACCESS_LOCKED_EVENT = 'telos:access-locked';

export interface AccessStatus {
  required: boolean;
  unlocked: boolean;
  hint: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    // The API returns {detail: "..."}; fall back to the status text if it does not.
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !path.startsWith('/access/')) {
      window.dispatchEvent(new Event(ACCESS_LOCKED_EVENT));
    }
    throw new ApiError(response.status, body?.detail ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  accessStatus: () => request<AccessStatus>('/access/status'),
  accessVerify: (code: string) => request<void>('/access/verify', {
    method: 'POST', body: JSON.stringify({ code }),
  }),
  thumbnailTruthStatus: () => request<ThumbnailTruthStatus>('/project-telos/thumbnail-truth/status'),
  thumbnailTruthSamples: () => request<ThumbnailTruthSample[]>('/project-telos/thumbnail-truth/samples'),
  thumbnailTruthAnalyse: (submission: ThumbnailTruthRequest, signal?: AbortSignal) =>
    request<ThumbnailTruthResult>('/project-telos/thumbnail-truth/analyse', {
      method: 'POST', body: JSON.stringify(submission), signal,
    }),
  thumbnailTruthAnalyseYoutube: (submission: ThumbnailTruthYouTubeRequest, signal?: AbortSignal) =>
    request<ThumbnailTruthResult>('/project-telos/thumbnail-truth/analyse-youtube', {
      method: 'POST', body: JSON.stringify(submission), signal,
    }),
  thumbnailTruthYoutubePreview: (url: string, signal?: AbortSignal) =>
    request<ThumbnailTruthYouTubePreview>('/project-telos/thumbnail-truth/youtube-preview', {
      method: 'POST', body: JSON.stringify({ url }), signal,
    }),
  thumbnailTruthHistory: (creatorId: string) =>
    request<ThumbnailTruthHistoryEntry[]>(`/project-telos/thumbnail-truth/history/${encodeURIComponent(creatorId)}`),
  thumbnailTruthForgetHistory: (creatorId: string) =>
    request<void>(`/project-telos/thumbnail-truth/history/${encodeURIComponent(creatorId)}`, { method: 'DELETE' }),
  thumbnailTruthRedesign: (submission: ThumbnailRedesignRequest) =>
    request<ThumbnailRedesignResult>('/project-telos/thumbnail-truth/redesign', {
      method: 'POST', body: JSON.stringify(submission),
    }),
  youtubeLink: (profileId: string, url: string) => request<YouTubeLinkResult>('/project-telos/youtube/link', {
    method: 'POST', body: JSON.stringify({ profileId, url }),
  }),
  youtubeStatus: () => request<YouTubeStatus>('/project-telos/youtube/status'),
  youtubeSearch: (profileId: string) => request<YouTubeSearch>('/project-telos/youtube/search', {
    method: 'POST', body: JSON.stringify({ profileId }),
  }),
  youtubeAnalyse: (profileId: string, videoId: string) => request<YouTubeAudit>('/project-telos/youtube/analyse', {
    method: 'POST', body: JSON.stringify({ profileId, videoId, consentToGoogleAnalysis: true }),
  }),
  health: () => request<Health>('/health'),
  projectTelosFixtures: () => request<ProjectTelosFixture[]>('/project-telos/fixtures'),
  projectTelosPush: (profileId: string, assetId: string, sessionId: string, itemId: string) =>
    request<ProjectTelosItem>('/project-telos/push', {
      method: 'POST',
      body: JSON.stringify({ profileId, assetId, sessionId, itemId }),
    }),
  projectTelosOutcome: (sessionId: string, itemId: string, outcome: 'held' | 'reframed') =>
    request<ProjectTelosItem>('/project-telos/outcome', {
      method: 'POST',
      body: JSON.stringify({ sessionId, itemId, outcome }),
    }),
  projectTelosReceipt: (sessionId: string) => request<ProjectTelosReceipt>(`/project-telos/receipt/${sessionId}`),
  declare: (utterance: string, context: string, preferences?: { goal: ViewerGoal; topics?: string[] }) =>
    request<ConsentProfile>('/profiles', {
      method: 'POST',
      body: JSON.stringify({ utterance, context, ...preferences }),
    }),
  viewerPreferences: (id: string) =>
    request<{ profileId: string; goal: ViewerGoal; utterance?: string; context?: string }>(`/profiles/${id}/preferences`),

  presets: () => request<ConsentProfile[]>('/profiles/presets'),

  seedPresets: () => request<ConsentProfile[]>('/profiles/presets', { method: 'POST' }),

  profile: (id: string) => request<ConsentProfile>(`/profiles/${id}`),

  forget: (id: string) => request<void>(`/profiles/${id}`, { method: 'DELETE' }),

};
