'use client';

import * as React from 'react';
import { ResourceList } from '@/components/resource/resource-list';
import { type ColumnDef } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api/client';

export type UserRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

const columns: ColumnDef<UserRow>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'name', header: 'Nombre' },
  {
    accessorKey: 'emailVerified',
    header: 'Verificado',
    cell: (info) => (info.getValue() ? 'Sí' : 'No'),
  },
];

export function UsuariosList() {
  const fetchPage = React.useCallback(async ({ page }: { page: number }) => {
    return apiClient<{
      data: UserRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/users?page=${page}`);
  }, []);

  return (
    <ResourceList<UserRow>
      title="Usuarios"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={(row) => `/app/usuarios/${row.id}`}
    />
  );
}
