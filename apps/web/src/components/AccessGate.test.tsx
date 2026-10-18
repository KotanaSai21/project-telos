import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_LOCKED_EVENT, ApiError, api } from '../api/client';
import { AccessGate } from './AccessGate';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { accessStatus: vi.fn(), accessVerify: vi.fn() } };
});

beforeEach(() => vi.resetAllMocks());

describe('AccessGate', () => {
  it('shows the app straight away when no code is required', async () => {
    vi.mocked(api.accessStatus).mockResolvedValue({ required: false, unlocked: true, hint: null });
    render(<AccessGate><p>The app</p></AccessGate>);
    expect(await screen.findByText('The app')).toBeInTheDocument();
  });

  it('asks for the code, shows the hint, and opens after a correct code', async () => {
    vi.mocked(api.accessStatus).mockResolvedValue({ required: true, unlocked: false, hint: 'Two words' });
    vi.mocked(api.accessVerify)
      .mockRejectedValueOnce(new ApiError(401, 'That access code is not right.'))
      .mockResolvedValueOnce(undefined);
    render(<AccessGate><p>The app</p></AccessGate>);

    const input = await screen.findByLabelText('Access code');
    expect(screen.getByText('Hint: Two words')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /security by design/i })).toBeInTheDocument();
    expect(screen.getByText(/No Gemini key to leak/)).toBeInTheDocument();
    expect(screen.queryByText('The app')).not.toBeInTheDocument();

    await userEvent.type(input, 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not right');

    await userEvent.clear(input);
    await userEvent.type(input, 'Chinnadler Bong');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(api.accessVerify).toHaveBeenLastCalledWith('Chinnadler Bong');
  });

  it('hides the hint when the server does not send one, and relocks on a 401', async () => {
    vi.mocked(api.accessStatus).mockResolvedValue({ required: true, unlocked: true, hint: null });
    render(<AccessGate><p>The app</p></AccessGate>);
    expect(await screen.findByText('The app')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event(ACCESS_LOCKED_EVENT)); });
    expect(await screen.findByLabelText('Access code')).toBeInTheDocument();
    expect(screen.queryByText(/Hint:/)).not.toBeInTheDocument();
  });
});
