import nodemailer from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  from?: string;
};

export type MailTransport = {
  sendMail: (options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>;
};

function readSmtpEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function createSmtpTransport(): MailTransport {
  return nodemailer.createTransport({
    host: readSmtpEnv('SMTP_HOST'),
    port: Number(readSmtpEnv('SMTP_PORT')),
    secure: false,
  });
}

export async function sendMail(
  input: MailMessage,
  transport: MailTransport = createSmtpTransport(),
): Promise<void> {
  await transport.sendMail({
    from: input.from ?? readSmtpEnv('SMTP_FROM'),
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
