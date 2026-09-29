import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service.js';
import { ObjectStorage } from './object-storage.js';

@Global()
@Module({
  providers: [MinioService, ObjectStorage],
  exports: [MinioService, ObjectStorage],
})
export class MinioModule {}
