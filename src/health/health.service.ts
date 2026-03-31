import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HealthProfile } from './schema/health-profile.schema';
import { ImmunizationRecord } from './schema/immunization.schema';
import { MedicationLog } from './schema/medication-log.schema';
import { NurseVisit } from './schema/nurse-visit.schema';
import { AuditLog } from '../super-admin/schemas/audit-log.schema';
import { MedicalDocument } from './schema/medical-document.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';

@Injectable()
export class HealthService {
  constructor(
    @InjectModel(HealthProfile.name) private readonly profileModel: Model<HealthProfile>,
    @InjectModel(ImmunizationRecord.name) private readonly immunizationModel: Model<ImmunizationRecord>,
    @InjectModel(MedicationLog.name) private readonly medicationLogModel: Model<MedicationLog>,
    @InjectModel(NurseVisit.name) private readonly nurseVisitModel: Model<NurseVisit>,
    @InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>,
    @InjectModel(MedicalDocument.name) private readonly medicalDocumentModel: Model<MedicalDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async audit(action: string, entity: string, entityId: string, actorId?: string) {
    await this.auditModel.create({ 
      action, 
      entityType: entity,
      entityId,
      performedBy: actorId || 'SYSTEM',
      performedByRole: 'NURSE',
      description: `${action} ${entity} record`,
      timestamp: new Date()
    });
  }

  // Helper method to validate school access
  private async validateSchoolAccess(studentId: string, userSchoolId?: string): Promise<void> {
    if (!userSchoolId) return; // Super admin has access to all

    const student = await this.userModel.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.schoolId?.toString() !== userSchoolId) {
      throw new ForbiddenException('Access denied: Student not in your school');
    }
  }

  // Profiles
  async getHealthProfile(studentId: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    return this.profileModel.findOne({ studentId });
  }

  async upsertHealthProfile(studentId: string, data: any, actorId?: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const updated = await this.profileModel.findOneAndUpdate(
      { studentId },
      { $set: { ...data, studentId } },
      { upsert: true, new: true },
    );
    await this.audit('UPSERT', 'HealthProfile', String(updated._id), actorId);
    return updated;
  }

  // Allergies
  async getAllergies(studentId: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const profile = await this.profileModel.findOne({ studentId }).select('allergies');
    return profile?.allergies ?? [];
  }

  async updateAllergies(studentId: string, allergies: string[], actorId?: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const updated = await this.profileModel.findOneAndUpdate(
      { studentId },
      { $set: { allergies, studentId } },
      { upsert: true, new: true },
    );
    await this.audit('UPDATE', 'Allergies', String(updated._id), actorId);
    return updated;
  }

  // Immunizations
  async getImmunizations(studentId: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    return this.immunizationModel.find({ studentId }).sort({ date: -1 });
  }

  async addImmunization(studentId: string, data: any, actorId?: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const doc = await this.immunizationModel.create({ ...data, studentId });
    await this.audit('CREATE', 'Immunization', String(doc._id), actorId);
    return doc;
  }

  // Medications
  async getMedicationLogs(studentId: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    return this.medicationLogModel.find({ studentId }).sort({ dateTime: -1 });
  }

  async addMedicationLog(studentId: string, data: any, actorId?: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const doc = await this.medicationLogModel.create({ ...data, studentId });
    await this.audit('CREATE', 'MedicationLog', String(doc._id), actorId);
    return doc;
  }

  // Nurse visits
  async getNurseVisits(studentId: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    return this.nurseVisitModel.find({ studentId }).sort({ visitDateTime: -1 });
  }

  async addNurseVisit(studentId: string, data: any, actorId?: string, userSchoolId?: string) {
    await this.validateSchoolAccess(studentId, userSchoolId);
    const doc = await this.nurseVisitModel.create({ ...data, studentId });
    await this.audit('CREATE', 'NurseVisit', String(doc._id), actorId);
    return doc;
  }

  // Reports (basic dataset; PDF generation handled in controller later if needed)
  async generateVisitsReport(date?: string) {
    const filter: any = {};
    if (date) filter.date = date;
    return this.nurseVisitModel.find(filter).sort({ visitDateTime: -1 });
  }

  async generateMedicationsReport(date?: string) {
    const filter: any = {};
    if (date) filter.date = date;
    return this.medicationLogModel.find(filter).sort({ dateTime: -1 });
  }

  async generateImmunizationsReport() {
    return this.immunizationModel.find().sort({ date: -1 });
  }

  // Medical Documents
  async getMedicalDocuments(studentId: string) {
    return this.medicalDocumentModel.find({ studentId }).sort({ createdAt: -1 });
  }

  async getMedicalDocumentsByType(studentId: string, type: string) {
    return this.medicalDocumentModel.find({ studentId, type }).sort({ createdAt: -1 });
  }

  async createMedicalDocument(data: any, actorId?: string) {
    const doc = await this.medicalDocumentModel.create(data);
    await this.audit('CREATE', 'MedicalDocument', String(doc._id), actorId);
    return doc;
  }

  async updateMedicalDocument(documentId: string, data: any, actorId?: string) {
    const updated = await this.medicalDocumentModel.findByIdAndUpdate(
      documentId,
      { $set: data },
      { new: true }
    );
    await this.audit('UPDATE', 'MedicalDocument', documentId, actorId);
    return updated;
  }

  async deleteMedicalDocument(documentId: string, actorId?: string) {
    const deleted = await this.medicalDocumentModel.findByIdAndDelete(documentId);
    await this.audit('DELETE', 'MedicalDocument', documentId, actorId);
    return deleted;
  }

  async getMedicalDocumentsByParent(parentId: string) {
    // Get all students for this parent, then their medical documents
    const ParentModel = this.medicalDocumentModel.db.model('Parent') as Model<any>;
    const parent = await ParentModel.findById(parentId).populate('children');
    
    if (!parent) return [];
    
    const studentIds = parent.children?.map((child: any) => 
      typeof child === 'string' ? child : child._id
    ) || [];

    if (studentIds.length === 0) return [];

    return this.medicalDocumentModel
      .find({ studentId: { $in: studentIds } })
      .populate('studentId', 'firstName lastName class section')
      .sort({ createdAt: -1 });
  }

  async getHealthConditions(studentId: string) {
    // Get both allergies and medical conditions
    const profile = await this.profileModel.findOne({ studentId });
    const medicalDocs = await this.medicalDocumentModel.find({ 
      studentId, 
      type: { $in: ['health_plan_iep', 'health_plan_504'] },
      status: 'approved'
    });

    return {
      allergies: profile?.allergies || [],
      medicalConditions: profile?.medicalConditions || [],
      healthPlans: medicalDocs.map(doc => ({
        type: doc.type,
        title: doc.title,
        accommodations: doc.accommodations || [],
        goals: doc.goals || [],
        classification: doc.classification,
        startDate: doc.planStartDate,
        endDate: doc.planEndDate
      }))
    };
  }

  async addHealthCondition(studentId: string, condition: string, actorId?: string) {
    // Add to medical conditions array
    const updated = await this.profileModel.findOneAndUpdate(
      { studentId },
      { 
        $addToSet: { medicalConditions: condition },
        $setOnInsert: { studentId }
      },
      { upsert: true, new: true }
    );
    await this.audit('ADD_CONDITION', 'HealthProfile', String(updated._id), actorId);
    return updated;
  }

  async removeHealthCondition(studentId: string, condition: string, actorId?: string) {
    const updated = await this.profileModel.findOneAndUpdate(
      { studentId },
      { $pull: { medicalConditions: condition } },
      { new: true }
    );
    await this.audit('REMOVE_CONDITION', 'HealthProfile', String(updated._id), actorId);
    return updated;
  }
}


