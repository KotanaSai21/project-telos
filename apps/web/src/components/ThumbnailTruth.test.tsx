import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { ThumbnailTruthResult, ThumbnailTruthSample } from '../api/types';
import { ThumbnailTruth } from './ThumbnailTruth';

vi.mock('../api/client', () => ({
  api: {
    thumbnailTruthStatus: vi.fn(), thumbnailTruthSamples: vi.fn(), thumbnailTruthAnalyse: vi.fn(),
    thumbnailTruthAnalyseYoutube: vi.fn(), thumbnailTruthRedesign: vi.fn(), thumbnailTruthYoutubePreview: vi.fn(),
  },
}));

const highRisk: ThumbnailTruthResult = {
  source: 'reviewed-sample', model: null, evidenceStatus: 'sufficient', riskScore: 100, band: 'high',
  bandLabel: 'High deception risk: publish held',
  breakdown: { visualRisk: 88, sentimentRisk: 88, penalties: 25 },
  ghostTracker: [
    { entity: 'Red supercar', status: 'ghost' },
    { entity: 'Presenter', status: 'verified' },
  ],
  visualExaggeration: { detected: true, details: 'Composited flames.' },
  sentiment: { thumbnail: 'Panic', video: 'Relaxed how-to', contradiction: true, thematicMismatch: true },
  rationale: ['No supercar in the transcript.', 'Calm tutorial, shocked thumbnail.'],
  remediationTip: 'Show the hatchback instead.',
  videoProvided: false,
  improvedTitle: 'A one-product hatchback wash',
  promisedTopics: ['supercar'], actualTopics: ['car wash'],
  evidence: [{ promised: 'A burning supercar', observed: 'A calm car wash', startSec: null, endSec: null }],
  note: 'Reviewed sample: precomputed and labelled; no model call was made.',
};

const sample: ThumbnailTruthSample = {
  id: 'ghost-supercar', label: 'Bait: ghost supercar', title: 'I washed my car',
  description: 'A hatchback wash.', transcript: 'We rinse the hatchback.', region: 'India',
  thumbnailCaption: 'Burning supercar', thumbnailText: 'IT EXPLODED?!', thumbnailTone: 'shock',
  result: highRisk,
};

function status(liveConfigured: boolean, extra: { imagenConfigured?: boolean } = {}) {
  vi.mocked(api.thumbnailTruthStatus).mockResolvedValue({
    liveConfigured, model: 'test-model', maxThumbnailBytes: 4 * 1024 * 1024,
    maxVideoBytes: 15 * 1024 * 1024, note: 'Gemini Developer API', ...extra,
  });
}

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'thumb.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.thumbnailTruthSamples).mockResolvedValue([sample]);
});

describe('ThumbnailTruth', () => {
  it('shows creator-only evidence and starts a revision without inventing a new verdict', async () => {
    status(true);
    render(<ThumbnailTruth />);
    await userEvent.click(await screen.findByRole('button', { name: /Bait: ghost supercar/ }));
    expect(screen.getByText('Promise: A burning supercar')).toBeInTheDocument();
    expect(screen.getByText('Observed: A calm car wash')).toBeInTheDocument();
    expect(screen.getByText('No timestamp supplied')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revise draft and recheck' }));
    expect(screen.getByLabelText('Video title')).toHaveValue('A one-product hatchback wash');
    expect(screen.getByLabelText('Transcript or subtitles')).toHaveValue(sample.transcript);
    expect(screen.queryByText('Integrity diagnostics')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeDisabled();
    expect(api.thumbnailTruthAnalyse).not.toHaveBeenCalled();
    await userEvent.upload(screen.getByLabelText(/Upload custom thumbnail/), jpeg());
    await screen.findByAltText('Selected thumbnail preview');
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeEnabled();
  });

  it('puts the draft checker before reviewed examples and explains evidence requirements', async () => {
    status(true);
    render(<ThumbnailTruth />);

    const draftHeading = await screen.findByRole('heading', { name: 'Check your draft' });
    const samplesHeading = screen.getByRole('heading', { name: 'Try a reviewed example' });
    expect(draftHeading.compareDocumentPosition(samplesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/video is optional: upload it for a direct check, or paste a transcript below instead/i))
      .toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText(/Upload custom thumbnail/), jpeg());
    await userEvent.type(screen.getByLabelText('Video title'), 'A real car wash');
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Transcript or subtitles'), 'I wash my car.');
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeEnabled();
  });

  it('shows a reviewed sample with its gauge, ghost tracker, and honest label offline', async () => {
    status(false);
    render(<ThumbnailTruth />);
    await userEvent.click(await screen.findByRole('button', { name: /Bait: ghost supercar/ }));

    expect(screen.getByRole('img', { name: /Deception risk 100 out of 100/ })).toBeInTheDocument();
    expect(screen.getByText('High deception risk: publish held')).toBeInTheDocument();
    expect(screen.getByText('Red supercar').closest('li')).toHaveClass('entity-ghost');
    expect(screen.getByText('Reviewed sample · no model call')).toBeInTheDocument();
    expect(screen.getByText(/Show the hatchback instead/)).toBeInTheDocument();
    expect(screen.getByText('Live check not configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeDisabled();
  });

  it('requires a thumbnail, title, and consent before sending a live check', async () => {
    status(true);
    vi.mocked(api.thumbnailTruthAnalyse).mockResolvedValue({
      ...highRisk, source: 'gemini', model: 'test-model', note: 'Gemini analysis of your draft.',
    });
    render(<ThumbnailTruth />);
    const verify = await screen.findByRole('button', { name: 'Verify platform integrity' });
    await screen.findByText('Gemini configured · test-model');

    await userEvent.upload(screen.getByLabelText(/Upload custom thumbnail/), jpeg());
    await screen.findByAltText('Selected thumbnail preview');
    await userEvent.type(screen.getByLabelText('Video title'), 'Washing my hatchback');
    await userEvent.type(screen.getByLabelText('Transcript or subtitles'), 'We rinse it.');
    expect(verify).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(verify);

    await screen.findByText('Live Gemini · test-model');
    const submission = vi.mocked(api.thumbnailTruthAnalyse).mock.calls[0]![0];
    expect(submission).toMatchObject({
      title: 'Washing my hatchback', transcript: 'We rinse it.', consentToGoogleAnalysis: true,
      thumbnail: { mimeType: 'image/jpeg', dataBase64: '/9j/AA==' },
    });
    expect(submission.video).toBeUndefined();
  });

  it('rejects unsupported files before upload and surfaces API errors', async () => {
    status(true);
    vi.mocked(api.thumbnailTruthAnalyse).mockRejectedValue(new Error('Gemini analysis failed. No verdict was produced; retry.'));
    render(<ThumbnailTruth />);
    await screen.findByText('Gemini configured · test-model');

    await userEvent.upload(screen.getByLabelText(/Upload custom thumbnail/),
      new File(['gif'], 'thumb.gif', { type: 'image/gif' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Thumbnail must be JPEG, PNG, or WebP.');

    await userEvent.upload(screen.getByLabelText(/Upload custom thumbnail/), jpeg());
    await screen.findByAltText('Selected thumbnail preview');
    await userEvent.type(screen.getByLabelText('Video title'), 'Title');
    await userEvent.type(screen.getByLabelText('Transcript or subtitles'), 'The video shows the car wash.');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Verify platform integrity' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No verdict was produced'));
    expect(screen.queryByText('Integrity diagnostics')).not.toBeInTheDocument();
  });
  it('checks a published YouTube video from a sample link and shows the translation badge', async () => {
    status(true);
    vi.mocked(api.thumbnailTruthAnalyseYoutube).mockResolvedValue({
      ...highRisk, source: 'gemini', model: 'test-model', videoProvided: true,
      translation: { detectedLanguage: 'hi', translated: true, provider: 'Cloud Translation v3' },
      youtubeVideo: {
        videoId: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: 'jawed', description: '',
        canonicalUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', durationSec: 19,
      },
    });
    render(<ThumbnailTruth />);
    await userEvent.click(await screen.findByRole('button', { name: 'Published YouTube link' }));
    expect(screen.queryByLabelText(/Upload custom thumbnail/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Me at the zoo (0:19)' }));
    expect(screen.getByLabelText('Public YouTube video link')).toHaveValue('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    const verify = screen.getByRole('button', { name: 'Verify platform integrity' });
    expect(verify).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(verify);

    expect(api.thumbnailTruthAnalyseYoutube).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', transcript: '', region: '', consentToGoogleAnalysis: true,
      clipSeconds: 60,
    }, expect.any(AbortSignal));
    expect(api.thumbnailTruthAnalyse).not.toHaveBeenCalled();
    expect(await screen.findByText(/Me at the zoo · jawed/)).toBeInTheDocument();
    expect(screen.getByText('Translated from hi · Cloud Translation v3')).toBeInTheDocument();
  });

  it('offers clip lengths for a long video, shows progress, and can cancel', async () => {
    status(true);
    vi.mocked(api.thumbnailTruthYoutubePreview).mockResolvedValue({
      video: {
        videoId: 'hFZFjoX2cGg', title: 'Backyard Squirrel Maze', channel: 'Mark Rober', description: '',
        canonicalUrl: 'https://www.youtube.com/watch?v=hFZFjoX2cGg', durationSec: 1300,
      },
      maxFullSeconds: 1200,
    });
    vi.mocked(api.thumbnailTruthAnalyseYoutube).mockImplementation((_, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    render(<ThumbnailTruth />);
    await userEvent.click(await screen.findByRole('button', { name: 'Published YouTube link' }));
    await userEvent.click(screen.getByRole('button', { name: /Squirrel Maze/ }));

    expect(await screen.findByText('Backyard Squirrel Maze')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /First minute/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Whole video/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /First 5 minutes/ }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Verify platform integrity' }));

    expect(api.thumbnailTruthAnalyseYoutube).toHaveBeenCalledWith(
      expect.objectContaining({ clipSeconds: 300 }), expect.any(AbortSignal),
    );
    expect(screen.getByText(/Gemini watches the first 5:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check cancelled');
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeEnabled();
  });

  it('suggests an honest thumbnail with Imagen only after consent on a flagged result', async () => {
    status(true, { imagenConfigured: true });
    vi.mocked(api.thumbnailTruthRedesign).mockResolvedValue({
      imageBase64: 'AAAA', mimeType: 'image/png', model: 'imagen-test', prompt: 'p',
      note: 'AI-generated suggestion from Imagen, with an invisible SynthID watermark.',
    });
    render(<ThumbnailTruth />);
    await userEvent.click(await screen.findByRole('button', { name: /Bait: ghost supercar/ }));
    const generate = screen.getByRole('button', { name: 'Generate honest thumbnail' });
    expect(generate).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Send the title and the video summary/));
    await userEvent.click(generate);

    expect(api.thumbnailTruthRedesign).toHaveBeenCalledWith({
      title: 'I washed my car', videoSummary: 'Relaxed how-to', avoid: ['Red supercar'],
      remediationTip: 'Show the hatchback instead.', consentToGoogleAnalysis: true,
    });
    expect(await screen.findByAltText('Imagen thumbnail suggestion for I washed my car')).toHaveAttribute(
      'src', 'data:image/png;base64,AAAA',
    );
    expect(screen.getByText(/SynthID watermark/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use this thumbnail in a new check' }));
    expect(screen.getByAltText('Selected thumbnail preview')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(screen.getByLabelText('Video title')).toHaveValue('A one-product hatchback wash');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Verify platform integrity' })).toBeDisabled();
  });});
