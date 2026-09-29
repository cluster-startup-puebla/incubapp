import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { auth as AuthInstance } from '../auth.js';

export type SessionSummary = {
  id: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type HeadersLike = Headers | Record<string, string>;

@Injectable()
export class SessionsService {
  constructor(private readonly authService: AuthService<typeof AuthInstance>) {}

  async list(headers: HeadersLike): Promise<SessionSummary[]> {
    const sessions = await this.authService.api.listSessions({
      headers: headers as Headers,
    });
    return sessions;
  }

  async revoke(sessionId: string, headers: HeadersLike): Promise<void> {
    const sessions = await this.list(headers);
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      throw new NotFoundException('Session not found');
    }
    await this.authService.api.revokeSession({
      body: { token: target.token },
      headers: headers as Headers,
    });
  }

  async revokeAll(headers: HeadersLike): Promise<void> {
    await this.authService.api.revokeSessions({
      headers: headers as Headers,
    });
  }

  async changePassword(input: {
    headers: HeadersLike;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    await this.authService.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: input.headers as Headers,
    });
  }
}
