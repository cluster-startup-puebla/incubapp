import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortalNav } from './portal-nav';

describe('PortalNav', () => {
  it('cluster_admin no ve mi-startup', () => {
    render(<PortalNav role="cluster_admin" />);
    expect(screen.queryByText(/mi-startup/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'startup' }),
    ).not.toBeInTheDocument();
  });

  it('founder no ve incubadoras', () => {
    render(<PortalNav role="founder" />);
    expect(
      screen.queryByRole('link', { name: 'incubadoras' }),
    ).not.toBeInTheDocument();
  });

  it('mentor ve avisos y el mensaje de sin portal', () => {
    render(<PortalNav role="mentor" />);
    expect(screen.getByRole('link', { name: 'avisos' })).toBeInTheDocument();
    expect(
      screen.getByText('Tu rol no tiene portal en este corte'),
    ).toBeInTheDocument();
  });

  it('director ve equipo', () => {
    render(<PortalNav role="director" />);
    expect(screen.getByRole('link', { name: 'equipo' })).toBeInTheDocument();
  });
});
