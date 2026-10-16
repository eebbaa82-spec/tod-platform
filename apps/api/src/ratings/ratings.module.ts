import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { TrustService } from './trust.service';

@Module({ controllers: [RatingsController], providers: [RatingsService, TrustService], exports: [RatingsService, TrustService] })
export class RatingsModule {}
