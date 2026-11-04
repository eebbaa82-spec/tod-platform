import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hasRole, SessionUser, isStaff } from '../common/auth.decorators';
import { sha256 } from '../common/crypto';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { FileScanner, FileStorage, LocalDiskStorage, NoScanner } from './storage';

// File types users may upload (NFR-SEC-04). Checked by extension and by content signature.
const ALLOWED: Record<string, { ext: string[]; magic?: number[][] }> = {
  'application/pdf': { ext: ['pdf'], magic: [[0x25, 0x50, 0x44, 0x46]] },
  'image/png': { ext: ['png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/jpeg': { ext: ['jpg', 'jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  'image/webp': { ext: ['webp'], magic: [[0x52, 0x49, 0x46, 0x46]] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: ['docx'], magic: [[0x50, 0x4b]] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: ['xlsx'], magic: [[0x50, 0x4b]] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: ['pptx'], magic: [[0x50, 0x4b]] },
  'application/zip': { ext: ['zip'], magic: [[0x50, 0x4b]] },
  'text/csv': { ext: ['csv'] },
  'text/plain': { ext: ['txt'] },
};

const PURPOSES = ['PORTFOLIO', 'DELIVERY', 'MESSAGE', 'EVIDENCE', 'TICKET', 'PHOTO'];

@Injectable()
export class FilesService {
  private storage: FileStorage = new LocalDiskStorage();
  private scanner: FileScanner = new NoScanner();

  constructor(private readonly prisma: PrismaService, private readonly params: ParametersService) {}

  async upload(ownerId: string, file: Express.Multer.File, purpose: string) {
    if (!file) throw fail.bad('NO_FILE', 'Choose a file to upload.');
    if (!PURPOSES.includes(purpose)) throw fail.bad('BAD_PURPOSE', 'Unknown upload purpose.');
    const maxMb = await this.params.get<number>('FILE_MAX_MB');
    if (file.size > maxMb * 1024 * 1024) throw fail.bad('FILE_TOO_LARGE', `Files can be up to ${maxMb} MB.`);
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const type = Object.entries(ALLOWED).find(([, v]) => v.ext.includes(ext));
    if (!type) throw fail.bad('FILE_TYPE', 'This file type is not allowed. Use PDF, images, Office documents, ZIP, CSV or text.');
    const [mime, rule] = type;
    if (rule.magic && !rule.magic.some((m) => m.every((b, i) => file.buffer[i] === b))) {
      throw fail.bad('FILE_TYPE', 'The file content does not match its type.');
    }
    const scan = await this.scanner.scan(file.buffer);
    if (scan === 'INFECTED') throw fail.bad('FILE_INFECTED', 'This file failed the security scan.');
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
    await this.storage.put(key, file.buffer);
    return this.prisma.fileObject.create({
      data: {
        ownerId,
        storageKey: key,
        name: file.originalname.slice(0, 200),
        mime,
        size: file.size,
        sha256: sha256(file.buffer),
        scanStatus: scan,
        purpose,
      },
      select: { id: true, name: true, mime: true, size: true, purpose: true, createdAt: true },
    });
  }

  // Attach files a user owns to an entity, so the other party can open them.
  async link(ownerId: string, fileIds: string[], linkedType: string, linkedId: string) {
    if (!fileIds?.length) return;
    const files = await this.prisma.fileObject.findMany({ where: { id: { in: fileIds } } });
    if (files.length !== fileIds.length || files.some((f) => f.ownerId !== ownerId)) {
      throw fail.bad('FILE_NOT_YOURS', 'One of the files could not be attached.');
    }
    await this.prisma.fileObject.updateMany({ where: { id: { in: fileIds } }, data: { linkedType, linkedId } });
  }

  async download(me: SessionUser, id: string) {
    const f = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!f) throw fail.notFound('File');
    if (!(await this.canRead(me, f))) throw fail.forbidden('FILE_FORBIDDEN', 'You cannot open this file.');
    return { meta: f, data: await this.storage.get(f.storageKey) };
  }

  // Files anyone may open without signing in: portfolio items and the profile
  // photo of a published talent. Identity (Fayda) photos are never public.
  async publicDownload(id: string) {
    const f = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!f || !f.linkedId || !['PORTFOLIO', 'PROFILE_PHOTO'].includes(f.linkedType ?? '')) throw fail.notFound('File');
    const profile = await this.prisma.talentProfile.findUnique({ where: { id: f.linkedId }, include: { user: { select: { status: true } } } });
    if (!profile?.publishedAt || profile.user.status !== 'ACTIVE') throw fail.notFound('File');
    if (f.linkedType === 'PROFILE_PHOTO' && profile.photoFileId !== f.id) throw fail.notFound('File');
    return { meta: f, data: await this.storage.get(f.storageKey) };
  }

  // Names and types for a list of file ids, for showing links.
  async describe(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.fileObject.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, mime: true, size: true } });
    return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  }

  private async canRead(me: SessionUser, f: { ownerId: string; linkedType: string | null; linkedId: string | null; purpose: string }) {
    if (f.ownerId === me.id) return true;
    if (f.linkedType === 'PORTFOLIO') return true; // portfolio items are public
    if (f.linkedType === 'ASSIGNMENT' && f.linkedId) {
      const a = await this.prisma.assignment.findUnique({ where: { id: f.linkedId } });
      if (a && (a.clientId === me.id || a.talentId === me.id)) return true;
      if (hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR')) return true;
    }
    if (f.linkedType === 'PROFILE_PHOTO') return true;
    if ((f.linkedType === 'DISPUTE' || f.linkedType === 'DISPUTE_INTERNAL') && f.linkedId) {
      const staff = hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR');
      if (staff) return true;
      if (f.linkedType === 'DISPUTE_INTERNAL') return false;
      const d = await this.prisma.dispute.findUnique({ where: { id: f.linkedId }, include: { assignment: true } });
      return !!d && (d.assignment.clientId === me.id || d.assignment.talentId === me.id);
    }
    if (f.linkedType === 'TICKET' && f.linkedId) {
      const t = await this.prisma.ticket.findUnique({ where: { id: f.linkedId } });
      if (t && t.requesterId === me.id) return true;
      if (t?.confidential) return hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN') && (await this.prisma.user.findUnique({ where: { id: me.id } }))?.safeguardingDesignated === true;
      return hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN');
    }
    if (f.linkedType === 'CLIENT_PROFILE') return hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR');
    return isStaff(me.roles) && hasRole(me, 'PLATFORM_ADMIN', 'SUPER_ADMIN');
  }
}
