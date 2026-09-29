import { Injectable, Optional } from '@nestjs/common';
import {
  createSmtpTransport,
  sendMail,
  type MailMessage,
  type MailTransport,
} from './send-mail.js';

export const VERIFY_EMAIL_SUBJECT = 'Verify your email';
export const RESET_PASSWORD_SUBJECT = 'Reset your password';

@Injectable()
export class MailerService {
  private readonly transport: MailTransport;

  constructor(@Optional() transport?: MailTransport) {
    this.transport = transport ?? createSmtpTransport();
  }

  send(message: MailMessage): Promise<void> {
    return sendMail(message, this.transport);
  }

  sendVerificationEmail(input: { to: string; url: string }): Promise<void> {
    return this.send({
      to: input.to,
      subject: VERIFY_EMAIL_SUBJECT,
      text: input.url,
    });
  }

  sendPasswordResetEmail(input: { to: string; url: string }): Promise<void> {
    return this.send({
      to: input.to,
      subject: RESET_PASSWORD_SUBJECT,
      text: input.url,
    });
  }
}
