import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './common/config';

export async function configureApp(app: import('@nestjs/common').INestApplication) {
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.webOrigin, credentials: true });
  (app as any).set?.('trust proxy', 1);
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await configureApp(app);
  await app.listen(config.port);
  console.log(`ToD API on http://localhost:${config.port}/api (${config.env})`);
}

if (require.main === module) bootstrap();
