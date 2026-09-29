import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/lib/api/client';
import { UsuarioDetail } from './usuario-detail';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('UsuarioDetail', () => {
  it('renders read-only user fields', async () => {
    apiClient.mockResolvedValue({
      id: userId,
      email: 'ana@example.com',
      name: 'Ana',
      emailVerified: true,
      image: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    render(<UsuarioDetail userId={userId} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    });
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith(`/api/v1/users/${userId}`);
  });

  it('shows No encontrado on 404', async () => {
    apiClient.mockRejectedValue(new NotFoundError('User not found'));

    render(<UsuarioDetail userId={userId} />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
  });
});
