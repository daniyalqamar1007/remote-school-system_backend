import { PartialType } from '@nestjs/mapped-types';
import { CreateFeePolicyDto } from './create-fee-policy.dto';

export class UpdateFeePolicyDto extends PartialType(CreateFeePolicyDto) {}
