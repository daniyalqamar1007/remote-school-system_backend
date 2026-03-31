import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from './schema/schema.activity';
import { CreateActivityDto } from './dto/create-activity.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
  ) {}

  async create(createActivityDto: CreateActivityDto): Promise<Activity> {
    const activity = new this.activityModel(createActivityDto);
    return activity.save();
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    title?: string,
    performBy?: string,
    className?: string,
    section?: string,
    type?: string,
    actorId?: string,
    role?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    totalRecords: number;
    totalPages: number;
    currentPage: number;
    currentLimit: number;
    data: Activity[];
  }> {
    // Ensure limit is a valid number and not too large
    limit = Math.min(Math.max(parseInt(String(limit)) || 10, 1), 1000);
    page = Math.max(parseInt(String(page)) || 1, 1);

    const filter: any = {};
    filter.$and = [
      {
        $or: [
          { actorId: { $exists: true, $ne: null } },
          { adminId: { $exists: true, $ne: null } },
          { teacherId: { $exists: true, $ne: null } },
        ],
      },
    ];

    if (title) filter.title = { $regex: title, $options: 'i' };
    if (performBy) filter.performBy = performBy;
    if (className) filter.className = className;
    if (section) filter.section = section;
    if (type) filter.type = type;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDateObj;
      }
    }
    
    if (actorId && role) {
      let actorObjectId: Types.ObjectId | string = actorId;
      if (Types.ObjectId.isValid(actorId)) {
        actorObjectId = new Types.ObjectId(actorId);
      }
      let actorOr: any[] = [];
      switch (role) {
        case 'TEACHER':
          actorOr = [
            { actorId: actorObjectId },
            { actorId: actorId },
            { teacherId: actorId },
            { teacherId: actorObjectId },
          ];
          break;
        case 'ADMIN':
        case 'SUPER_ADMIN':
          actorOr = [
            { adminId: actorObjectId },
            { adminId: actorId },
            { actorId: actorObjectId },
            { actorId: actorId },
          ];
          break;
        default:
          actorOr = [
            { actorId: actorObjectId },
            { actorId: actorId },
          ];
          break;
      }
      filter.$and.push({ $or: actorOr });
    }

    const totalRecords = await this.activityModel.countDocuments(filter);
    const totalPages = Math.ceil(totalRecords / limit);

    const data = await this.activityModel
      .find(filter)
      .populate('actorId', 'firstName lastName email role')
      .populate('adminId', 'firstName lastName email role')
      .populate('teacherId', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    return {
      totalRecords,
      totalPages,
      currentPage: page,
      currentLimit: limit,
      data,
    };
  }

  async findOne(id: string): Promise<Activity> {
    return this.activityModel.findById(id).exec();
  }

  async delete(id: string): Promise<Activity> {
    return this.activityModel.findByIdAndDelete(id).exec();
  }
}