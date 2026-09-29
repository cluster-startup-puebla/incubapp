'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

type SessionRow = {
  id: string;
  token?: string;
  expiresAt?: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string | Date;
};

type ListSessionsResult = {
  data: SessionRow[] | null;
  error: { message?: string } | null;
};

type SessionsEnvelope = {
  data: SessionRow[];
  meta?: unknown;
};

function formatDate(value: string | Date | undefined): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

async function loadSessions(): Promise<SessionRow[]> {
  const listSessions = (
    authClient as {
      listSessions?: () => Promise<ListSessionsResult>;
    }
  ).listSessions;

  if (typeof listSessions === 'function') {
    const { data, error } = await listSessions();
    if (error) {
      throw new Error(error.message ?? 'No se pudieron cargar las sesiones');
    }
    return data ?? [];
  }

  const body = await apiClient<SessionsEnvelope | SessionRow[]>(
    '/api/v1/sessions',
  );
  if (Array.isArray(body)) {
    return body;
  }
  return body.data ?? [];
}

async function revokeSessionRow(row: SessionRow): Promise<void> {
  const revokeSession = (
    authClient as {
      revokeSession?: (input: {
        token: string;
      }) => Promise<{ error: { message?: string } | null }>;
    }
  ).revokeSession;

  if (row.token && typeof revokeSession === 'function') {
    const { error } = await revokeSession({ token: row.token });
    if (error) {
      throw new Error(error.message ?? 'No se pudo revocar la sesión');
    }
    return;
  }

  await apiClient(`/api/v1/sessions/${row.id}`, { method: 'DELETE' });
}

export default function SesionesPage() {
  const router = useRouter();
  const { data: current } = authClient.useSession();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const currentSessionId = current?.session?.id;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = await loadSessions();
        if (!cancelled) {
          setSessions(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar las sesiones',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onRevoke(row: SessionRow) {
    setRevokingId(row.id);
    setError(null);
    try {
      await revokeSessionRow(row);
      if (row.id === currentSessionId) {
        router.push('/login');
        router.refresh();
        return;
      }
      setSessions((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo revocar la sesión',
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="grid max-w-xl gap-4">
      <h1 className="text-xl font-semibold">Sesiones</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && sessions.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No hay sesiones.</p>
      ) : null}
      <ul className="grid gap-3">
        {sessions.map((row) => {
          const isCurrent = row.id === currentSessionId;
          return (
            <li
              key={row.id}
              className="grid gap-2 border-b border-border pb-3 last:border-b-0"
            >
              <div className="text-sm">
                <p>
                  {isCurrent ? 'Sesión actual' : 'Sesión'} ·{' '}
                  {formatDate(row.createdAt)}
                </p>
                <p className="text-muted-foreground">
                  Expira {formatDate(row.expiresAt)}
                </p>
                {row.ipAddress ? (
                  <p className="text-muted-foreground">IP {row.ipAddress}</p>
                ) : null}
                {row.userAgent ? (
                  <p className="truncate text-muted-foreground">
                    {row.userAgent}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={revokingId === row.id}
                onClick={() => void onRevoke(row)}
              >
                Revocar
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
