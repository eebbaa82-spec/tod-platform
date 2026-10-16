import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ReportFilter, ReportsService } from './reports.service';

const READERS = ['MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'PARTNER_VIEWER'] as const;

@Controller('reports')
@Roles(...READERS)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('indicators')
  indicators(@Query() f: ReportFilter) {
    return this.reports.indicators(f);
  }

  @Get('talent')
  talent(@Query() f: ReportFilter) {
    return this.reports.talentBreakdown(f);
  }

  @Get('clients')
  clients(@Query() f: ReportFilter) {
    return this.reports.clientBreakdown(f);
  }

  @Get('funnels')
  funnels(@Query() f: ReportFilter) {
    return this.reports.funnels(f);
  }

  @Get('willingness-to-pay')
  wtp(@Query() f: ReportFilter) {
    return this.reports.willingnessToPay(f);
  }

  @Get('export.xlsx')
  @Roles('MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR')
  async export(@CurrentUser() me: SessionUser, @Query() f: ReportFilter, @Res() res: Response) {
    const buf = await this.reports.exportXlsx(me, f);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tod-indicators-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  }
}
