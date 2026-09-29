'use client';

import * as React from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { apiClient, ProblemError } from '@/lib/api/client';

export const ALL_INVITE_ROLES = [
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
  'mentor',
  'founder',
  'judge',
] as const;

export const DIRECTOR_INVITE_ROLES = [
  'staff',
  'mentor',
  'founder',
  'judge',
] as const;

export type InviteSheetProps = {
  canAssignClusterAdmin: boolean;
  scopeType: 'incubator' | 'cluster';
  scopeId: string;
  onSuccess?: () => void;
};

export function InviteSheet({
  canAssignClusterAdmin,
  scopeType,
  scopeId,
  onSuccess,
}: InviteSheetProps) {
  const roleOptions = canAssignClusterAdmin
    ? ALL_INVITE_ROLES
    : DIRECTOR_INVITE_ROLES;

  const schema = z.object({
    email: z.string().trim().email(),
    role: z.enum(roleOptions),
  });

  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<string>(roleOptions[0] ?? 'staff');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (pendingRef.current && !next) {
      return;
    }
    if (next) {
      setEmail('');
      setRole(roleOptions[0] ?? 'staff');
      setFieldErrors({});
      setFormError(null);
    }
    setOpen(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pendingRef.current) {
      return;
    }

    const result = schema.safeParse({ email, role });
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    pendingRef.current = true;
    setPending(true);
    try {
      await apiClient('/api/v1/memberships/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: result.data.email,
          role: result.data.role,
          scopeType,
          scopeId,
        }),
      });
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      if (error instanceof ProblemError) {
        setFormError(error.detail);
      } else {
        setFormError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button">Invitar</Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        onEscapeKeyDown={(event) => {
          if (pendingRef.current) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (pendingRef.current) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (pendingRef.current) {
            event.preventDefault();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>Invitar al equipo</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="text"
              value={email}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? (
              <p className="text-sm text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              name="role"
              value={role}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.role)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              onChange={(event) => setRole(event.target.value)}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.role ? (
              <p className="text-sm text-destructive" role="alert">
                {fieldErrors.role}
              </p>
            ) : null}
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              Enviar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
