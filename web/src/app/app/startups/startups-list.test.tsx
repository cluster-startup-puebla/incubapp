import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@/lib/api/client';
import { StartupsList } from './startups-list';

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

describe('StartupsList', () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('lista vacía muestra Sin resultados', async () => {
    mockedApi.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0 },
    });

    render(<StartupsList />);

    await waitFor(() => {
      expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    });
  });

  it('canCreate false oculta el sheet', async () => {
    mockedApi.mockResolvedValue({
      data: [
        {
          id: 's1',
          name: 'Acme',
          domain: 'acme.com',
          visibility: 'INCUBATOR',
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    render(<StartupsList canCreate={false} />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('409 de dominio muestra detail y candidates', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (path, init) => {
      if (!init?.method || init.method === 'GET') {
        return {
          data: [],
          meta: { page: 1, pageSize: 10, total: 0 },
        };
      }
      throw new ProblemError('Similar startups exist for this domain', {
        status: 409,
        detail: 'Similar startups exist for this domain',
        candidates: [{ id: 's1', domain: 'acme.com' }],
      });
    });

    render(<StartupsList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nombre'), 'Acme');
    await user.type(screen.getByLabelText('Dominio'), 'acme.com');
    await user.type(screen.getByLabelText('Visibilidad'), 'INCUBATOR');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Similar startups exist for this domain/),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/acme\.com/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
