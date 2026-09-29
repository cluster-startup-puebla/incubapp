import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { sendMail } from './mail/send-mail.js';
import { prisma } from './prisma/prisma.client.js';
import { requiredEnv } from './env.js';

export const auth = betterAuth({
  appName: 'Incubapp',
  trustedOrigins: [requiredEnv('WEB_ORIGIN')],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Reset your password',
        text: url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Verify your email',
        text: url,
      });
    },
  },
});
