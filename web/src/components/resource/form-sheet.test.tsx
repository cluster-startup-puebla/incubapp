import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FormSheet } from './form-sheet';

const schema = z.object({
  name: z.string().min(1),
});

const fields = [{ name: 'name' as const, label: 'Nombre' }];

afterEach(() => {
  cleanup();
});

describe('FormSheet', () => {
  it('valid submit calls onSubmit with the object and the sheet closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <FormSheet
        title="Nueva"
        triggerLabel="Abrir"
        schema={schema}
        fields={fields}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.type(screen.getByLabelText('Nombre'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Acme' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('empty field with min(1) does not call onSubmit and shows a field error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <FormSheet
        title="Nueva"
        triggerLabel="Abrir"
        schema={schema}
        fields={fields}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Too small: expected string to have >=1 characters/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('onSubmit rejecting keeps the sheet open and shows conflict', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('conflict'));

    render(
      <FormSheet
        title="Nueva"
        triggerLabel="Abrir"
        schema={schema}
        fields={fields}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.type(screen.getByLabelText('Nombre'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByText('conflict')).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('double click calls onSubmit once', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <FormSheet
        title="Nueva"
        triggerLabel="Abrir"
        schema={schema}
        fields={fields}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.type(screen.getByLabelText('Nombre'), 'Acme');
    const submit = screen.getByRole('button', { name: 'Guardar' });
    await user.click(submit);
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('destructive renders a destructive button', async () => {
    const user = userEvent.setup();

    render(
      <FormSheet
        title="Eliminar"
        triggerLabel="Abrir"
        schema={schema}
        fields={fields}
        submitLabel="Eliminar"
        onSubmit={async () => undefined}
        destructive
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
  });
});
