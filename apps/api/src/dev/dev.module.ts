import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { DevController } from './dev.controller';

@Module({ imports: [JobsModule], controllers: [DevController] })
export class DevModule {}
