import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

type SessionRow = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
};

function createAuthApiMock(initial: SessionRow[]) {
  const sessions = [...initial];
  let currentToken = sessions[0]?.token;

  return {
    sessions,
    setCurrentToken(token: string) {
      currentToken = token;
    },
    api: {
      async listSessions() {
        await Promise.resolve();
        const owner = sessions.find((row) => row.token === currentToken);
        if (!owner) {
          return [];
        }
        return sessions.filter(
          (row) =>
            row.userId === owner.userId && row.expiresAt.getTime() > Date.now(),
        );
      },
      async revokeSession({ body }: { body: { token: string } }) {
        await Promise.resolve();
        const owner = sessions.find((row) => row.token === currentToken);
        const target = sessions.find((row) => row.token === body.token);
        if (owner && target && target.userId === owner.userId) {
          const index = sessions.findIndex((row) => row.token === body.token);
          if (index >= 0) {
            sessions.splice(index, 1);
          }
        }
        return { status: true };
      },
      async revokeSessions() {
        await Promise.resolve();
        const owner = sessions.find((row) => row.token === currentToken);
        if (!owner) {
          return { status: true };
        }
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (sessions[i]?.userId === owner.userId) {
            sessions.splice(i, 1);
          }
        }
        return { status: true };
      },
      async changePassword({
        body,
      }: {
        body: { revokeOtherSessions?: boolean };
      }) {
        await Promise.resolve();
        const owner = sessions.find((row) => row.token === currentToken);
        if (!owner) {
          throw new Error('unauthorized');
        }
        if (body.revokeOtherSessions) {
          for (let i = sessions.length - 1; i >= 0; i -= 1) {
            const row = sessions[i];
            if (
              row &&
              row.userId === owner.userId &&
              row.token !== currentToken
            ) {
              sessions.splice(i, 1);
            }
          }
        }
        return { token: currentToken, user: { id: owner.userId } };
      },
      async getSession({ headers }: { headers: Headers }) {
        await Promise.resolve();
        const cookie = headers.get('cookie') ?? '';
        const match = /session_token=([^;]+)/.exec(cookie);
        const token = match?.[1];
        const row = sessions.find((session) => session.token === token);
        if (!row || row.expiresAt.getTime() <= Date.now()) {
          return null;
        }
        return {
          session: row,
          user: { id: row.userId },
        };
      },
    },
  };
}

describe('SessionsService', () => {
  it('lista las propias', async () => {
    const mock = createAuthApiMock([
      {
        id: 's1',
        token: 't1',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's2',
        token: 't2',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's3',
        token: 't3',
        userId: 'user-b',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    mock.setCurrentToken('t1');
    const service = new SessionsService({ api: mock.api } as never);

    const listed = await service.list(new Headers());
    expect(listed.map((row) => row.id).sort()).toEqual(['s1', 's2']);
  });

  it('revoca una', async () => {
    const mock = createAuthApiMock([
      {
        id: 's1',
        token: 't1',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's2',
        token: 't2',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    mock.setCurrentToken('t1');
    const service = new SessionsService({ api: mock.api } as never);

    await service.revoke('s2', new Headers());
    expect(mock.sessions.map((row) => row.id)).toEqual(['s1']);
    const session = await mock.api.getSession({
      headers: new Headers({ cookie: 'session_token=t2' }),
    });
    expect(session).toBeNull();
  });

  it('revoca ajena', async () => {
    const mock = createAuthApiMock([
      {
        id: 's1',
        token: 't1',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's-other',
        token: 't-other',
        userId: 'user-b',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    mock.setCurrentToken('t1');
    const service = new SessionsService({ api: mock.api } as never);

    await expect(
      service.revoke('s-other', new Headers()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mock.sessions.some((row) => row.id === 's-other')).toBe(true);
  });

  it('cambio de password', async () => {
    const mock = createAuthApiMock([
      {
        id: 's-current',
        token: 't-current',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 's-other',
        token: 't-other',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    mock.setCurrentToken('t-current');
    const service = new SessionsService({ api: mock.api } as never);

    await service.changePassword({
      headers: new Headers(),
      currentPassword: 'old-password-1',
      newPassword: 'new-password-1',
    });

    expect(mock.sessions.map((row) => row.id)).toEqual(['s-current']);
    const other = await mock.api.getSession({
      headers: new Headers({ cookie: 'session_token=t-other' }),
    });
    const current = await mock.api.getSession({
      headers: new Headers({ cookie: 'session_token=t-current' }),
    });
    expect(other).toBeNull();
    expect(current?.user.id).toBe('user-a');
  });
});
