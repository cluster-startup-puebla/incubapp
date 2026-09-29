import 'dotenv/config';

import { BadRequestException } from '@nestjs/common';
import { MinioService } from './minio.service.js';
import {
  ObjectStorage,
  SIGNED_GET_EXPIRY_SECONDS,
  type ObjectStorageClient,
} from './object-storage.js';

const BUCKET = 'incubapp-test-bucket';

type FakeCalls = {
  putObject: Array<{
    bucketName: string;
    objectName: string;
    size?: number;
  }>;
  presignedGetObject: Array<{
    bucketName: string;
    objectName: string;
    expires?: number;
  }>;
  removeObject: Array<{ bucketName: string; objectName: string }>;
  bucketExists: string[];
  makeBucket: string[];
};

type FakeClient = ObjectStorageClient & {
  calls: FakeCalls;
  bucketExists: (bucketName: string) => Promise<boolean>;
  makeBucket: (bucketName: string) => Promise<void>;
};

function createFakeClient(options?: { bucketExists?: boolean }): FakeClient {
  const calls: FakeCalls = {
    putObject: [],
    presignedGetObject: [],
    removeObject: [],
    bucketExists: [],
    makeBucket: [],
  };

  return {
    calls,
    putObject(bucketName, objectName, _stream, size) {
      calls.putObject.push({ bucketName, objectName, size });
      return Promise.resolve({ etag: 'fake', versionId: null });
    },
    presignedGetObject(bucketName, objectName, expires) {
      calls.presignedGetObject.push({ bucketName, objectName, expires });
      const ttl = expires ?? SIGNED_GET_EXPIRY_SECONDS;
      return Promise.resolve(
        `https://minio.local/${bucketName}/${objectName}?X-Amz-Expires=${ttl}`,
      );
    },
    removeObject(bucketName, objectName) {
      calls.removeObject.push({ bucketName, objectName });
      return Promise.resolve();
    },
    bucketExists(bucketName) {
      calls.bucketExists.push(bucketName);
      return Promise.resolve(options?.bucketExists ?? true);
    },
    makeBucket(bucketName) {
      calls.makeBucket.push(bucketName);
      return Promise.resolve();
    },
  };
}

describe('ObjectStorage', () => {
  const previousBucket = process.env.MINIO_BUCKET;

  beforeAll(() => {
    process.env.MINIO_BUCKET = BUCKET;
  });

  afterAll(() => {
    if (previousBucket === undefined) {
      delete process.env.MINIO_BUCKET;
    } else {
      process.env.MINIO_BUCKET = previousBucket;
    }
  });

  it('put', async () => {
    const fake = createFakeClient();
    const storage = new ObjectStorage(fake);
    const key = 'evidence/startup-1/file.pdf';
    const buffer = Buffer.from('hello');

    const returned = await storage.put(buffer, key);

    expect(returned).toBe(key);
    expect(fake.calls.putObject).toEqual([
      { bucketName: BUCKET, objectName: key, size: buffer.length },
    ]);
    expect(storage.configuredBucket).toBe(BUCKET);
  });

  it('key ajena', async () => {
    const fake = createFakeClient();
    const storage = new ObjectStorage(fake);

    await expect(
      storage.put(Buffer.from('x'), '../etc/passwd'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fake.calls.putObject).toHaveLength(0);

    await expect(storage.signedGet('owned/../secret')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fake.calls.presignedGetObject).toHaveLength(0);
  });

  it('signed get', async () => {
    const fake = createFakeClient();
    const storage = new ObjectStorage(fake);
    const key = 'evidence/owned/doc.pdf';

    const result = await storage.signedGet(key);

    expect(result.expiresIn).toBe(SIGNED_GET_EXPIRY_SECONDS);
    expect(result.url).toContain(`X-Amz-Expires=${SIGNED_GET_EXPIRY_SECONDS}`);
    expect(fake.calls.presignedGetObject).toEqual([
      {
        bucketName: BUCKET,
        objectName: key,
        expires: SIGNED_GET_EXPIRY_SECONDS,
      },
    ]);
  });

  it('bucket ausente al boot', async () => {
    const fake = createFakeClient({ bucketExists: false });
    const service = Object.create(MinioService.prototype) as {
      client: FakeClient;
      bucket: string;
      logger: { log: (message: string) => void };
      onModuleInit: () => Promise<void>;
    };
    service.client = fake;
    service.bucket = BUCKET;
    service.logger = { log: () => undefined };

    await service.onModuleInit();

    expect(fake.calls.bucketExists).toEqual([BUCKET]);
    expect(fake.calls.makeBucket).toEqual([BUCKET]);
  });
});
