import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameworksList } from './frameworks-list';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

const pageResult = {
  data: [
    {
      id: 'fw-1',
      name: 'Incuba v1',
      status: 'DRAFT' as const,
      majorVersion: 1,
    },
    {
      id: 'fw-2',
      name: 'Incuba pub',
      status: 'PUBLISHED' as const,
      majorVersion: 1,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 2 },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  apiClientMock.mockResolvedValue(pageResult);
});

describe('FrameworksList', () => {
  it('lists status DRAFT and PUBLISHED', async () => {
    render(<FrameworksList />);

    await waitFor(() => {
      expect(screen.getByText('Incuba v1')).toBeInTheDocument();
    });
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
  });

  it('hides draft sheet when canCreate is false', async () => {
    render(<FrameworksList canCreate={false} />);

    await waitFor(() => {
      expect(screen.getByText('Incuba v1')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('shows draft sheet when canCreate is true', async () => {
    render(<FrameworksList canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Incuba v1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });

  it('creates a draft via the sheet', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(pageResult)
      .mockResolvedValueOnce({ id: 'fw-3', status: 'DRAFT' })
      .mockResolvedValueOnce(pageResult);

    render(<FrameworksList canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Incuba v1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo marco');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(apiClientMock).toHaveBeenCalledWith(
        '/api/v1/frameworks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Nuevo marco' }),
        }),
      );
    });
  });
});
