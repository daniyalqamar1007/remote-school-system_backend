import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Guardian } from './schema/guardian.schema';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class GuardianService {
  constructor(@InjectModel(Guardian.name) private guardianModel: Model<Guardian>) {}

  async create(createGuardianDto: CreateGuardianDto): Promise<Guardian> {
    const hashedPassword = await bcrypt.hash('123', 10); // Default password
    const guardian = new this.guardianModel({...createGuardianDto,password:hashedPassword});
    return guardian.save();
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const totalRecordsCount = await this.guardianModel.countDocuments();
    const students = await this.guardianModel
      .find()
      .populate('guardian')
      .skip(skip)
      .limit(limit)
      .exec();

    return {
      data: students,
      totalPages: Math.ceil(totalRecordsCount / limit),
      totalRecordsCount,
      currentPage: page,
      limit,
    };
  }

  async findByEmail(email: string) {
    return this.guardianModel.findOne({ email });
  }

  async findOne(id: string): Promise<Guardian> {
    return this.guardianModel.findById(id).exec();
  }

  async delete(id: string): Promise<void> {
  await this.guardianModel.findByIdAndDelete(id);
  }

  async update(id: string, updateGuardianDto: any): Promise<void> {
    await this.guardianModel.findByIdAndUpdate(id, updateGuardianDto);
  }
  
  
}
