import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@/lib/api/client';
import { OverviewPanel } from './overview-panel';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

const successPayload = {
  incubators: 3,
  stages: 5,
  startups: 12,
  funnel: { applied: 4, active: 2, graduated: 1, dropped: 1 },
};

describe('OverviewPanel', () => {
  it('loads overview counts and funnel', async () => {
    apiClient.mockResolvedValue(successPayload);

    render(<OverviewPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('overview-incubators')).toHaveTextContent('3');
    });
    expect(screen.getByTestId('overview-stages')).toHaveTextContent('5');
    expect(screen.getByTestId('overview-startups')).toHaveTextContent('12');
    expect(screen.getByTestId('funnel-applied')).toHaveTextContent('4');
    expect(screen.getByTestId('funnel-active')).toHaveTextContent('2');
    expect(screen.getByTestId('funnel-graduated')).toHaveTextContent('1');
    expect(screen.getByTestId('funnel-dropped')).toHaveTextContent('1');
    expect(apiClient).toHaveBeenCalledWith('/api/v1/analytics/overview');
  });

  it('shows 400 detail when from is after to and does not show zeros', async () => {
    apiClient.mockResolvedValueOnce(successPayload);
    apiClient.mockRejectedValueOnce(
      new ProblemError('from must be on or before to', {
        status: 400,
        detail: 'from must be on or before to',
      }),
    );

    const user = userEvent.setup();
    render(<OverviewPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('overview-incubators')).toHaveTextContent('3');
    });

    await user.type(screen.getByLabelText('Desde'), '2026-02-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      expect(
        screen.getByText('from must be on or before to'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('overview-incubators')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overview-stages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('funnel-applied')).not.toBeInTheDocument();
  });
});
