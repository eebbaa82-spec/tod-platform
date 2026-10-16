import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, Public, Roles, SessionUser } from '../common/auth.decorators';
import { CatalogueService } from './catalogue.service';
import { CreatePackageDto, PackageContentDto, RetireDto } from './dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Public()
  @Get('service-areas')
  areas() {
    return this.catalogue.serviceAreas();
  }

  @Public()
  @Get('packages')
  list(@Query('serviceArea') serviceArea?: string) {
    return this.catalogue.list({ serviceArea });
  }

  @Public()
  @Get('packages/:code')
  get(@Param('code') code: string) {
    return this.catalogue.get(code);
  }

  // Staff: full list including retired and extension packages.
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT', 'VETTING_OFFICER', 'AUDITOR')
  @Get('admin/packages')
  adminList() {
    return this.catalogue.list({ includeExtension: true, includeRetired: true });
  }

  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('admin/packages')
  create(@CurrentUser() me: SessionUser, @Body() dto: CreatePackageDto) {
    return this.catalogue.create(me.id, dto);
  }

  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Put('admin/packages/:code')
  revise(@CurrentUser() me: SessionUser, @Param('code') code: string, @Body() dto: PackageContentDto) {
    return this.catalogue.revise(me.id, code, dto);
  }

  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('admin/packages/:code/retire')
  retire(@CurrentUser() me: SessionUser, @Param('code') code: string, @Body() dto: RetireDto) {
    return this.catalogue.setStatus(me.id, code, 'RETIRED', dto.reason);
  }

  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('admin/packages/:code/reactivate')
  reactivate(@CurrentUser() me: SessionUser, @Param('code') code: string, @Body() dto: RetireDto) {
    return this.catalogue.setStatus(me.id, code, 'ACTIVE', dto.reason);
  }

  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('admin/packages/:code/extension')
  extension(@CurrentUser() me: SessionUser, @Param('code') code: string, @Body('extensionCategory') flag: boolean) {
    return this.catalogue.setExtension(me.id, code, !!flag);
  }
}
