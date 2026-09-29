import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsuariosList } from './usuarios-list';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

const pageResult = {
  data: [
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      email: 'ana@example.com',
      name: 'Ana',
      emailVerified: true,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 1 },
};

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('UsuariosList', () => {
  it('lists users without a create trigger', async () => {
    apiClient.mockResolvedValue(pageResult);

    render(<UsuariosList />);

    await waitFor(() => {
      expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Invitar' }),
    ).not.toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith('/api/v1/users?page=1');
  });

  it('shows empty list message when there are no users', async () => {
    apiClient.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0 },
    });

    render(<UsuariosList />);

    await waitFor(() => {
      expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    });
  });

  it('shows list error without the table', async () => {
    apiClient.mockRejectedValue(new Error('No encontrado'));

    render(<UsuariosList />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
