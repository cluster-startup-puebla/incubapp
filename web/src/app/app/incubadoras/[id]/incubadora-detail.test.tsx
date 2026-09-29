import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncubadoraDetail } from './incubadora-detail';

vi.mock('@/lib/api/client', () => {
  class ProblemError extends Error {
    status: number;
    detail: string;
    constructor(message: string, status = 400) {
      super(message);
      this.name = 'ProblemError';
      this.status = status;
      this.detail = message;
    }
  }
  return {
    apiClient: vi.fn(),
    ProblemError,
  };
});

vi.mock('@/theme/tenant-theme', () => ({
  TenantTheme: ({
    slug,
    children,
  }: {
    slug: string | null;
    children: unknown;
  }) => (
    <div data-testid="tenant-theme" data-slug={slug ?? ''}>
      {children as never}
    </div>
  ),
}));

import { apiClient, ProblemError } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

const detail = {
  id: 'inc-1',
  name: 'UPAP',
  slug: 'upap',
  brandPrimary: '#C8102E',
  logoUrl: 'https://cdn.example/logo.png',
  version: 3,
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  apiClientMock.mockReset();
});

describe('IncubadoraDetail', () => {
  it('muestra name, slug, brandPrimary y logo desde GET', async () => {
    apiClientMock.mockResolvedValue(detail);

    render(<IncubadoraDetail id="inc-1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'UPAP' })).toBeInTheDocument();
    });
    expect(screen.getByText('upap')).toBeInTheDocument();
    expect(screen.getByText('#C8102E')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example/logo.png',
    );
    expect(screen.getByTestId('tenant-theme')).toHaveAttribute(
      'data-slug',
      'upap',
    );
    expect(apiClientMock).toHaveBeenCalledWith(
      '/api/v1/incubators/inc-1',
      expect.objectContaining({ incubatorId: null }),
    );
  });

  it('canEdit false oculta el sheet', async () => {
    apiClientMock.mockResolvedValue(detail);

    render(<IncubadoraDetail id="inc-1" canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'UPAP' })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Logo')).not.toBeInTheDocument();
  });

  it('sin version no llama al API y muestra Recarga la ficha', async () => {
    const user = userEvent.setup();
    apiClientMock.mockResolvedValue({
      ...detail,
      version: undefined,
    });

    render(<IncubadoraDetail id="inc-1" canEdit />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Editar' }),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText('Recarga la ficha').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getAllByText('Recarga la ficha').length).toBeGreaterThan(0);
    });

    expect(
      apiClientMock.mock.calls.filter(
        ([, init]) =>
          init &&
          typeof init === 'object' &&
          'method' in init &&
          (init.method === 'PATCH' || init.method === 'POST'),
      ),
    ).toHaveLength(0);
  });

  it('edit manda If-Match con version', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({ ...detail, version: 4 })
      .mockResolvedValueOnce({ ...detail, version: 4 });

    render(<IncubadoraDetail id="inc-1" canEdit />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Editar' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const nameInput = screen.getByLabelText('Nombre');
    await user.clear(nameInput);
    await user.type(nameInput, 'UPAP Red');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(apiClientMock).toHaveBeenCalledWith(
        '/api/v1/incubators/inc-1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'If-Match': '3',
          }),
        }),
      );
    });
  });

  it('logo no imagen muestra el detail del 400', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(
        new ProblemError('Logo must be png, jpeg, or webp', 400),
      );

    render(<IncubadoraDetail id="inc-1" canEdit />);

    await waitFor(() => {
      expect(screen.getByLabelText('Logo')).toBeInTheDocument();
    });

    const file = new File(['fake'], 'notes.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Logo'), file);

    await waitFor(() => {
      expect(
        screen.getByText('Logo must be png, jpeg, or webp'),
      ).toBeInTheDocument();
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      '/api/v1/incubators/inc-1/logo',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'If-Match': '3',
        }),
      }),
    );
  });

  it('404 muestra el error y no el sheet', async () => {
    apiClientMock.mockRejectedValue(new Error('No encontrado'));

    render(<IncubadoraDetail id="missing" canEdit />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });
});
