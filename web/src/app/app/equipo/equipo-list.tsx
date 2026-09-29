'use client';

import * as React from 'react';
import { ResourceList } from '@/components/resource/resource-list';
import { type ColumnDef } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api/client';
import { InviteSheet } from './invite-sheet';

export type MembershipRow = {
  id: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string;
};

const columns: ColumnDef<MembershipRow>[] = [
  { accessorKey: 'role', header: 'Rol' },
  { accessorKey: 'userId', header: 'Usuario' },
  { accessorKey: 'scopeType', header: 'Alcance' },
];

export type EquipoListProps = {
  canInvite?: boolean;
  canAssignClusterAdmin?: boolean;
  scopeType: 'incubator' | 'cluster';
  scopeId: string;
};

export function EquipoList({
  canInvite = false,
  canAssignClusterAdmin = false,
  scopeType,
  scopeId,
}: EquipoListProps) {
  const [reloadToken, setReloadToken] = React.useState(0);

  const fetchPage = React.useCallback(
    async ({ page }: { page: number }) => {
      void reloadToken;
      return apiClient<{
        data: MembershipRow[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/api/v1/memberships?page=${page}`);
    },
    [reloadToken],
  );

  return (
    <div className="relative">
      {canInvite ? (
        <div className="absolute top-0 right-0 z-10">
          <InviteSheet
            canAssignClusterAdmin={canAssignClusterAdmin}
            scopeType={scopeType}
            scopeId={scopeId}
            onSuccess={() => setReloadToken((token) => token + 1)}
          />
        </div>
      ) : null}
      <ResourceList<MembershipRow>
        title="Equipo"
        columns={columns}
        fetchPage={fetchPage}
        rowHref={(row) => `/app/usuarios/${row.userId}`}
      />
    </div>
  );
}
