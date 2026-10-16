import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

// Errors carry a stable code the web app translates, plus an English message.
export const fail = {
  bad: (code: string, message: string) => new BadRequestException({ code, message }),
  forbidden: (code: string, message: string) => new ForbiddenException({ code, message }),
  notFound: (what: string) => new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found.` }),
  conflict: (code: string, message: string) => new ConflictException({ code, message }),
};
