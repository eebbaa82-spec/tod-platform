import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Public, SessionUser } from '../common/auth.decorators';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(@CurrentUser() me: SessionUser, @UploadedFile() file: Express.Multer.File, @Body('purpose') purpose: string) {
    return this.files.upload(me.id, file, purpose);
  }

  // Portfolio items and profile photos of published talents.
  @Public()
  @Get('public/:id')
  async publicDownload(@Param('id') id: string, @Res() res: Response) {
    const { meta, data } = await this.files.publicDownload(id);
    const inline = meta.mime.startsWith('image/');
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(data);
  }

  @Get(':id')
  async download(@CurrentUser() me: SessionUser, @Param('id') id: string, @Res() res: Response) {
    const { meta, data } = await this.files.download(me, id);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }
}
