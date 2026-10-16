import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth.decorators';
import { PrismaService } from './common/prisma.service';
import { EscrowGateway } from './integrations/escrow';
import { config } from './common/config';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly escrow: EscrowGateway) {}

  @Get()
  @Public()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, env: config.env, escrowProvider: this.escrow.provider.name, standIns: config.standInsEnabled };
  }
}
