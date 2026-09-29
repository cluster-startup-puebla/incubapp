import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/lib/api/client';
import { AvisosPanel } from './avisos-panel';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

const OWN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const FOREIGN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const pageResult = {
  data: [
    {
      id: OWN_ID,
      title: 'Tu aviso',
      body: 'Hola',
      readAt: null,
      createdAt: '2026-09-29T10:00:00.000Z',
    },
    {
      id: FOREIGN_ID,
      title: 'Aviso ajeno en bandeja',
      body: null,
      readAt: null,
      createdAt: '2026-09-29T11:00:00.000Z',
    },
  ],
  meta: { page: 1, pageSize: 10, total: 2 },
};

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('AvisosPanel', () => {
  it('lists the current user notifications', async () => {
    apiClient.mockResolvedValue({
      data: [pageResult.data[0]],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    render(<AvisosPanel />);

    await waitFor(() => {
      expect(screen.getByText('Tu aviso')).toBeInTheDocument();
    });
    expect(screen.getByText('Nueva')).toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith('/api/v1/notifications?page=1');
  });

  it('marks a notification as read', async () => {
    apiClient.mockResolvedValueOnce({
      data: [pageResult.data[0]],
      meta: { page: 1, pageSize: 10, total: 1 },
    });
    apiClient.mockResolvedValueOnce({
      id: OWN_ID,
      title: 'Tu aviso',
      body: 'Hola',
      readAt: '2026-09-29T12:00:00.000Z',
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    const user = userEvent.setup();

    render(<AvisosPanel />);

    await waitFor(() => {
      expect(screen.getByText('Tu aviso')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Marcar leída' }));

    await waitFor(() => {
      expect(screen.getByText('Leída')).toBeInTheDocument();
    });
    expect(apiClient).toHaveBeenCalledWith(
      `/api/v1/notifications/${OWN_ID}/read`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Marcar leída' }),
    ).not.toBeInTheDocument();
  });

  it('shows No encontrado on foreign id 404 and keeps other rows', async () => {
    apiClient.mockResolvedValueOnce(pageResult);
    apiClient.mockImplementation((path: string) => {
      if (path === `/api/v1/notifications/${FOREIGN_ID}/read`) {
        return Promise.reject(new NotFoundError('Notification not found'));
      }
      return Promise.resolve(pageResult);
    });
    const user = userEvent.setup();

    render(<AvisosPanel />);

    await waitFor(() => {
      expect(screen.getByText('Tu aviso')).toBeInTheDocument();
    });
    expect(screen.getByText('Aviso ajeno en bandeja')).toBeInTheDocument();

    const markButtons = screen.getAllByRole('button', { name: 'Marcar leída' });
    await user.click(markButtons[1]!);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(screen.getByText('Tu aviso')).toBeInTheDocument();
    expect(screen.getByText('Aviso ajeno en bandeja')).toBeInTheDocument();
    expect(screen.getAllByText('Nueva')).toHaveLength(2);
  });
});
