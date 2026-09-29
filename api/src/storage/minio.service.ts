import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { requiredEnv } from '../env.js';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly bucket = requiredEnv('MINIO_BUCKET');
  private readonly client = new Client({
    endPoint: requiredEnv('MINIO_ENDPOINT'),
    port: Number(requiredEnv('MINIO_PORT')),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: requiredEnv('MINIO_ACCESS_KEY'),
    secretKey: requiredEnv('MINIO_SECRET_KEY'),
  });

  async onModuleInit(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
    this.logger.log(`MinIO bucket ready: ${this.bucket}`);
  }
}
