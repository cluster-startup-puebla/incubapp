import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

type Row = { name: string };

const cols = [{ accessorKey: 'name' as const, header: 'Nombre' }];
const rows: Row[] = [{ name: 'Alpha' }, { name: 'Beta' }];

describe('DataTable', () => {
  it('lista vacía muestra el mensaje y no filas', () => {
    render(
      <DataTable
        data={[]}
        columns={[{ accessorKey: 'name', header: 'Nombre' }]}
      />,
    );
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /fila/ })).not.toBeInTheDocument();
  });

  it('mientras carga no muestra el vacío', () => {
    render(<DataTable data={[]} columns={cols} isLoading />);
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
  });

  it('en la última página el siguiente está deshabilitado', () => {
    render(
      <DataTable
        data={rows}
        columns={cols}
        page={2}
        totalPages={2}
        total={2}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeDisabled();
  });

  it('el cursor no imprime total', () => {
    render(
      <DataTable
        data={rows}
        columns={cols}
        pagination="cursor"
        nextCursor={null}
      />,
    );
    expect(screen.queryByText(/registro/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeDisabled();
  });
});
