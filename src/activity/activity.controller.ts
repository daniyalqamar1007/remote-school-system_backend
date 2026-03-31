import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post("add")
  async create(@Body() createActivityDto: CreateActivityDto) {
    return this.activityService.create(createActivityDto);
  }

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('title') title?: string,
    @Query('performBy') performBy?: string,
    @Query('className') className?: string,
    @Query('section') section?: string,
    @Query('type') type?: string,
    @Query('actorId') actorId?: string,
    @Query('role') role?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Add className/section/type filters as needed in service
    return this.activityService.findAll(
      Number(page) || 1, 
      Number(limit) || 10, 
      title,
      performBy,
      className,
      section,
      type,
      actorId,
      role,
      startDate,
      endDate,
    );
  }
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.activityService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async delete(@Param('id') id: string, @Request() req: any) {
    // Only admins, super-admins, and secretaries can delete activities
    // This prevents teachers from deleting activities that appear in audit logs
    return this.activityService.delete(id);
  }
}
