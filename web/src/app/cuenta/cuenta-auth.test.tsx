import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecuperarView } from '../recuperar/page';
import { VerifyEmailView } from '../verificar-correo/page';

const verifyEmail = vi.fn();
const resetPassword = vi.fn();
const requestPasswordReset = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    verifyEmail: (...args: unknown[]) => verifyEmail(...args),
    resetPassword: (...args: unknown[]) => resetPassword(...args),
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  },
}));

describe('cuenta auth pages', () => {
  beforeEach(() => {
    verifyEmail.mockReset();
    resetPassword.mockReset();
    requestPasswordReset.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it('verificar: empty token does not call the API', async () => {
    render(<VerifyEmailView token="" />);

    expect(
      screen.getByText('Falta el token de verificación.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(verifyEmail).not.toHaveBeenCalled();
    });
  });

  it('recuperar: short password does not submit', async () => {
    const user = userEvent.setup();
    resetPassword.mockResolvedValue({ error: null });

    render(<RecuperarView token="reset-token" />);

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(
      screen.getByRole('button', { name: 'Guardar contraseña' }),
    );

    expect(resetPassword).not.toHaveBeenCalled();
    expect(
      screen.getByText('La contraseña debe tener al menos 10 caracteres'),
    ).toBeInTheDocument();
  });
});
