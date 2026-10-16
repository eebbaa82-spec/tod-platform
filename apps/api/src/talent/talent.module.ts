import { Module } from '@nestjs/common';
import { RatingsModule } from '../ratings/ratings.module';
import { TalentController } from './talent.controller';
import { TalentService } from './talent.service';

@Module({ imports: [RatingsModule], controllers: [TalentController], providers: [TalentService], exports: [TalentService] })
export class TalentModule {}
