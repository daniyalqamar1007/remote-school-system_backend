// src/behavior/dto/update-behavior.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateBehaviorDto } from './create-behavior.dto';

export class UpdateBehaviorDto extends PartialType(CreateBehaviorDto) {}