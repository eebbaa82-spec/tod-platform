import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ClientProfileDto {
  @IsIn(['VERIFIED_ENTERPRISE', 'BASIC_ENTERPRISE', 'INDIVIDUAL']) level: 'VERIFIED_ENTERPRISE' | 'BASIC_ENTERPRISE' | 'INDIVIDUAL';
  @IsOptional() @IsString() @MaxLength(160) enterpriseName?: string;
  @IsOptional() @IsString() @MaxLength(60) tradeLicenceNo?: string;
  @IsOptional() @IsString() @MaxLength(20) tin?: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsString() @MaxLength(60) subCity?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) staffSize?: number;
  @IsOptional() @IsBoolean() womenLed?: boolean;
  @IsOptional() @IsBoolean() youthLed?: boolean;
  @IsOptional() @IsBoolean() pwdOwned?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) activityEvidence?: string;
  @IsOptional() @IsString() evidenceFileId?: string;
  @IsIn(['ASSOCIATION', 'SUBCITY_OFFICE', 'CAMPAIGN', 'OTHER']) referralSource: string;
  @IsOptional() @IsString() @MaxLength(160) referralDetail?: string;
}

export class ConfirmLevelDto {
  @IsString() @MinLength(3) note: string;
}
