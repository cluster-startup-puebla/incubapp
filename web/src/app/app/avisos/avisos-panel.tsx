'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { apiClient, NotFoundError } from '@/lib/api/client';

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function AvisosPanel() {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<NotificationRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const loadPage = React.useCallback(async (nextPage: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiClient<{
        data: NotificationRow[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/api/v1/notifications?page=${nextPage}`);
      setData(result.data);
      setPage(result.meta.page);
      setPageSize(result.meta.pageSize);
      setTotal(result.meta.total);
    } catch (err) {
      setError(errorMessage(err));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPage(page);
  }, [loadPage, page]);

  async function markRead(id: string) {
    setActionError(null);
    setPendingId(id);
    try {
      const updated = await apiClient<NotificationRow>(
        `/api/v1/notifications/${id}/read`,
        { method: 'POST' },
      );
      setData((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...updated } : row)),
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        setActionError('No encontrado');
      } else {
        setActionError(errorMessage(err));
      }
    } finally {
      setPendingId(null);
    }
  }

  const columns = React.useMemo((): ColumnDef<NotificationRow>[] => {
    return [
      { accessorKey: 'title', header: 'Título' },
      {
        accessorKey: 'readAt',
        header: 'Estado',
        cell: (info) => (info.getValue() ? 'Leída' : 'Nueva'),
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: (info) => {
          const row = info.row.original;
          if (row.readAt) {
            return null;
          }
          return (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendingId === row.id}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void markRead(row.id);
              }}
            >
              Marcar leída
            </Button>
          );
        },
      },
    ];
  }, [pendingId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          isLoading={isLoading}
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
