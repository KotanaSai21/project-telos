export interface SampleYouTubeLink {
  label: string;
  url: string;
}

/**
 * Real, public YouTube videos for demos. All but the last are about a minute or less so a live
 * check finishes quickly; the long one shows the "analyse the opening minute" path.
 */
export const SAMPLE_YOUTUBE_LINKS: readonly SampleYouTubeLink[] = [
  { label: 'Me at the zoo (0:19)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { label: 'Surprised Kitty (0:17)', url: 'https://www.youtube.com/watch?v=0Bmhjf0rKe8' },
  { label: 'Keyboard Cat (0:55)', url: 'https://youtu.be/J---aiyznGQ' },
  { label: 'Charlie bit my finger (0:56)', url: 'https://www.youtube.com/watch?v=_OBlgSz8sSM' },
  { label: 'Squirrel Maze (21:40, long)', url: 'https://www.youtube.com/watch?v=hFZFjoX2cGg' },
];
