import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreateAssignmentDto {
  // Either a package, or a described need that support converts (FR-MAT-01).
  @IsOptional() @IsString() packageCode?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsString() @MinLength(10) @MaxLength(4000) brief: string;
  @IsOptional() @IsInt() @Min(100) budgetMax?: number;
  @IsOptional() @IsString() deadline?: string;
  // Repeat engagement of a talent the client worked with before (FR-MAT-08).
  @IsOptional() @IsString() directTalentId?: string;
  // Set when a support agent creates the request on a client's behalf.
  @IsOptional() @IsString() clientUserId?: string;
  @IsOptional() @IsIn(['REMOTE', 'ONSITE', 'BOTH']) workMode?: 'REMOTE' | 'ONSITE' | 'BOTH';
}

export class ScopeDto {
  @IsOptional() @IsString() packageCode?: string;
  // Custom scope for Expert-tier talents (FR-CAT-05).
  @IsOptional() @IsString() serviceAreaCode?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) brief?: string;
  @IsOptional() @IsInt() @Min(100) budgetMax?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) acceptanceCriteria?: string[];
}

export class RespondInvitationDto {
  @IsIn(['ACCEPT_PRICE', 'PROPOSE', 'DECLINE']) action: 'ACCEPT_PRICE' | 'PROPOSE' | 'DECLINE';
  @IsOptional() @IsInt() @Min(100) amount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) deliveryDays?: number;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class MilestonePlanDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsInt() @Min(100) amount: number;
  @IsInt() @Min(1) @Max(180) dueInWorkingDays: number;
}

export class AcceptProposalDto {
  // Optional split into milestones (FR-ASG-09); amounts must add up to the proposal.
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => MilestonePlanDto) milestones?: MilestonePlanDto[];
}

export class CounterDto {
  @IsInt() @Min(100) amount: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CounterResponseDto {
  @IsBoolean() accept: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RejectDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class DeliverDto {
  @IsString() @MinLength(3) @MaxLength(4000) note: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) links?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) fileIds?: string[];
  @IsArray() checklist: { item: string; done: boolean }[];
}

export class RevisionDto {
  @IsString() @MinLength(3) @MaxLength(2000) reason: string;
}

export class SignOffDto {
  // Digital sign-off linked to the verified account (FR-ASG-06): the client re-enters their password or PIN.
  @IsString() password: string;
}
