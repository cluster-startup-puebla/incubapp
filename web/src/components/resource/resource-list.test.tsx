import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ResourceList } from './resource-list';

type Row = { id: string; name: string };

const columns = [{ accessorKey: 'name' as const, header: 'Nombre' }];

const pageResult = {
  data: [{ id: '1', name: 'Alpha' }] as Row[],
  meta: { page: 1, pageSize: 10, total: 1 },
};

afterEach(() => {
  cleanup();
});

describe('ResourceList', () => {
  it('hides the create button when create is undefined', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageResult);

    render(
      <ResourceList
        title="Instituciones"
        columns={columns}
        fetchPage={fetchPage}
        rowHref={(row) => `/app/instituciones/${row.id}`}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Crear' }),
    ).not.toBeInTheDocument();
  });

  it('shows create when create is defined', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageResult);

    render(
      <ResourceList
        title="Instituciones"
        columns={columns}
        fetchPage={fetchPage}
        rowHref={(row) => `/app/instituciones/${row.id}`}
        create={{
          title: 'Nueva',
          triggerLabel: 'Crear',
          schema: z.object({ name: z.string().min(1) }),
          fields: [{ name: 'name', label: 'Nombre' }],
          submitLabel: 'Guardar',
          onSubmit: async () => undefined,
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });

  it('404/error string does not show the table', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('No encontrado'));

    render(
      <ResourceList
        title="Instituciones"
        columns={columns}
        fetchPage={fetchPage}
        rowHref={(row) => `/app/instituciones/${row.id}`}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No encontrado')).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
  });
});
