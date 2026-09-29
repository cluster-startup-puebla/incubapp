import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstitutionsList } from './institutions-list';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';

const apiClientMock = vi.mocked(apiClient);

const pageResult = {
  data: [
    {
      id: 'inst-1',
      name: 'Tec',
      countryCode: 'MX',
      website: 'https://tec.mx',
    },
  ],
  meta: { page: 1, pageSize: 10, total: 1 },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  apiClientMock.mockResolvedValue(pageResult);
});

describe('InstitutionsList', () => {
  it('hides create when canCreate is false', async () => {
    render(<InstitutionsList canCreate={false} />);

    await waitFor(() => {
      expect(screen.getByText('Tec')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('shows create when canCreate is true', async () => {
    render(<InstitutionsList canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Tec')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });

  it('lists name, countryCode and website', async () => {
    render(<InstitutionsList />);

    await waitFor(() => {
      expect(screen.getByText('Tec')).toBeInTheDocument();
    });
    expect(screen.getByText('MX')).toBeInTheDocument();
    expect(screen.getByText('https://tec.mx')).toBeInTheDocument();
  });

  it('does not call the API when countryCode is one letter', async () => {
    const user = userEvent.setup();
    render(<InstitutionsList canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Tec')).toBeInTheDocument();
    });

    apiClientMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nombre'), 'UPAEP');
    await user.type(screen.getByLabelText('País'), 'M');
    await user.type(screen.getByLabelText('Sitio'), 'https://upaep.mx');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('countryCode must be 2 letters'),
      ).toBeInTheDocument();
    });
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  it('creates with a valid countryCode', async () => {
    const user = userEvent.setup();
    apiClientMock
      .mockResolvedValueOnce(pageResult)
      .mockResolvedValueOnce({ id: 'inst-2' })
      .mockResolvedValueOnce(pageResult);

    render(<InstitutionsList canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Tec')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nombre'), 'UPAEP');
    await user.type(screen.getByLabelText('País'), 'MX');
    await user.type(screen.getByLabelText('Sitio'), 'https://upaep.mx');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(apiClientMock).toHaveBeenCalledWith(
        '/api/v1/institutions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'UPAEP',
            countryCode: 'MX',
            website: 'https://upaep.mx',
          }),
        }),
      );
    });
  });

  it('shows fetch rejection message like ResourceList', async () => {
    apiClientMock.mockRejectedValueOnce(
      new Error('Institution has active incubators and cannot be deleted'),
    );

    render(<InstitutionsList />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Institution has active incubators and cannot be deleted',
        ),
      ).toBeInTheDocument();
    });
  });
});
