import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@/lib/api/client';
import { GeoList } from './geo-list';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

const countryId = '11111111-1111-1111-1111-111111111111';

const pageResult = {
  data: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Puebla',
      code: 'PUE',
      level: 'STATE',
      parentId: countryId,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 1 },
};

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('GeoList', () => {
  it('hides the create trigger when canCreate is false', async () => {
    apiClient.mockResolvedValue(pageResult);

    render(<GeoList parentId={countryId} canCreate={false} />);

    await waitFor(() => {
      expect(screen.getByText('Puebla')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('defaults canCreate to false and hides the trigger', async () => {
    apiClient.mockResolvedValue(pageResult);

    render(<GeoList parentId={countryId} />);

    await waitFor(() => {
      expect(screen.getByText('Puebla')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces 422 ProblemError detail when municipality parent is a country', async () => {
    apiClient.mockResolvedValueOnce(pageResult);
    apiClient.mockRejectedValueOnce(
      new ProblemError('MUNICIPALITY parent must be a STATE', {
        status: 422,
        detail: 'MUNICIPALITY parent must be a STATE',
      }),
    );

    const user = userEvent.setup();
    render(<GeoList parentId={countryId} canCreate />);

    await waitFor(() => {
      expect(screen.getByText('Puebla')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await user.type(screen.getByLabelText('Nivel'), 'MUNICIPALITY');
    await user.type(screen.getByLabelText('Código'), 'MUN-01');
    await user.type(screen.getByLabelText('Nombre'), 'Cholula');
    // parentId defaults to countryId via defaultValues
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        screen.getByText('MUNICIPALITY parent must be a STATE'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith(
      '/api/v1/geo-units',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          level: 'MUNICIPALITY',
          code: 'MUN-01',
          name: 'Cholula',
          parentId: countryId,
        }),
      }),
    );
  });
});
