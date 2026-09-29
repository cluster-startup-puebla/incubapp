import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/lib/api/client';
import { MyStartupPage } from './mi-startup-page';

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

describe('MyStartupPage', () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('muestra solo la ficha de una startup, no una lista', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (String(path).includes('?')) {
        return {
          data: [
            {
              id: 's1',
              name: 'Mine',
              domain: 'mine.com',
              visibility: 'PRIVATE',
            },
          ],
          meta: { page: 1, pageSize: 1, total: 1 },
        };
      }
      return {
        id: 's1',
        name: 'Mine',
        domain: 'mine.com',
        visibility: 'PRIVATE',
      };
    });

    render(<MyStartupPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mine' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('404 muestra No encontrado', async () => {
    mockedApi.mockRejectedValue(new NotFoundError('Startup not found'));

    render(<MyStartupPage />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
  });
});
