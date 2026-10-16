import { Injectable } from '@nestjs/common';

// Single source of "now" so tests can move time forward (review windows,
// dispute deadlines, rating publication).
@Injectable()
export class ClockService {
  private offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  advance(ms: number) {
    this.offsetMs += ms;
  }
  reset() {
    this.offsetMs = 0;
  }
}
