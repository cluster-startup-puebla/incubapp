import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameworkDetail } from './framework-detail';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

const draft = {
  id: 'fw-1',
  name: 'Incuba v1',
  status: 'DRAFT' as const,
  majorVersion: 1,
  version: 1,
  stages: [{ id: 'st-1', name: 'Ideación', sortOrder: 1 }],
};

const published = {
  ...draft,
  status: 'PUBLISHED' as const,
  version: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  apiClientMock.mockResolvedValue(draft);
});

describe('FrameworkDetail', () => {
  it('hides publish and clone when canPublish is false', async () => {
    render(<FrameworkDetail id="fw-1" canPublish={false} />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Incuba v1' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Publicar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clonar' }),
    ).not.toBeInTheDocument();
  });

  it('shows publish and clone outside the create sheet when canPublish', async () => {
    render(<FrameworkDetail id="fw-1" canPublish />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Incuba v1' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Publicar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clonar' })).toBeInTheDocument();
    expect(screen.getByText(/Ideación/)).toBeInTheDocument();
  });

  it('shows PATCH conflict detail when update rejects', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(published)
      .mockRejectedValueOnce(new Error('Cannot update a published framework'));

    render(<FrameworkDetail id="fw-1" canEdit canPublish />);

    await waitFor(() => {
      expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo nombre');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Cannot update a published framework'),
      ).toBeInTheDocument();
    });
  });

  it('shows conflict detail when publish rejects', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error('Cannot update a published framework'));

    render(<FrameworkDetail id="fw-1" canPublish />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Cannot update a published framework'),
      ).toBeInTheDocument();
    });
  });

  it('clones and navigates to the new draft', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(published)
      .mockResolvedValueOnce({ id: 'fw-2', status: 'DRAFT', majorVersion: 2 });

    render(<FrameworkDetail id="fw-1" canPublish />);

    await waitFor(() => {
      expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Clonar' }));

    await waitFor(() => {
      expect(apiClientMock).toHaveBeenCalledWith(
        '/api/v1/frameworks/fw-1/clone',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(push).toHaveBeenCalledWith('/app/frameworks/fw-2');
    });
  });
});
