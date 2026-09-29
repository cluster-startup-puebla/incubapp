import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { NextFunction, Request, Response } from 'express';

export function isApiReferencePublic(options: {
  nodeEnv: string;
  apiReferenceEnabled: boolean;
}): boolean {
  if (!options.apiReferenceEnabled) {
    return false;
  }
  return options.nodeEnv !== 'production';
}

export function configureApiReference(
  app: INestApplication,
  options: {
    document: OpenAPIObject;
    nodeEnv: string;
    apiReferenceEnabled: boolean;
    isSuperAdmin: (req: Request) => Promise<boolean>;
  },
): void {
  if (!options.apiReferenceEnabled) {
    app.use('/reference', (_req: Request, res: Response) => {
      res.status(404).json({ message: 'Not Found' });
    });
    return;
  }

  if (!isApiReferencePublic(options)) {
    app.use('/reference', (req: Request, res: Response, next: NextFunction) => {
      void options.isSuperAdmin(req).then((ok) => {
        if (!ok) {
          res.status(401).json({ message: 'Unauthorized' });
          return;
        }
        next();
      });
    });
  }

  app.use('/reference', apiReference({ content: options.document }));
}
