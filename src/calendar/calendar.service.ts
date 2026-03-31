import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchoolEvent, SchoolEventDocument } from './schema/school-event.schema';

@Injectable()
export class CalendarService {
  constructor(
    @InjectModel(SchoolEvent.name) private schoolEventModel: Model<SchoolEventDocument>,
  ) {}

  async createEvent(eventData: any, createdBy: string): Promise<SchoolEvent> {
    const event = new this.schoolEventModel({
      ...eventData,
      createdBy,
    });

    return event.save();
  }

  async getEvents(
    schoolId: string,
    academicYear: string,
    filters?: {
      category?: string;
      audience?: string;
      startDate?: Date;
      endDate?: Date;
      status?: string;
      userRole?: string;
      userGrade?: string;
      userClass?: string;
    }
  ): Promise<SchoolEvent[]> {
    const query: any = { 
      schoolId, 
      academicYear,
      status: 'published' // Only show published events by default
    };

    if (filters?.category) {
      query.category = filters.category;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.startDate && filters?.endDate) {
      query.$or = [
        // Events that start within the range
        {
          startDate: {
            $gte: filters.startDate,
            $lte: filters.endDate
          }
        },
        // Events that end within the range
        {
          endDate: {
            $gte: filters.startDate,
            $lte: filters.endDate
          }
        },
        // Events that span the entire range
        {
          startDate: { $lte: filters.startDate },
          endDate: { $gte: filters.endDate }
        }
      ];
    }

    // Filter based on audience
    if (filters?.audience) {
      query.audience = filters.audience;
    } else if (filters?.userRole) {
      // Apply audience filtering based on user role
      const audienceQuery: any[] = [
        { audience: 'school-wide' }
      ];

      if (filters.userRole === 'parent') {
        audienceQuery.push({ audience: 'parent-only' });
      } else if (filters.userRole === 'teacher' || filters.userRole === 'admin') {
        audienceQuery.push({ audience: 'staff-only' });
      }

      if (filters.userGrade) {
        audienceQuery.push({
          audience: 'grade-specific',
          targetGrades: { $in: [filters.userGrade] }
        });
      }

      if (filters.userClass) {
        audienceQuery.push({
          audience: 'class-specific',
          targetClasses: { $in: [filters.userClass] }
        });
      }

      query.$or = query.$or ? 
        { $and: [{ $or: query.$or }, { $or: audienceQuery }] } : 
        { $or: audienceQuery };
    }

    return this.schoolEventModel
      .find(query)
      .populate('createdBy', 'firstName lastName role')
      .populate('updatedBy', 'firstName lastName role')
      .sort({ startDate: 1, startTime: 1 })
      .exec();
  }

  async getEventById(eventId: string): Promise<SchoolEvent> {
    const event = await this.schoolEventModel
      .findById(eventId)
      .populate('createdBy', 'firstName lastName role')
      .populate('updatedBy', 'firstName lastName role')
      .exec();

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async updateEvent(eventId: string, updateData: any, updatedBy: string): Promise<SchoolEvent> {
    const event = await this.schoolEventModel.findByIdAndUpdate(
      eventId,
      { ...updateData, updatedBy },
      { new: true }
    ).populate('createdBy', 'firstName lastName role')
     .populate('updatedBy', 'firstName lastName role');

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async deleteEvent(eventId: string): Promise<{ message: string }> {
    const result = await this.schoolEventModel.findByIdAndUpdate(
      eventId,
      { status: 'cancelled' },
      { new: true }
    );

    if (!result) {
      throw new NotFoundException('Event not found');
    }

    return { message: 'Event cancelled successfully' };
  }

  async getEventsByCategory(
    schoolId: string,
    academicYear: string,
    category: string
  ): Promise<SchoolEvent[]> {
    return this.schoolEventModel
      .find({
        schoolId,
        academicYear,
        category,
        status: 'published'
      })
      .populate('createdBy', 'firstName lastName role')
      .sort({ startDate: 1 })
      .exec();
  }

  async getUpcomingEvents(
    schoolId: string,
    academicYear: string,
    limit: number = 10,
    userFilters?: any
  ): Promise<SchoolEvent[]> {
    const now = new Date();
    
    return this.getEvents(schoolId, academicYear, {
      ...userFilters,
      startDate: now,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
    }).then(events => events.slice(0, limit));
  }

  async getEventsByDateRange(
    schoolId: string,
    academicYear: string,
    startDate: Date,
    endDate: Date,
    userFilters?: any
  ): Promise<SchoolEvent[]> {
    return this.getEvents(schoolId, academicYear, {
      ...userFilters,
      startDate,
      endDate
    });
  }

  async searchEvents(
    schoolId: string,
    academicYear: string,
    searchTerm: string,
    userFilters?: any
  ): Promise<SchoolEvent[]> {
    const query: any = {
      schoolId,
      academicYear,
      status: 'published',
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { location: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    // Apply user-specific filters
    if (userFilters?.userRole) {
      const audienceQuery: any[] = [
        { audience: 'school-wide' }
      ];

      if (userFilters.userRole === 'parent') {
        audienceQuery.push({ audience: 'parent-only' });
      } else if (userFilters.userRole === 'teacher' || userFilters.userRole === 'admin') {
        audienceQuery.push({ audience: 'staff-only' });
      }

      if (userFilters.userGrade) {
        audienceQuery.push({
          audience: 'grade-specific',
          targetGrades: { $in: [userFilters.userGrade] }
        });
      }

      if (userFilters.userClass) {
        audienceQuery.push({
          audience: 'class-specific',
          targetClasses: { $in: [userFilters.userClass] }
        });
      }

      query.$and = [
        { $or: query.$or },
        { $or: audienceQuery }
      ];
    }

    return this.schoolEventModel
      .find(query)
      .populate('createdBy', 'firstName lastName role')
      .sort({ startDate: 1 })
      .exec();
  }

  async getEventStatistics(
    schoolId: string,
    academicYear: string
  ): Promise<{
    total: number;
    byCategory: { [key: string]: number };
    byMonth: { [key: string]: number };
    upcoming: number;
  }> {
    const events = await this.schoolEventModel.find({
      schoolId,
      academicYear,
      status: 'published'
    });

    const stats = {
      total: events.length,
      byCategory: {} as { [key: string]: number },
      byMonth: {} as { [key: string]: number },
      upcoming: 0
    };

    const now = new Date();

    events.forEach(event => {
      // Category stats
      stats.byCategory[event.category] = (stats.byCategory[event.category] || 0) + 1;

      // Month stats
      const month = event.startDate.toLocaleString('default', { month: 'long' });
      stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

      // Upcoming events
      if (event.startDate >= now) {
        stats.upcoming++;
      }
    });

    return stats;
  }

  async createRecurringEvent(
    eventData: any,
    recurrencePattern: {
      type: 'daily' | 'weekly' | 'monthly';
      interval: number; // Every N days/weeks/months
      endDate: Date;
      daysOfWeek?: number[]; // For weekly: 0=Sunday, 1=Monday, etc.
      dayOfMonth?: number; // For monthly
    },
    createdBy: string
  ): Promise<SchoolEvent[]> {
    const events: SchoolEvent[] = [];
    let currentDate = new Date(eventData.startDate);
    const endRecurrence = new Date(recurrencePattern.endDate);

    while (currentDate <= endRecurrence) {
      const eventEndDate = new Date(currentDate);
      eventEndDate.setTime(currentDate.getTime() + (new Date(eventData.endDate).getTime() - new Date(eventData.startDate).getTime()));

      const event = new this.schoolEventModel({
        ...eventData,
        startDate: new Date(currentDate),
        endDate: eventEndDate,
        createdBy,
      });

      const savedEvent = await event.save();
      events.push(savedEvent);

      // Calculate next occurrence
      switch (recurrencePattern.type) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + recurrencePattern.interval);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + (7 * recurrencePattern.interval));
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + recurrencePattern.interval);
          break;
      }
    }

    return events;
  }

  async publishEvent(eventId: string, publishedBy: string): Promise<SchoolEvent> {
    return this.updateEvent(eventId, { status: 'published' }, publishedBy);
  }

  async cancelEvent(eventId: string, cancelledBy: string): Promise<SchoolEvent> {
    return this.updateEvent(eventId, { status: 'cancelled' }, cancelledBy);
  }

  async getConflictingEvents(
    schoolId: string,
    startDate: Date,
    endDate: Date,
    location?: string,
    excludeEventId?: string
  ): Promise<SchoolEvent[]> {
    const query: any = {
      schoolId,
      status: { $ne: 'cancelled' },
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate }
        }
      ]
    };

    if (location) {
      query.location = location;
    }

    if (excludeEventId) {
      query._id = { $ne: excludeEventId };
    }

    return this.schoolEventModel.find(query).exec();
  }
}
