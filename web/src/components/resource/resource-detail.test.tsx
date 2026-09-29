import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceDetail } from './resource-detail';

afterEach(() => {
  cleanup();
});

describe('ResourceDetail', () => {
  it('omits fields with a null value', () => {
    render(
      <ResourceDetail
        title="Incubadora"
        fields={[
          { label: 'Nombre', value: 'UPAP' },
          { label: 'Slug', value: null },
          { label: 'País', value: 'MX' },
        ]}
        tabs={[{ value: 'info', name: 'Info', content: <p>Detalle</p> }]}
      />,
    );

    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('UPAP')).toBeInTheDocument();
    expect(screen.getByText('País')).toBeInTheDocument();
    expect(screen.queryByText('Slug')).not.toBeInTheDocument();
  });

  it('hides tabs when error is set', () => {
    render(
      <ResourceDetail
        title="Incubadora"
        fields={[{ label: 'Nombre', value: 'UPAP' }]}
        tabs={[
          { value: 'info', name: 'Info', content: <p>Detalle</p> },
          { value: 'equipo', name: 'Equipo', content: <p>Miembros</p> },
        ]}
        error="No encontrado"
      />,
    );

    expect(screen.getByText('No encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Info' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Equipo' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Detalle')).not.toBeInTheDocument();
  });
});
