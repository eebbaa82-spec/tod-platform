import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateTalentProfileDto {
  @IsOptional() @IsString() @MaxLength(120) headline?: string;
  @IsOptional() @IsString() @MaxLength(3000) bio?: string;
  @IsOptional() @IsString() @MaxLength(60) subCity?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) education?: { level: string; institution: string; field?: string; year?: number }[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) credentials?: { name: string; issuer?: string; year?: number }[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) experience?: { role: string; organisation?: string; years?: number; description?: string }[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(80) hoursPerWeek?: number;
  @IsOptional() @IsArray() @IsIn(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], { each: true }) workingDays?: string[];
  @IsOptional() @IsIn(['REMOTE', 'ONSITE', 'BOTH']) workMode?: 'REMOTE' | 'ONSITE' | 'BOTH';
  // Voluntary self-declared fields (FR-TAL-02). Never public.
  @IsOptional() @IsBoolean() disability?: boolean | null;
  @IsOptional() @IsBoolean() displaced?: boolean | null;
  @IsOptional() @IsBoolean() otherMarginalised?: boolean | null;
  @IsOptional() @IsInt() @Min(0) @Max(10) onboardingStep?: number;
}

export class PayoutAccountDto {
  @IsIn(['BANK', 'TELEBIRR', 'CBE_BIRR']) channel: 'BANK' | 'TELEBIRR' | 'CBE_BIRR';
  @IsString() @MinLength(6) @MaxLength(40) accountNumber: string;
  @IsString() @MinLength(2) @MaxLength(120) accountName: string;
  @IsOptional() @IsString() @MaxLength(60) bankName?: string;
}

export class PortfolioItemDto {
  @IsString() @MinLength(2) @MaxLength(120) title: string;
  @IsString() @MinLength(2) @MaxLength(1000) description: string;
  @IsOptional() @IsUrl({ require_protocol: true }) url?: string;
  @IsOptional() @IsString() fileId?: string;
}
