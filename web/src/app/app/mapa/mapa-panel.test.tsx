import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapaPanel } from './mapa-panel';

const apiClient = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => apiClient(...args),
  };
});

afterEach(() => {
  cleanup();
  apiClient.mockReset();
});

describe('MapaPanel', () => {
  it('renders feature names from a raw FeatureCollection', async () => {
    apiClient.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: '1', name: 'UPAP', slug: 'upap' },
        },
        {
          type: 'Feature',
          properties: { id: '2', name: 'BUAP', slug: 'buap' },
        },
      ],
    });

    render(<MapaPanel />);

    await waitFor(() => {
      expect(screen.getByText('UPAP')).toBeInTheDocument();
    });
    expect(screen.getByText('BUAP')).toBeInTheDocument();
    expect(apiClient).toHaveBeenCalledWith('/api/v1/analytics/map');
    expect(screen.queryByText(/Mapa vacío/)).not.toBeInTheDocument();
  });

  it('shows empty map message when there are zero features', async () => {
    apiClient.mockResolvedValue({
      type: 'FeatureCollection',
      features: [],
    });

    render(<MapaPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(/Mapa vacío: no hay incubadoras con coordenadas/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
