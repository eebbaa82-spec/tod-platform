import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PackageContentDto {
  @IsString() @MinLength(3) @MaxLength(120) titleEn: string;
  @IsString() @MinLength(2) @MaxLength(120) titleAm: string;
  @IsString() @MaxLength(2000) scopeEn: string;
  @IsString() @MaxLength(2000) scopeAm: string;
  @IsString() @MaxLength(2000) exclusionsEn: string;
  @IsString() @MaxLength(2000) exclusionsAm: string;
  @IsString() @MaxLength(1000) deliverableEn: string;
  @IsString() @MaxLength(1000) deliverableAm: string;
  @IsInt() @Min(1) @Max(90) turnaroundDays: number;
  @IsInt() @Min(0) @Max(10) revisionLimit: number;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) checklistEn: string[];
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) checklistAm: string[];
  @IsIn(['ENTRY', 'INTERMEDIATE', 'EXPERT']) minTier: 'ENTRY' | 'INTERMEDIATE' | 'EXPERT';
  // Prices in santim.
  @IsInt() @Min(100) priceMin: number;
  @IsInt() @Min(100) priceMax: number;
  @IsInt() @Min(100) priceStandard: number;
}

export class CreatePackageDto extends PackageContentDto {
  @IsString() @MinLength(3) @MaxLength(40) code: string;
  @IsString() serviceAreaCode: string;
  @IsOptional() @IsBoolean() extensionCategory?: boolean;
}

export class RetireDto {
  @IsString() @MinLength(3) reason: string;
}
