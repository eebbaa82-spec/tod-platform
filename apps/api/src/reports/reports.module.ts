import { Module } from '@nestjs/common';
import { GesiService } from './gesi.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ controllers: [ReportsController], providers: [ReportsService, GesiService], exports: [GesiService] })
export class ReportsModule {}
