import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemError, ValidationError } from '@/lib/api/client';
import { IncubacionesList } from './incubaciones-list';

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

describe('IncubacionesList', () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('canEdit false oculta el sheet', async () => {
    mockedApi.mockResolvedValue({
      data: [
        {
          id: 'i1',
          status: 'active',
          startedOn: '2026-01-01',
          endedOn: null,
          exitReason: null,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    render(<IncubacionesList canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('endedOn antes de startedOn muestra el 400', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'POST') {
        throw new ProblemError('endedOn must be on or after startedOn', {
          status: 400,
          detail: 'endedOn must be on or after startedOn',
        });
      }
      return {
        data: [],
        meta: { page: 1, pageSize: 10, total: 0 },
      };
    });

    render(<IncubacionesList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Estado'), 'active');
    await user.type(screen.getByLabelText('Inicio'), '2026-02-01');
    await user.type(screen.getByLabelText('Fin'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('endedOn must be on or after startedOn'),
      ).toBeInTheDocument();
    });
  });

  it('dropped sin exitReason muestra el 422', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'POST') {
        throw new ValidationError(
          'exitReason is required when status is dropped',
        );
      }
      return {
        data: [],
        meta: { page: 1, pageSize: 10, total: 0 },
      };
    });

    render(<IncubacionesList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Estado'), 'dropped');
    await user.type(screen.getByLabelText('Inicio'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('exitReason is required when status is dropped'),
      ).toBeInTheDocument();
    });
  });

  it('segunda active muestra el 409', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'POST') {
        throw new ProblemError('Incubation is already active', {
          status: 409,
          detail: 'Incubation is already active',
        });
      }
      return {
        data: [],
        meta: { page: 1, pageSize: 10, total: 0 },
      };
    });

    render(<IncubacionesList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Estado'), 'active');
    await user.type(screen.getByLabelText('Inicio'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Incubation is already active'),
      ).toBeInTheDocument();
    });
  });
});
