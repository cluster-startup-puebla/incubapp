'use client';

import * as React from 'react';
import { flexRender } from '@tanstack/react-table';
import {
  useLegacyTable,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';

export type ColumnDef<TData, TValue = unknown> = LegacyColumnDef<TData, TValue>;

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  isLoading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  total?: number;
  limit?: number;
  emptyMessage?: string;
  caption?: string;
  enablePagination?: boolean;
  enableRowSelection?: boolean;
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  renderMobileCard?: (row: TData) => React.ReactNode;
  tableKey?: string;
  pagination?: 'offset' | 'cursor';
  nextCursor?: string | null;
  onNextCursor?: (cursor: string) => void;
}

function SelectionCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (ref.current)
      ref.current.dataset.state = indeterminate
        ? 'indeterminate'
        : checked
          ? 'checked'
          : 'unchecked';
  }, [indeterminate, checked]);
  return (
    <Checkbox
      ref={ref}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

export function DataTable<TData extends Record<string, unknown>>({
  data,
  columns,
  isLoading,
  page = 1,
  totalPages = 1,
  onPageChange,
  total,
  limit: _limit,
  emptyMessage = 'Sin resultados',
  caption,
  enablePagination = true,
  enableRowSelection = false,
  onRowSelectionChange,
  renderMobileCard,
  tableKey,
  pagination = 'offset',
  nextCursor = null,
  onNextCursor,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const isCursor = pagination === 'cursor';

  const selectionColumn: ColumnDef<TData> = enableRowSelection
    ? {
        id: 'select',
        header: ({ table }) => (
          <SelectionCheckbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={
              table.getToggleAllPageRowsSelectedHandler() as (
                checked: boolean,
              ) => void
            }
            ariaLabel="Seleccionar todos"
          />
        ),
        cell: ({ row }) => (
          <SelectionCheckbox
            checked={row.getIsSelected()}
            indeterminate={false}
            onChange={
              row.getToggleSelectedHandler() as (checked: boolean) => void
            }
            ariaLabel="Seleccionar fila"
          />
        ),
        enableHiding: false,
        enableSorting: false,
      }
    : ({ id: '' } as ColumnDef<TData>);

  const table = useLegacyTable({
    data,
    columns: enableRowSelection ? [selectionColumn, ...columns] : columns,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: enableRowSelection ? getFacetedRowModel() : undefined,
    getFacetedUniqueValues: enableRowSelection
      ? getFacetedUniqueValues()
      : undefined,
    manualPagination: true,
    pageCount: totalPages,
    enableRowSelection,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const newSelection =
        typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(newSelection);
      if (onRowSelectionChange) {
        const selectedRows = table
          .getSelectedRowModel()
          .rows.map((r) => r.original);
        onRowSelectionChange(selectedRows);
      }
    },
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const skeletonColCount = enableRowSelection
    ? visibleColumns.length - 1
    : visibleColumns.length;

  return (
    <div className="space-y-4" key={tableKey}>
      {/* Mobile: cards */}
      {renderMobileCard && (
        <div className="space-y-3 sm:hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-4">
                {Array.from({ length: skeletonColCount }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            ))
          ) : data?.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            data?.map((row, i) => (
              <div key={i} className="rounded-lg border p-4">
                {renderMobileCard(row)}
              </div>
            ))
          )}
        </div>
      )}

      {/* Desktop: tabla */}
      <div className={renderMobileCard ? 'hidden sm:block' : ''}>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm" aria-label={caption}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="bg-muted/50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-4 py-3 text-left font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: skeletonColCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t transition-colors hover:bg-muted/30 data-[selected=true]:bg-muted/50"
                    data-selected={row.getIsSelected()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Selección count */}
        {enableRowSelection &&
          table.getFilteredSelectedRowModel().rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} de{' '}
              {table.getFilteredRowModel().rows.length} seleccionado
              {table.getFilteredSelectedRowModel().rows.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-auto p-0 text-xs underline"
                  onClick={() => table.resetRowSelection()}
                >
                  Limpiar selección
                </Button>
              )}
            </p>
          )}
      </div>

      {/* Paginación */}
      {enablePagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {!isCursor && (
            <span>
              {total} registro{total !== 1 ? 's' : ''} · página {page} de{' '}
              {totalPages || 1}
            </span>
          )}
          {isCursor && <span />}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange?.(page - 1)}
              disabled={isCursor || page <= 1 || isLoading}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => {
                if (isCursor) {
                  if (nextCursor) onNextCursor?.(nextCursor);
                  return;
                }
                onPageChange?.(page + 1);
              }}
              disabled={
                isCursor
                  ? nextCursor == null || isLoading
                  : page >= totalPages || isLoading
              }
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
