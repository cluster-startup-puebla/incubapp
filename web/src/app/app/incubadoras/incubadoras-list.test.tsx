import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncubadorasList } from './incubadoras-list';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  ProblemError: class ProblemError extends Error {
    status: number;
    detail: string;
    constructor(message: string, status = 400) {
      super(message);
      this.name = 'ProblemError';
      this.status = status;
      this.detail = message;
    }
  },
}));

import { apiClient } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  apiClientMock.mockReset();
});

describe('IncubadorasList', () => {
  it('lista vacía no llama create y muestra vacío', async () => {
    apiClientMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0 },
    });

    render(<IncubadorasList />);

    await waitFor(() => {
      expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    });
    expect(apiClientMock).toHaveBeenCalledWith(
      '/api/v1/incubators?page=1&pageSize=10',
      expect.objectContaining({ incubatorId: null }),
    );
  });

  it('slug con mayúsculas no llama al API de create', async () => {
    const user = userEvent.setup();
    apiClientMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0 },
    });

    render(<IncubadorasList canCreate />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'UPAP');
    await user.type(within(dialog).getByLabelText('Slug'), 'UPAP');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/lowercase kebab-case/i),
      ).toBeInTheDocument();
    });

    expect(
      apiClientMock.mock.calls.filter(
        ([, init]) =>
          init &&
          typeof init === 'object' &&
          'method' in init &&
          init.method === 'POST',
      ),
    ).toHaveLength(0);
  });

  it('canCreate false oculta el sheet de alta', async () => {
    apiClientMock.mockResolvedValue({
      data: [{ id: '1', name: 'Alpha', slug: 'alpha', brandPrimary: null }],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    render(<IncubadorasList canCreate={false} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });
});
