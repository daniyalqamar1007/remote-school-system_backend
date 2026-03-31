// src/behavior/behavior.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Behavior } from './schema/behavior.schema';
import { CreateBehaviorDto } from './dto/create-behavior.dto';
import { UpdateBehaviorDto } from './dto/update-behavior.dto';

@Injectable()
export class BehaviorService {
  constructor(
    @InjectModel(Behavior.name) private behaviorModel: Model<Behavior>,
  ) {}

  async create(dto: CreateBehaviorDto) {
    const created = new this.behaviorModel(dto);
    return created.save();
  }

  async findAll(studentId?: string) {
    const filter: any = {};
    if (studentId) filter.studentId = studentId;
    return this.behaviorModel
      .find(filter)
      .populate('studentId', 'firstName lastName class section profilePhoto email')
      .populate('teacherId', 'firstName lastName email subject')
      .sort({ date: -1 })
      .exec();
  }

  async findOne(id: string) {
    const incident = await this.behaviorModel
      .findById(id)
      .populate('studentId', 'firstName lastName class section profilePhoto email')
      .populate('teacherId', 'firstName lastName email subject');
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async update(id: string, dto: UpdateBehaviorDto) {
    const updated = await this.behaviorModel.findByIdAndUpdate(id, dto, { new: true });
    if (!updated) throw new NotFoundException('Incident not found');
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.behaviorModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Incident not found');
    return { message: 'Deleted successfully' };
  }
}