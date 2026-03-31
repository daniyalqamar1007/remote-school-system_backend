// src/behavior/behavior.controller.ts

import { Controller, Get, Post, Body, Param, Delete, Patch, Query } from '@nestjs/common';
import { BehaviorService } from './behavior.service';
import { CreateBehaviorDto } from './dto/create-behavior.dto';
import { UpdateBehaviorDto } from './dto/update-behavior.dto';

@Controller('behavior')
export class BehaviorController {
  constructor(private readonly service: BehaviorService) {}

  @Post()
  async create(@Body() dto: CreateBehaviorDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(@Query('studentId') studentId?: string) {
    return this.service.findAll(studentId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBehaviorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}