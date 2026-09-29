import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstitutionDetail } from './institution-detail';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

const institution = {
  id: 'inst-1',
  name: 'Tec',
  countryCode: 'MX',
  website: 'https://tec.mx',
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  apiClientMock.mockResolvedValue(institution);
});

describe('InstitutionDetail', () => {
  it('renders fields from the API', async () => {
    render(<InstitutionDetail id="inst-1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tec' })).toBeInTheDocument();
    });
    expect(screen.getByText('MX')).toBeInTheDocument();
    expect(screen.getByText('https://tec.mx')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Eliminar' }),
    ).not.toBeInTheDocument();
  });

  it('hides edit when canEdit is false', async () => {
    render(<InstitutionDetail id="inst-1" canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tec' })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });

  it('shows 404 detail and hides tabs', async () => {
    apiClientMock.mockRejectedValueOnce(new Error('No encontrado'));

    render(<InstitutionDetail id="missing" />);

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Info' })).not.toBeInTheDocument();
  });

  it('shows delete 409 conflict message inside the sheet', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(institution)
      .mockRejectedValueOnce(
        new Error('Institution has active incubators and cannot be deleted'),
      );

    render(<InstitutionDetail id="inst-1" canDelete />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tec' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const deleteButtons = screen.getAllByRole('button', { name: 'Eliminar' });
    await user.click(deleteButtons[deleteButtons.length - 1]!);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Institution has active incubators and cannot be deleted',
        ),
      ).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });
});
