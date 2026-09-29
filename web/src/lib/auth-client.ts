import { createAuthClient } from 'better-auth/react';

const baseURL = process.env.NEXT_PUBLIC_API_URL;

if (!baseURL) {
  throw new Error('Missing NEXT_PUBLIC_API_URL');
}

export const authClient = createAuthClient({
  baseURL,
});
