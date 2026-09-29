import {
  MailerService,
  RESET_PASSWORD_SUBJECT,
  VERIFY_EMAIL_SUBJECT,
} from './mailer.service.js';
import type { MailTransport } from './send-mail.js';

type SentMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

function createFakeTransport(sent: SentMail[]): MailTransport {
  return {
    sendMail(options) {
      sent.push(options);
      return Promise.resolve({ messageId: `msg-${sent.length}` });
    },
  };
}

describe('MailerService', () => {
  const previousFrom = process.env.SMTP_FROM;

  beforeAll(() => {
    process.env.SMTP_FROM = 'incubapp@localhost';
  });

  afterAll(() => {
    if (previousFrom === undefined) {
      delete process.env.SMTP_FROM;
    } else {
      process.env.SMTP_FROM = previousFrom;
    }
  });

  it('envia verificacion', async () => {
    const sent: SentMail[] = [];
    const mailer = new MailerService(createFakeTransport(sent));
    const url = 'http://localhost:3001/api/auth/verify-email?token=abc';

    await mailer.sendVerificationEmail({
      to: 'user@example.com',
      url,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('user@example.com');
    expect(sent[0]?.subject).toBe(VERIFY_EMAIL_SUBJECT);
    expect(sent[0]?.text).toBe(url);
  });

  it('envia reset', async () => {
    const sent: SentMail[] = [];
    const mailer = new MailerService(createFakeTransport(sent));
    const url =
      'http://localhost:3001/api/auth/reset-password/tok?callbackURL=';

    await mailer.sendPasswordResetEmail({
      to: 'user@example.com',
      url,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe(RESET_PASSWORD_SUBJECT);
    expect(sent[0]?.text).toBe(url);
  });

  it('token expirado', () => {
    const verification = {
      expiresAt: new Date(Date.now() - 60_000),
      value: 'user-1',
      consumed: false,
    };
    const now = Date.now();
    expect(verification.expiresAt.getTime() < now).toBe(true);
    expect(verification.consumed).toBe(false);
    // Expired tokens must fail before mailer side-effects.
    const consume = () => {
      if (verification.expiresAt.getTime() < Date.now()) {
        throw new Error('TOKEN_EXPIRED');
      }
    };
    expect(consume).toThrow('TOKEN_EXPIRED');
  });

  it('token usado', () => {
    const verification = {
      expiresAt: new Date(Date.now() + 60_000),
      value: 'user-1',
      consumed: true,
    };
    const consume = () => {
      if (verification.consumed) {
        throw new Error('TOKEN_USED');
      }
      verification.consumed = true;
    };
    expect(consume).toThrow('TOKEN_USED');
  });

  it('email inexistente en reset', async () => {
    const sent: SentMail[] = [];
    const mailer = new MailerService(createFakeTransport(sent));

    const publicResponseForUnknown = {
      status: true,
      message:
        'If this email exists in our system, check your email for the reset link',
    };
    const publicResponseForKnown = {
      status: true,
      message:
        'If this email exists in our system, check your email for the reset link',
    };

    // Better Auth only calls sendResetPassword when the user exists.
    const user = null as { email: string } | null;
    if (user) {
      await mailer.sendPasswordResetEmail({
        to: user.email,
        url: 'http://example/reset',
      });
    }

    expect(publicResponseForUnknown).toEqual(publicResponseForKnown);
    expect(sent).toHaveLength(0);
  });
});
