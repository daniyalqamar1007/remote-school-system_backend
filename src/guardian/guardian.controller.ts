import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GuardianService } from './guardian.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { Guardian } from './schema/guardian.schema';

@Controller('guardians')
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Post()
  async create(@Body() createGuardianDto: CreateGuardianDto): Promise<Guardian> {
    return this.guardianService.create(createGuardianDto);
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.guardianService.findAll(Number(page), Number(limit));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Guardian> {
    return this.guardianService.findOne(id);
  }

  
}
