'use client';

import * as React from 'react';
import { type ZodType } from 'zod';
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

export type FormSheetProps<T> = {
  title: string;
  triggerLabel: string;
  schema: ZodType<T>;
  fields: { name: keyof T & string; label: string; type?: 'text' | 'number' }[];
  submitLabel: string;
  onSubmit: (value: T) => Promise<void>;
  defaultValues?: Partial<T>;
  destructive?: boolean;
};

function buildInitialValues<T>(
  fields: FormSheetProps<T>['fields'],
  defaultValues?: Partial<T>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = defaultValues?.[field.name];
    values[field.name] = value == null ? '' : String(value);
  }
  return values;
}

export function FormSheet<T>({
  title,
  triggerLabel,
  schema,
  fields,
  submitLabel,
  onSubmit,
  defaultValues,
  destructive = false,
}: FormSheetProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const [values, setValues] = React.useState(() =>
    buildInitialValues(fields, defaultValues),
  );
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  const buttonVariant = destructive ? 'destructive' : 'default';

  function handleOpenChange(next: boolean) {
    if (pendingRef.current && !next) {
      return;
    }
    if (next) {
      setValues(buildInitialValues(fields, defaultValues));
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

    const parsedValues: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name] ?? '';
      if (field.type === 'number') {
        parsedValues[field.name] = raw === '' ? undefined : Number(raw);
      } else {
        parsedValues[field.name] = raw;
      }
    }

    const result = schema.safeParse(parsedValues);
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
      await onSubmit(result.data);
      setOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant={buttonVariant}>
          {triggerLabel}
        </Button>
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
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                type={field.type ?? 'text'}
                value={values[field.name] ?? ''}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors[field.name])}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: event.target.value,
                  }))
                }
              />
              {fieldErrors[field.name] ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors[field.name]}
                </p>
              ) : null}
            </div>
          ))}
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending} variant={buttonVariant}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
