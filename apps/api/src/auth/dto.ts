import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString() phone: string;
  @IsIn(['REGISTER', 'NEW_DEVICE', 'RESET', 'ASSISTED_CONSENT']) purpose: string;
}

export class RegisterDto {
  @IsString() phone: string;
  @IsString() @Length(6, 6) otp: string;
  // Password or PIN: at least 6 characters; a 6-digit PIN is allowed (FR-ACC-03).
  @IsString() @MinLength(6) @MaxLength(128) password: string;
  @IsString() @MinLength(2) @MaxLength(80) displayName: string;
  @IsIn(['TALENT', 'CLIENT']) role: 'TALENT' | 'CLIENT';
  @IsOptional() @IsIn(['en', 'am']) language?: 'en' | 'am';
  @IsBoolean() acceptTerms: boolean;
  @IsBoolean() acceptPrivacy: boolean;
  @IsBoolean() acceptCommunity: boolean;
  @IsOptional() @IsString() deviceId?: string;
}

export class LoginDto {
  @IsString() phone: string;
  @IsString() password: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() otp?: string;
  @IsOptional() @IsString() mfaCode?: string;
}

export class ResetPasswordDto {
  @IsString() phone: string;
  @IsString() @Length(6, 6) otp: string;
  @IsString() @MinLength(6) @MaxLength(128) password: string;
}

export class MfaVerifyDto {
  @IsString() @Length(6, 6) code: string;
}

export class AssistedRegisterDto {
  @IsString() phone: string;
  @IsString() @Length(6, 6) otp: string;
  @IsString() @MinLength(2) @MaxLength(80) displayName: string;
  @IsIn(['TALENT', 'CLIENT']) role: 'TALENT' | 'CLIENT';
  @IsOptional() @IsIn(['en', 'am']) language?: 'en' | 'am';
  // The agent confirms the user heard and accepted each document.
  @IsBoolean() acceptTerms: boolean;
  @IsBoolean() acceptPrivacy: boolean;
  @IsBoolean() acceptCommunity: boolean;
}

export class AddRoleDto {
  @IsIn(['TALENT', 'CLIENT']) role: 'TALENT' | 'CLIENT';
}

export class ConsentsDto {
  @IsArray() documents: string[];
}
