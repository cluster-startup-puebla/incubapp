import nodemailer from 'nodemailer';
import { requiredEnv } from '../env.js';

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port: Number(requiredEnv('SMTP_PORT')),
    secure: false,
  });

  await transporter.sendMail({
    from: requiredEnv('SMTP_FROM'),
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
