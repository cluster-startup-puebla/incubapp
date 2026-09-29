import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Client } from 'minio';
import { requiredEnv } from '../env.js';

/** Seconds for signed GET URLs. */
export const SIGNED_GET_EXPIRY_SECONDS = 60 * 60;

export type ObjectStorageClient = {
  putObject(
    bucketName: string,
    objectName: string,
    stream: Buffer | string,
    size?: number,
  ): Promise<unknown>;
  presignedGetObject(
    bucketName: string,
    objectName: string,
    expires?: number,
  ): Promise<string>;
  removeObject(bucketName: string, objectName: string): Promise<void>;
};

export type SignedGetResult = {
  url: string;
  expiresIn: number;
};

function createDefaultClient(): ObjectStorageClient {
  return new Client({
    endPoint: requiredEnv('MINIO_ENDPOINT'),
    port: Number(requiredEnv('MINIO_PORT')),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: requiredEnv('MINIO_ACCESS_KEY'),
    secretKey: requiredEnv('MINIO_SECRET_KEY'),
  });
}

export function assertSafeObjectKey(key: string): void {
  if (
    key.length === 0 ||
    key.includes('..') ||
    key.includes('\\') ||
    key.startsWith('/') ||
    key.includes('\0')
  ) {
    throw new BadRequestException('Invalid object key');
  }
}

/**
 * Application port over object storage. Controllers must use this,
 * never the MinIO SDK directly. Bucket always comes from config.
 */
@Injectable()
export class ObjectStorage {
  private readonly client: ObjectStorageClient;
  private readonly bucket: string;

  constructor(@Optional() client?: ObjectStorageClient) {
    this.bucket = requiredEnv('MINIO_BUCKET');
    this.client = client ?? createDefaultClient();
  }

  get configuredBucket(): string {
    return this.bucket;
  }

  async put(buffer: Buffer, key: string): Promise<string> {
    assertSafeObjectKey(key);
    await this.client.putObject(this.bucket, key, buffer, buffer.length);
    return key;
  }

  async signedGet(
    key: string,
    expiresIn: number = SIGNED_GET_EXPIRY_SECONDS,
  ): Promise<SignedGetResult> {
    assertSafeObjectKey(key);
    const url = await this.client.presignedGetObject(
      this.bucket,
      key,
      expiresIn,
    );
    return { url, expiresIn };
  }

  async delete(key: string): Promise<void> {
    assertSafeObjectKey(key);
    await this.client.removeObject(this.bucket, key);
  }
}
