import { parseEnv } from './config/env.schema.js';

let envValidated = false;

function ensureEnvValidated(): void {
  if (!envValidated) {
    parseEnv(process.env);
    envValidated = true;
  }
}

export function requiredEnv(name: string): string {
  ensureEnvValidated();
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}
