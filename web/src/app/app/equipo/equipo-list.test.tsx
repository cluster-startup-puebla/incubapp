import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@/lib/api/client';
import { EquipoList } from './equipo-list';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

const SCOPE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const pageResult = {
  data: [
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      userId: 'user-1',
      role: 'staff',
      scopeType: 'incubator',
      scopeId: SCOPE,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 1 },
};

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('EquipoList', () => {
  it('hides the invite trigger when canInvite is false', async () => {
    apiClient.mockResolvedValue(pageResult);

    render(
      <EquipoList
        canInvite={false}
        canAssignClusterAdmin={false}
        scopeType="incubator"
        scopeId={SCOPE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('staff')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Invitar' }),
    ).not.toBeInTheDocument();
  });

  it('omits cluster_admin from role options when canAssignClusterAdmin is false', async () => {
    apiClient.mockResolvedValue(pageResult);
    const user = userEvent.setup();

    render(
      <EquipoList
        canInvite
        canAssignClusterAdmin={false}
        scopeType="incubator"
        scopeId={SCOPE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('staff')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    const roleSelect = screen.getByLabelText('Rol');
    const options = within(roleSelect).getAllByRole('option');
    const values = options.map((option) => (option as HTMLOptionElement).value);

    expect(values).not.toContain('cluster_admin');
    expect(values).toEqual(
      expect.arrayContaining(['staff', 'mentor', 'founder', 'judge']),
    );
  });

  it('includes cluster_admin when canAssignClusterAdmin is true', async () => {
    apiClient.mockResolvedValue(pageResult);
    const user = userEvent.setup();

    render(
      <EquipoList
        canInvite
        canAssignClusterAdmin
        scopeType="incubator"
        scopeId={SCOPE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('staff')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    const roleSelect = screen.getByLabelText('Rol');
    expect(
      within(roleSelect).getByRole('option', { name: 'cluster_admin' }),
    ).toBeInTheDocument();
  });

  it('shows 403 detail from the invite API and keeps the sheet open', async () => {
    apiClient.mockResolvedValueOnce(pageResult);
    apiClient.mockRejectedValueOnce(
      new ProblemError('Directors cannot assign cluster_admin', {
        status: 403,
        detail: 'Directors cannot assign cluster_admin',
      }),
    );
    const user = userEvent.setup();

    render(
      <EquipoList
        canInvite
        canAssignClusterAdmin
        scopeType="incubator"
        scopeId={SCOPE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('staff')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.selectOptions(screen.getByLabelText('Rol'), 'cluster_admin');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Directors cannot assign cluster_admin'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith(
      '/api/v1/memberships/invite',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'a@example.com',
          role: 'cluster_admin',
          scopeType: 'incubator',
          scopeId: SCOPE,
        }),
      }),
    );
  });
});
