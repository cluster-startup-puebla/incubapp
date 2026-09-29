import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/lib/api/client';
import { StartupDetail } from './startup-detail';

vi.mock('@/lib/api/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/client')>(
      '@/lib/api/client',
    );
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { apiClient } from '@/lib/api/client';

const mockedApi = vi.mocked(apiClient);

describe('StartupDetail', () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('404 ajeno muestra No encontrado', async () => {
    mockedApi.mockRejectedValue(new NotFoundError('Startup not found'));

    render(<StartupDetail startupId="foreign-id" />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(screen.queryByText('Startup not found')).not.toBeInTheDocument();
  });

  it('muestra la ficha cuando el GET responde', async () => {
    mockedApi.mockResolvedValue({
      id: 's1',
      name: 'Acme',
      domain: 'acme.com',
      visibility: 'INCUBATOR',
    });

    render(<StartupDetail startupId="s1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    });
    expect(screen.getByText('acme.com')).toBeInTheDocument();
  });
});
