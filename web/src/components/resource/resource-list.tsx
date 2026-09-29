'use client';

import * as React from 'react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { FormSheet, type FormSheetProps } from './form-sheet';

export type FetchPageResult<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
};

export type ResourceListProps<
  T extends Record<string, unknown>,
  TCreate = unknown,
> = {
  title: string;
  columns: ColumnDef<T>[];
  fetchPage: (args: { page: number }) => Promise<FetchPageResult<T>>;
  create?: FormSheetProps<TCreate>;
  rowHref: (row: T) => string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function ResourceList<
  T extends Record<string, unknown>,
  TCreate = unknown,
>({
  title,
  columns,
  fetchPage,
  create,
  rowHref,
}: ResourceListProps<T, TCreate>) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<T[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadPage = React.useCallback(
    async (nextPage: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchPage({ page: nextPage });
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
    },
    [fetchPage],
  );

  React.useEffect(() => {
    void loadPage(page);
  }, [loadPage, page]);

  const linkedColumns = React.useMemo((): ColumnDef<T>[] => {
    return columns.map((column) => {
      const originalCell = column.cell;
      return {
        ...column,
        cell: (info) => {
          const content =
            typeof originalCell === 'function'
              ? originalCell(info)
              : (info.getValue() as React.ReactNode);
          return (
            <a href={rowHref(info.row.original)} className="block">
              {content}
            </a>
          );
        },
      };
    });
  }, [columns, rowHref]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  async function handleCreate(value: TCreate) {
    if (!create) {
      return;
    }
    await create.onSubmit(value);
    if (page === 1) {
      await loadPage(1);
    } else {
      setPage(1);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {create ? <FormSheet {...create} onSubmit={handleCreate} /> : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <DataTable
          data={data}
          columns={linkedColumns}
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
