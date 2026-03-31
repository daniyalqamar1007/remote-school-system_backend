import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createEvent(@Request() req, @Body() eventData: any) {
    try {
      return await this.calendarService.createEvent(eventData, req.user.userId);
    } catch (error) {
      throw new BadRequestException('Failed to create event');
    }
  }

  @Get()
  async getEvents(@Request() req, @Query() query: any) {
    try {
      const { category, audience, startDate, endDate, status } = query;
      
      // Get user information for filtering
      const userFilters: any = {
        userRole: req.user.role,
        userGrade: req.user.grade,
        userClass: req.user.class
      };

      const filters: any = {};
      
      if (category) filters.category = category;
      if (audience) filters.audience = audience;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (status && (req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN)) {
        filters.status = status;
      }

      // Merge user-specific filters
      Object.assign(filters, userFilters);

      return await this.calendarService.getEvents(
        req.user.schoolId,
        req.user.academicYear,
        filters
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch events');
    }
  }

  @Get('upcoming')
  async getUpcomingEvents(@Request() req, @Query('limit') limit?: number) {
    try {
      const userFilters = {
        userRole: req.user.role,
        userGrade: req.user.grade,
        userClass: req.user.class
      };

      return await this.calendarService.getUpcomingEvents(
        req.user.schoolId,
        req.user.academicYear,
        limit ? parseInt(limit.toString()) : 10,
        userFilters
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch upcoming events');
    }
  }

  @Get('search')
  async searchEvents(@Request() req, @Query('q') searchTerm: string) {
    try {
      if (!searchTerm) {
        throw new BadRequestException('Search term is required');
      }

      const userFilters = {
        userRole: req.user.role,
        userGrade: req.user.grade,
        userClass: req.user.class
      };

      return await this.calendarService.searchEvents(
        req.user.schoolId,
        req.user.academicYear,
        searchTerm,
        userFilters
      );
    } catch (error) {
      throw new BadRequestException('Failed to search events');
    }
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getEventStatistics(@Request() req) {
    try {
      return await this.calendarService.getEventStatistics(
        req.user.schoolId,
        req.user.academicYear
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch event statistics');
    }
  }

  @Get('category/:category')
  async getEventsByCategory(@Request() req, @Param('category') category: string) {
    try {
      return await this.calendarService.getEventsByCategory(
        req.user.schoolId,
        req.user.academicYear,
        category
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch events by category');
    }
  }

  @Get('date-range')
  async getEventsByDateRange(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    try {
      if (!startDate || !endDate) {
        throw new BadRequestException('Start date and end date are required');
      }

      const userFilters = {
        userRole: req.user.role,
        userGrade: req.user.grade,
        userClass: req.user.class
      };

      return await this.calendarService.getEventsByDateRange(
        req.user.schoolId,
        req.user.academicYear,
        new Date(startDate),
        new Date(endDate),
        userFilters
      );
    } catch (error) {
      throw new BadRequestException('Failed to fetch events by date range');
    }
  }

  @Get('conflicts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getConflictingEvents(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('location') location?: string,
    @Query('excludeEventId') excludeEventId?: string
  ) {
    try {
      if (!startDate || !endDate) {
        throw new BadRequestException('Start date and end date are required');
      }

      return await this.calendarService.getConflictingEvents(
        req.user.schoolId,
        new Date(startDate),
        new Date(endDate),
        location,
        excludeEventId
      );
    } catch (error) {
      throw new BadRequestException('Failed to check for conflicting events');
    }
  }

  @Get(':id')
  async getEventById(@Param('id') eventId: string) {
    try {
      return await this.calendarService.getEventById(eventId);
    } catch (error) {
      throw new BadRequestException('Failed to fetch event');
    }
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateEvent(
    @Request() req,
    @Param('id') eventId: string,
    @Body() updateData: any
  ) {
    try {
      return await this.calendarService.updateEvent(
        eventId,
        updateData,
        req.user.userId
      );
    } catch (error) {
      throw new BadRequestException('Failed to update event');
    }
  }

  @Put(':id/publish')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async publishEvent(@Request() req, @Param('id') eventId: string) {
    try {
      return await this.calendarService.publishEvent(eventId, req.user.userId);
    } catch (error) {
      throw new BadRequestException('Failed to publish event');
    }
  }

  @Put(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async cancelEvent(@Request() req, @Param('id') eventId: string) {
    try {
      return await this.calendarService.cancelEvent(eventId, req.user.userId);
    } catch (error) {
      throw new BadRequestException('Failed to cancel event');
    }
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteEvent(@Param('id') eventId: string) {
    try {
      return await this.calendarService.deleteEvent(eventId);
    } catch (error) {
      throw new BadRequestException('Failed to delete event');
    }
  }

  @Post('recurring')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createRecurringEvent(
    @Request() req,
    @Body() body: {
      eventData: any;
      recurrencePattern: {
        type: 'daily' | 'weekly' | 'monthly';
        interval: number;
        endDate: string;
        daysOfWeek?: number[];
        dayOfMonth?: number;
      };
    }
  ) {
    try {
      const { eventData, recurrencePattern } = body;
      
      if (!recurrencePattern.type || !recurrencePattern.interval || !recurrencePattern.endDate) {
        throw new BadRequestException('Invalid recurrence pattern');
      }

      const pattern = {
        ...recurrencePattern,
        endDate: new Date(recurrencePattern.endDate)
      };

      return await this.calendarService.createRecurringEvent(
        eventData,
        pattern,
        req.user.userId
      );
    } catch (error) {
      throw new BadRequestException('Failed to create recurring event');
    }
  }
}
