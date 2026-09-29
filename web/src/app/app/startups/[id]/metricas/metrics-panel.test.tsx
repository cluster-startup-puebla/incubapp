import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@/lib/api/client';
import { MetricsPanel } from './metrics-panel';

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

describe('MetricsPanel', () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('cursor no imprime total', async () => {
    mockedApi.mockResolvedValue({
      data: [
        {
          id: 'm1',
          metricDefId: 'def-1',
          period: '2026-01-01',
          value: 10,
          verifiedAt: null,
        },
      ],
      meta: { pageSize: 20, nextCursor: null },
    });

    render(<MetricsPanel startupId="s1" canVerify />);

    await waitFor(() => {
      expect(screen.getByText('def-1')).toBeInTheDocument();
    });
    expect(screen.queryByText(/registro/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeDisabled();
  });

  it('canVerify false oculta Verificar', async () => {
    mockedApi.mockResolvedValue({
      data: [
        {
          id: 'm1',
          metricDefId: 'def-1',
          period: '2026-01-01',
          value: 10,
          verifiedAt: null,
        },
      ],
      meta: { pageSize: 20, nextCursor: null },
    });

    render(<MetricsPanel startupId="s1" canVerify={false} />);

    await waitFor(() => {
      expect(screen.getByText('def-1')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Verificar' }),
    ).not.toBeInTheDocument();
  });

  it('periodo futuro muestra el 400 detail', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'PUT') {
        throw new ProblemError('period cannot be after today', {
          status: 400,
          detail: 'period cannot be after today',
        });
      }
      return {
        data: [],
        meta: { pageSize: 20, nextCursor: null },
      };
    });

    render(<MetricsPanel startupId="s1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Cargar' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cargar' }));
    await user.type(
      screen.getByLabelText('Métrica'),
      '11111111-1111-1111-1111-111111111111',
    );
    await user.type(screen.getByLabelText('Periodo'), '2099-01-01');
    await user.type(screen.getByLabelText('Valor'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('period cannot be after today'),
      ).toBeInTheDocument();
    });
  });

  it('valor negativo muestra el 400 detail', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'PUT') {
        throw new ProblemError(
          'negative values are not allowed for this metric',
          {
            status: 400,
            detail: 'negative values are not allowed for this metric',
          },
        );
      }
      return {
        data: [],
        meta: { pageSize: 20, nextCursor: null },
      };
    });

    render(<MetricsPanel startupId="s1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Cargar' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cargar' }));
    await user.type(
      screen.getByLabelText('Métrica'),
      '11111111-1111-1111-1111-111111111111',
    );
    await user.type(screen.getByLabelText('Periodo'), '2026-01-01');
    await user.type(screen.getByLabelText('Valor'), '-3');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('negative values are not allowed for this metric'),
      ).toBeInTheDocument();
    });
  });

  it('cada submit usa un Idempotency-Key distinto', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    mockedApi.mockImplementation(async (_path, init) => {
      if (init?.method === 'PUT') {
        const headers = new Headers(init.headers);
        keys.push(headers.get('Idempotency-Key') ?? '');
        return { id: 'm-new' };
      }
      return {
        data: [],
        meta: { pageSize: 20, nextCursor: null },
      };
    });

    render(<MetricsPanel startupId="s1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Cargar' }),
      ).toBeInTheDocument();
    });

    for (const value of ['1', '2']) {
      await user.click(screen.getByRole('button', { name: 'Cargar' }));
      await user.type(
        screen.getByLabelText('Métrica'),
        '11111111-1111-1111-1111-111111111111',
      );
      await user.type(screen.getByLabelText('Periodo'), '2026-01-01');
      await user.type(screen.getByLabelText('Valor'), value);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    }

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
  });
});
