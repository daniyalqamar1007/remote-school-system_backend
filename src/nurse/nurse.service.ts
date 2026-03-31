import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema as MongooseSchema, Types } from 'mongoose';
import { Nurse } from './schema/nurse.schema';
import { HealthRecord, HealthRecordDocument } from './schema/health-record.schema';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { SportsProgram, SportsProgramDocument } from '../sports/schema/sports-program.schema';
import { AwsService } from '../aws/aws.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class NurseService {
  constructor(
    @InjectModel(Nurse.name) private readonly nurseModel: Model<Nurse>,
    @InjectModel(HealthRecord.name) private readonly healthRecordModel: Model<HealthRecordDocument>,
    @InjectModel(StudentProfile.name) private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SportsProgram.name) private readonly sportsProgramModel: Model<SportsProgramDocument>,
    @Inject(AwsService) private readonly awsService: AwsService,
  ) { }

  async create(data: Partial<Nurse>) {
    try {
      // This method is deprecated - nurse creation is now handled by admin.service.ts
      // Keeping for backward compatibility but it should not be used
      console.warn('⚠️ NurseService.create() is deprecated. Use AdminService.createNurse() instead.');
      throw new BadRequestException('Nurse creation should be done through AdminService');
    } catch (error) {
      console.error('❌ Error saving nurse:', error.message, error);
      throw error;
    }
  }

  async findByEmail(email: string) {
    // Find nurse by email in User model (since email is now in User table)
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      role: 'NURSE',
      isActive: true
    }).lean();

    if (!user) return null;

    // Get nurse-specific data
    const nurseInfo = await this.nurseModel.findOne({ userId: user._id }).lean();

    return nurseInfo ? { ...user, ...nurseInfo } : user;
  }

  async validateNurse(data: { email: string; password: string }) {
    // Validate nurse using User model (since email and password are in User table)
    const user = await this.userModel.findOne({
      email: data.email.toLowerCase(),
      role: 'NURSE',
      isActive: true
    }).lean();

    if (!user) return null;

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) return null;

    // Get nurse-specific data
    const nurseInfo = await this.nurseModel.findOne({ userId: user._id }).lean();

    return nurseInfo ? { ...user, ...nurseInfo } : user;
  }

  async findAll() {
    // Find all nurses from User model and join with Nurse model
    const users = await this.userModel.find({
      role: 'NURSE',
      isActive: true
    }, '-password').lean();

    const nursesWithInfo = await Promise.all(
      users.map(async (user) => {
        const nurseInfo = await this.nurseModel.findOne({ userId: user._id }).lean();
        return nurseInfo ? { ...user, ...nurseInfo } : user;
      })
    );

    return nursesWithInfo;
  }

  async getSchoolIdForUser(userId: string): Promise<string | null> {
    const user = await this.userModel.findById(userId).select('schoolId').lean().exec();
    if (!user || !(user as any).schoolId) return null;
    const raw = (user as any).schoolId;
    return typeof raw === 'object' && raw?._id != null ? String(raw._id) : String(raw);
  }

  // ==================== STUDENT MANAGEMENT FOR NURSE ====================

  async getStudentsBySchool(schoolId: string, filters?: any): Promise<any> {
    try {
      // Validate schoolId
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        role: UserRole.STUDENT,
        isActive: true
      };

      if (filters?.search) {
        query.$or = [
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } },
          { studentId: { $regex: filters.search, $options: 'i' } },
        ];
      }

      if (filters?.gradeLevel) {
        query.class = filters.gradeLevel;
      }

      if (filters?.healthStatus) {
        // Health status is computed, so we'll filter after fetching
        // For now, store it in query for later filtering
        query._healthStatusFilter = filters.healthStatus;
      }

      // Pagination
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      console.log("query:", query);

      // Get total count
      const totalCount = await this.userModel.countDocuments(query);

      // Get students with pagination - POPULATE StudentProfile
      const students = await this.userModel
        .find(query, '-password')
        .populate('studentProfileId', 'firstName lastName gradeLevel dateOfBirth')
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Helper function to calculate age from dateOfBirth
      const calculateAge = (dateOfBirth: Date | string | undefined): number | null => {
        if (!dateOfBirth) return null;
        const dob = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        return age;
      };

      // Get health records for each student
      let studentsWithHealth = await Promise.all(
        students.map(async (student) => {
          try {
            const healthRecord = await this.healthRecordModel.findOne({
              studentId: student._id
            }).lean();

            // Count medications from both medications array and medicationLog
            const medicationsArrayCount = healthRecord?.medications?.length || 0;
            const activeMedicationLogCount = healthRecord?.medicationLog?.filter(med => med.isActive)?.length || 0;
            const totalMedications = medicationsArrayCount + activeMedicationLogCount;

            const studentProfile = (student as any).studentProfileId;
            const dateOfBirth = studentProfile?.dateOfBirth ?? (student as any).dateOfBirth ?? (student as any).dob;
            const computedAge = calculateAge(dateOfBirth);
            const age = healthRecord?.studentAge != null ? healthRecord.studentAge : computedAge;

            return {
              ...student,
              age: age,
              dateOfBirth: dateOfBirth,
              gradeLevel: studentProfile?.gradeLevel || student.class,
              healthStatus: this.getHealthStatus(healthRecord),
              hasHealthRecord: !!healthRecord,
              lastNurseVisit: healthRecord?.nurseVisits?.length > 0
                ? healthRecord.nurseVisits[healthRecord.nurseVisits.length - 1]?.visitDate
                : null,
              activeAlerts: healthRecord?.healthAlerts?.filter(alert => alert.isActive)?.length || 0,
              activeMedications: totalMedications
            };
          } catch (error) {
            console.error(`Error processing health record for student ${student._id}:`, error);
            return {
              ...student,
              age: null,
              healthStatus: 'No Record',
              hasHealthRecord: false,
              lastNurseVisit: null,
              activeAlerts: 0,
              activeMedications: 0
            };
          }
        })
      );

      // Filter by health status if provided
      const healthStatusFilter = query._healthStatusFilter;
      if (healthStatusFilter) {
        studentsWithHealth = studentsWithHealth.filter(
          student => student.healthStatus === healthStatusFilter
        );
      }

      // Recalculate total after health status filter
      const finalTotal = healthStatusFilter
        ? studentsWithHealth.length
        : totalCount;

      return {
        students: studentsWithHealth,
        pagination: {
          total: finalTotal,
          page: page,
          limit: limit,
          totalPages: Math.ceil(finalTotal / limit)
        }
      };
    } catch (error) {
      console.error('Error in getStudentsBySchool:', error);
      throw error;
    }
  }

  async getStudentById(studentId: string, schoolId?: string): Promise<any> {
    try {
      // Validate studentId
      if (!studentId) {
        throw new BadRequestException('Student ID is required');
      }

      const query: any = {
        _id: new Types.ObjectId(studentId),
        role: 'STUDENT',
        isActive: true
      };

      // Add school validation if schoolId is provided (for school-scoped access)
      if (schoolId) {
        query.schoolId = new Types.ObjectId(schoolId);
      }

      // POPULATE StudentProfile to get gradeLevel and dateOfBirth
      const student = await this.userModel
        .findOne(query, '-password')
        .populate('studentProfileId', 'firstName lastName gradeLevel dateOfBirth')
        .lean();

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      // Helper function to calculate age from dateOfBirth
      const calculateAge = (dateOfBirth: Date | string | undefined): number | null => {
        if (!dateOfBirth) return null;
        const dob = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        return age;
      };

      // Get health record for the student
      try {
        const healthRecord = await this.healthRecordModel.findOne({
          studentId: student._id
        }).lean();

        const studentProfile = (student as any).studentProfileId;
        const dateOfBirth = studentProfile?.dateOfBirth ?? (student as any).dateOfBirth ?? (student as any).dob;
        const computedAge = calculateAge(dateOfBirth);
        const age = healthRecord?.studentAge != null ? healthRecord.studentAge : computedAge;

        return {
          ...student,
          age: age,
          dateOfBirth: dateOfBirth,
          gradeLevel: studentProfile?.gradeLevel || student.class,
          healthRecord: healthRecord || null,
          hasHealthRecord: !!healthRecord,
          healthStatus: this.getHealthStatus(healthRecord)
        };
      } catch (healthError) {
        console.warn('Error fetching health record for student:', studentId, healthError);
        const studentProfile = (student as any).studentProfileId;
        const dateOfBirth = studentProfile?.dateOfBirth ?? (student as any).dateOfBirth ?? (student as any).dob;
        const calculateAgeLocal = (dob: Date | string | undefined): number | null => {
          if (!dob) return null;
          const d = new Date(dob);
          const today = new Date();
          let age = today.getFullYear() - d.getFullYear();
          const monthDiff = today.getMonth() - d.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) {
            age--;
          }
          return age;
        };
        return {
          ...student,
          age: calculateAgeLocal(dateOfBirth),
          dateOfBirth: dateOfBirth,
          gradeLevel: studentProfile?.gradeLevel || student.class,
          healthRecord: null,
          hasHealthRecord: false
        };
      }
    } catch (error) {
      console.error('Error in getStudentById:', error);
      throw error;
    }
  }

  async getDashboardStats(schoolId: string): Promise<any> {
    try {
      // Validate schoolId
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const totalStudents = await this.userModel.countDocuments({
        schoolId: new Types.ObjectId(schoolId),
        role: 'STUDENT',
        isActive: true
      });

      const healthRecords = await this.healthRecordModel.find({
        schoolId: new Types.ObjectId(schoolId)
      }).lean();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      let todayVisits = 0;
      let weekVisits = 0;
      let activeAlerts = 0;
      let activeMedications = 0;
      let immunizationsDue = 0;
      let studentsWithAllergies = 0;
      let studentsWithMedicalConditions = 0;

      healthRecords.forEach(record => {
        try {
          // Count today's visits
          const todayVisitsCount = record.nurseVisits?.filter(visit => {
            const visitDate = new Date(visit.visitDate);
            return visitDate >= todayStart && visitDate <= todayEnd;
          }).length || 0;
          todayVisits += todayVisitsCount;

          // Count this week's visits
          const weekVisitsCount = record.nurseVisits?.filter(visit => {
            const visitDate = new Date(visit.visitDate);
            return visitDate >= weekStart && visitDate <= todayEnd;
          }).length || 0;
          weekVisits += weekVisitsCount;

          // Count active alerts
          const alertsCount = record.healthAlerts?.filter(alert => alert.isActive).length || 0;
          activeAlerts += alertsCount;

          // Count active medications
          const medicationsCount = record.medicationLog?.filter(med => med.isActive).length || 0;
          activeMedications += medicationsCount;

          // Count students with allergies
          if (record.allergies && record.allergies.length > 0) {
            studentsWithAllergies++;
          }

          // Count students with medical conditions
          if (record.medicalConditions && record.medicalConditions.length > 0) {
            studentsWithMedicalConditions++;
          }

          // Count immunizations due (within next 30 days)
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          if (record.immunizations) {
            record.immunizations.forEach((immunization: any) => {
              if (immunization.nextDueDate) {
                const dueDate = new Date(immunization.nextDueDate);
                if (dueDate >= new Date() && dueDate <= nextMonth) {
                  immunizationsDue++;
                }
              }
            });
          }
        } catch (error) {
          console.error(`Error processing health record stats for record ${record._id}:`, error);
        }
      });

      return {
        totalStudents,
        activeAlerts,
        todayVisits,
        weekVisits,
        activeMedications,
        studentsWithHealthRecords: healthRecords.length,
        immunizationsDue,
        studentsWithAllergies,
        studentsWithMedicalConditions
      };
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      throw error;
    }
  }

  private getHealthStatus(healthRecord: any): string {
    if (!healthRecord) return 'No Record';

    const activeAlerts = healthRecord.healthAlerts?.filter(alert => alert.isActive) || [];
    const highPriorityAlerts = activeAlerts.filter(alert =>
      alert.severity === 'high' || alert.severity === 'critical'
    );

    if (highPriorityAlerts.length > 0) return 'High Risk';
    if (activeAlerts.length > 0) return 'Has Alerts';

    const activeMeds = healthRecord.medicationLog?.filter(med => med.isActive) || [];
    if (activeMeds.length > 0) return 'On Medication';

    return 'Healthy';
  }


  async resetPassword(id: string): Promise<boolean> {
    return true;
  }

  // ==================== HEALTH RECORD MANAGEMENT ====================

  async createHealthRecord(studentId: string, healthData: any, createdBy: string): Promise<HealthRecord> {
    const student = await this.userModel.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const existingRecord = await this.healthRecordModel.findOne({
      studentId,
      academicYear: healthData.academicYear
    });

    if (existingRecord) {
      throw new BadRequestException('Health record already exists for this student and academic year');
    }

    // Prepare immunizations data
    const immunizationsData = healthData.immunizations && Array.isArray(healthData.immunizations)
      ? healthData.immunizations.map((imm: any) => ({
        vaccineName: imm.vaccineName,
        dateAdministered: imm.dateAdministered ? new Date(imm.dateAdministered) : new Date(),
        administratorName: imm.administratorName || '',
        batchNumber: imm.batchNumber || '',
        nextDueDate: imm.nextDueDate ? new Date(imm.nextDueDate) : null,
      }))
      : [];

    const healthRecord = new this.healthRecordModel({
      ...healthData,
      studentId,
      schoolId: student.schoolId,
      immunizations: immunizationsData,
      createdBy
    });
    if (healthData.studentAge != null && healthData.studentAge !== '') {
      healthRecord.studentAge = Number(healthData.studentAge);
    }
    return await healthRecord.save();
  }

  async getHealthRecord(studentId: string, academicYear?: string): Promise<HealthRecord | null> {
    const query: any = { studentId };
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const record = await this.healthRecordModel
      .findOne(query)
      .populate('studentId', 'firstName lastName gradeLevel dateOfBirth dob')
      .sort({ createdAt: -1 });

    return record;
  }

  async updateHealthRecord(studentId: string, updateData: any, updatedBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy: updatedBy
      });
    }

    // Update fields, preserving arrays if not provided
    if (updateData.academicYear) record.academicYear = updateData.academicYear;
    if (updateData.medicalConditions !== undefined) record.medicalConditions = updateData.medicalConditions;
    if (updateData.allergies !== undefined) record.allergies = updateData.allergies;
    if (updateData.medications !== undefined) record.medications = updateData.medications;
    if (updateData.emergencyContactName !== undefined) record.emergencyContactName = updateData.emergencyContactName;
    if (updateData.emergencyContactPhone !== undefined) record.emergencyContactPhone = updateData.emergencyContactPhone;
    if (updateData.emergencyContactRelation !== undefined) record.emergencyContactRelation = updateData.emergencyContactRelation;
    if (updateData.physicianName !== undefined) record.physicianName = updateData.physicianName;
    if (updateData.physicianPhone !== undefined) record.physicianPhone = updateData.physicianPhone;
    if (updateData.insuranceProvider !== undefined) record.insuranceProvider = updateData.insuranceProvider;
    if (updateData.insurancePolicyNumber !== undefined) record.insurancePolicyNumber = updateData.insurancePolicyNumber;
    if (updateData.studentAge !== undefined) {
      record.studentAge = updateData.studentAge === '' || updateData.studentAge == null ? undefined : Number(updateData.studentAge);
    }

    if (updateData.activityClearances !== undefined && Array.isArray(updateData.activityClearances)) {
      record.activityClearances = updateData.activityClearances.map((c: any) => ({
        activityType: c.activityType || 'sports',
        activityName: c.activityName,
        cleared: !!c.cleared,
        clearanceDate: c.clearanceDate ? new Date(c.clearanceDate) : undefined,
        expiryDate: c.expiryDate ? new Date(c.expiryDate) : undefined,
        restrictions: Array.isArray(c.restrictions) ? c.restrictions : [],
        clearingPhysician: c.clearingPhysician,
        notes: c.notes,
        nurseApproved: !!c.nurseApproved,
        nurseApprovalDate: c.nurseApprovalDate ? new Date(c.nurseApprovalDate) : undefined,
        nurseNotes: c.nurseNotes
      }));
    }

    if (updateData.immunizations !== undefined && Array.isArray(updateData.immunizations)) {
      record.immunizations = updateData.immunizations.map((imm: any) => ({
        vaccineName: imm.vaccineName,
        dateAdministered: imm.dateAdministered ? new Date(imm.dateAdministered) : new Date(),
        administratorName: imm.administratorName || '',
        batchNumber: imm.batchNumber || '',
        nextDueDate: imm.nextDueDate ? new Date(imm.nextDueDate) : null,
      }));
    }

    record.updatedBy = updatedBy as any;
    return await record.save();
  }

  async deleteHealthRecord(studentId: string, deletedBy: string): Promise<void> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }
    // Soft delete - mark as deleted
    record.updatedBy = deletedBy as any;
    await this.healthRecordModel.deleteOne({ _id: record._id });
  }

  async addPhysicalExam(studentId: string, examData: any, recordedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    record.physicalExams.push({
      ...examData,
      examDate: new Date(examData.examDate),
      clearanceDate: examData.cleared ? new Date() : null,
      expiryDate: examData.expiryDate ? new Date(examData.expiryDate) : null
    });

    record.updatedBy = recordedBy as any;
    return await record.save();
  }

  async addNurseVisit(studentId: string, visitData: any, recordedBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy: recordedBy
      });
    }

    // Ensure actionTaken is an array
    const actionTakenArray = Array.isArray(visitData.actionTaken)
      ? visitData.actionTaken
      : (visitData.actionTaken ? [visitData.actionTaken] : []);

    // Prepare visit data with proper formatting
    const visitEntry: any = {
      visitDate: visitData.visitDate ? new Date(visitData.visitDate) : new Date(),
      visitTime: (visitData.visitTime || new Date().toTimeString().slice(0, 5)) as string,
      timeIn: (visitData.timeIn || visitData.visitTime || new Date().toTimeString().slice(0, 5)) as string,
      timeOut: (visitData.timeOut || '') as string,
      reason: (visitData.reason || '') as string,
      symptoms: (Array.isArray(visitData.symptoms) ? visitData.symptoms : (visitData.symptoms ? [visitData.symptoms] : [])) as string[],
      temperature: visitData.temperature as number | undefined,
      bloodPressure: visitData.bloodPressure as string | undefined,
      heartRate: visitData.heartRate as number | undefined,
      weight: visitData.weight as number | undefined,
      height: visitData.height as number | undefined,
      treatment: (visitData.treatment || '') as string,
      medications: (Array.isArray(visitData.medications) ? visitData.medications : (visitData.medications ? [visitData.medications] : [])) as string[],
      medicationGiven: (visitData.medicationGiven || '') as string,
      actionTaken: actionTakenArray as string[],
      followUpNeeded: visitData.followUpNeeded || false,
      parentNotified: visitData.parentNotified || false,
      returnToClass: visitData.returnToClass !== undefined ? visitData.returnToClass : true,
      restrictionsNotes: visitData.restrictionsNotes as string | undefined,
      priority: (visitData.priority || 'medium') as string,
      status: (visitData.status || 'in_progress') as string,
      disposition: visitData.disposition as string | undefined,
      dispositionTime: visitData.dispositionTime as string | undefined,
      visitDuration: visitData.visitDuration as number | undefined,
      nurseNotes: visitData.nurseNotes as string | undefined,
      parentContacted: visitData.parentContacted || false,
      contactMethod: visitData.contactMethod as string | undefined,
      followUpRequired: visitData.followUpRequired || false,
      followUpDate: visitData.followUpDate ? new Date(visitData.followUpDate) : undefined
    };
    const nurseUser = await this.userModel.findById(recordedBy).select('firstName lastName').lean();
    visitEntry.recordedByName = nurseUser ? `${(nurseUser as any).firstName || ''} ${(nurseUser as any).lastName || ''}`.trim() : '';

    record.nurseVisits.push(visitEntry);

    record.updatedBy = recordedBy as any;
    const savedRecord = await record.save();
    return savedRecord;
  }

  async updateNurseVisit(studentId: string, visitId: string, updateData: any, updatedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const visitIndex = record.nurseVisits.findIndex((visit: any) => visit._id.toString() === visitId);
    if (visitIndex === -1) {
      throw new NotFoundException('Nurse visit not found');
    }

    // Handle actionTaken - ensure it's an array
    if (updateData.actionTaken !== undefined) {
      updateData.actionTaken = Array.isArray(updateData.actionTaken)
        ? updateData.actionTaken
        : (updateData.actionTaken ? [updateData.actionTaken] : []);
    }

    // Handle symptoms - ensure it's an array
    if (updateData.symptoms !== undefined) {
      updateData.symptoms = Array.isArray(updateData.symptoms)
        ? updateData.symptoms
        : (updateData.symptoms ? [updateData.symptoms] : []);
    }

    // Handle medications - ensure it's an array
    if (updateData.medications !== undefined) {
      updateData.medications = Array.isArray(updateData.medications)
        ? updateData.medications
        : (updateData.medications ? [updateData.medications] : []);
    }

    // Handle date fields
    if (updateData.visitDate) {
      updateData.visitDate = new Date(updateData.visitDate);
    }
    if (updateData.followUpDate) {
      updateData.followUpDate = new Date(updateData.followUpDate);
    }

    // Update the visit with all provided data
    Object.assign(record.nurseVisits[visitIndex], updateData);
    record.updatedBy = updatedBy as any;
    const savedRecord = await record.save();
    return savedRecord;
  }

  async deleteNurseVisit(studentId: string, visitId: string, deletedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const visitIndex = record.nurseVisits.findIndex((visit: any) => visit._id.toString() === visitId);
    if (visitIndex === -1) {
      throw new NotFoundException('Nurse visit not found');
    }

    // Soft delete - remove from array
    record.nurseVisits.splice(visitIndex, 1);
    record.updatedBy = deletedBy as any;
    return await record.save();
  }

  async addImmunization(studentId: string, immunizationData: any, recordedBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy: recordedBy
      });
    }

    record.immunizations.push({
      ...immunizationData,
      dateAdministered: new Date(immunizationData.dateAdministered),
      nextDueDate: immunizationData.nextDueDate ? new Date(immunizationData.nextDueDate) : null
    });

    record.updatedBy = recordedBy as any;
    return await record.save();
  }

  async updateMedicationLog(studentId: string, medicationData: any, recordedBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy: recordedBy
      });
    }

    record.medicationLog.push({
      ...medicationData,
      startDate: new Date(medicationData.startDate),
      endDate: medicationData.endDate ? new Date(medicationData.endDate) : null
    });

    record.updatedBy = recordedBy as any;
    return await record.save();
  }

  async addHealthAlert(studentId: string, alertData: any, createdBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy
      });
    }

    record.healthAlerts.push({
      ...alertData,
      createdDate: new Date(),
      expiryDate: alertData.expiryDate ? new Date(alertData.expiryDate) : null
    });

    record.updatedBy = createdBy as any;
    return await record.save();
  }

  async getActiveHealthAlerts(schoolId?: string): Promise<any[]> {
    const query: any = {
      'healthAlerts.isActive': true,
      'healthAlerts.visibleToStaff': true
    };

    if (schoolId) {
      query.schoolId = schoolId;
    }

    const records = await this.healthRecordModel
      .find(query)
      .populate('studentId', 'firstName lastName gradeLevel')
      .select('studentId healthAlerts');

    const alerts = [];
    records.forEach(record => {
      record.healthAlerts.forEach(alert => {
        if (alert.isActive && alert.visibleToStaff) {
          alerts.push({
            studentId: record.studentId,
            alert
          });
        }
      });
    });

    return alerts;
  }

  // ==================== GET HEALTH ALERT STATS ====================

  async getHealthAlertStats(schoolId: string): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        'healthAlerts.0': { $exists: true }
      };

      // Get all health records with health alerts
      const healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      // Flatten all alerts
      const allAlerts: any[] = [];
      healthRecords.forEach(record => {
        if (record.healthAlerts && Array.isArray(record.healthAlerts) && record.healthAlerts.length > 0) {
          record.healthAlerts.forEach((alert: any) => {
            allAlerts.push(alert);
          });
        }
      });

      // Calculate stats
      const totalAlerts = allAlerts.length;
      const activeAlerts = allAlerts.filter((alert: any) => alert.isActive !== false).length;
      const criticalAlerts = allAlerts.filter((alert: any) => 
        alert.isActive !== false && alert.severity === 'critical'
      ).length;
      
      const now = new Date();
      const expiredAlerts = allAlerts.filter((alert: any) => {
        if (!alert.expiryDate) return false;
        return new Date(alert.expiryDate) < now;
      }).length;

      return {
        totalAlerts,
        activeAlerts,
        criticalAlerts,
        expiredAlerts
      };
    } catch (error: any) {
      console.error('Error in getHealthAlertStats:', error);
      throw new BadRequestException(error.message || 'Failed to retrieve health alert stats');
    }
  }

  // ==================== GET ALL HEALTH ALERTS WITH PAGINATION ====================

  async getAllHealthAlerts(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        'healthAlerts.0': { $exists: true }
      };

      // Pagination
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      // Get health records with health alerts
      const healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      // Flatten all alerts with student info
      const allAlerts: any[] = [];
      healthRecords.forEach((record, recordIndex) => {
        const alerts = record.healthAlerts;
        const hasAlerts = alerts && Array.isArray(alerts) && alerts.length > 0;
        
        if (hasAlerts) {
          const student = record.studentId as any;
          
          if (!student) {
            console.warn(`[getAllHealthAlerts] Warning: Record ${record._id} has alerts but no studentId populated`);
          }
          
          alerts.forEach((alert: any, alertIndex: number) => {
            const alertData = alert as any;
            const studentId = student?._id || record.studentId || null;
            const studentInfo = student ? {
              _id: student._id,
              firstName: student.firstName,
              lastName: student.lastName,
              gradeLevel: student.gradeLevel || student.class,
              studentId: student.studentId,
              email: student.email
            } : {
              _id: record.studentId,
              firstName: 'Unknown',
              lastName: 'Student',
              gradeLevel: 'N/A',
              studentId: 'N/A',
              email: 'N/A'
            };
            
            allAlerts.push({
              _id: alertData._id || alertData.id || `temp_${Date.now()}_${recordIndex}_${alertIndex}`,
              studentId: studentId,
              student: studentInfo,
              type: alertData.type,
              severity: alertData.severity,
              title: alertData.title,
              description: alertData.description,
              triggerConditions: alertData.triggerConditions,
              actionRequired: alertData.actionRequired,
              expiryDate: alertData.expiryDate,
              isActive: alertData.isActive !== false,
              autoTrigger: alertData.autoTrigger || false,
              notifyParents: alertData.notifyParents || false,
              notifyTeachers: alertData.notifyTeachers || false,
              visibleToStaff: alertData.visibleToStaff !== false,
              createdAt: alertData.createdDate || alertData.createdAt || (record as any).createdAt,
              updatedAt: alertData.updatedAt || (record as any).updatedAt
            });
          });
        }
      });

      // Apply filters
      let filteredAlerts = allAlerts;

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filteredAlerts = filteredAlerts.filter(alert =>
          alert.student?.firstName?.toLowerCase().includes(searchLower) ||
          alert.student?.lastName?.toLowerCase().includes(searchLower) ||
          alert.title?.toLowerCase().includes(searchLower) ||
          alert.description?.toLowerCase().includes(searchLower) ||
          alert.type?.toLowerCase().includes(searchLower)
        );
      }

      if (filters?.severity && filters.severity !== 'all') {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === filters.severity);
      }

      if (filters?.type && filters.type !== 'all') {
        filteredAlerts = filteredAlerts.filter(alert => alert.type === filters.type);
      }

      if (filters?.status && filters.status !== 'all') {
        if (filters.status === 'active') {
          filteredAlerts = filteredAlerts.filter(alert => alert.isActive);
        } else if (filters.status === 'inactive') {
          filteredAlerts = filteredAlerts.filter(alert => !alert.isActive);
        } else if (filters.status === 'expired') {
          filteredAlerts = filteredAlerts.filter(alert => {
            if (!alert.expiryDate) return false;
            return new Date(alert.expiryDate) < new Date();
          });
        }
      }

      // Sort by severity (critical > high > medium > low) and then by date (most recent first)
      const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      filteredAlerts.sort((a, b) => {
        const severityDiff = (severityOrder[b.severity as keyof typeof severityOrder] || 0) -
          (severityOrder[a.severity as keyof typeof severityOrder] || 0);
        if (severityDiff !== 0) return severityDiff;
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      const total = filteredAlerts.length;
      const paginatedAlerts = filteredAlerts.slice(skip, skip + limit);

      return {
        alerts: paginatedAlerts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error in getAllHealthAlerts:', error);
      throw error;
    }
  }

  private async resolveSportsProgramName(sportsProgramNameOrId: string): Promise<string> {
    if (!sportsProgramNameOrId || typeof sportsProgramNameOrId !== 'string') return sportsProgramNameOrId;
    const trimmed = sportsProgramNameOrId.trim();
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(trimmed);
    if (!isObjectId) return trimmed;
    const program = await this.sportsProgramModel.findById(trimmed).select('name').lean();
    return program ? (program as any).name : trimmed;
  }

  async getSportsEligibility(studentId: string, sportsProgramName: string): Promise<any> {
    const programName = await this.resolveSportsProgramName(sportsProgramName);
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      return {
        eligible: false,
        reason: 'No health record found'
      };
    }

    const sportsClearance = record.activityClearances?.find(
      clearance => clearance.activityType === 'sports' &&
        (clearance.activityName === programName || clearance.activityName === sportsProgramName)
    );

    if (!sportsClearance) {
      return {
        eligible: false,
        reason: 'No sports clearance record found for this program'
      };
    }

    // Check if physician has cleared (valid physical exam)
    const physicalCleared = sportsClearance.cleared && 
      (!sportsClearance.expiryDate || sportsClearance.expiryDate > new Date());

    if (!physicalCleared) {
      return {
        eligible: false,
        reason: 'Valid physical exam clearance required',
        physicalCleared: false,
        nurseApproved: sportsClearance.nurseApproved || false
      };
    }

    // Check if nurse has approved
    const nurseApproved = sportsClearance.nurseApproved;

    if (!nurseApproved) {
      return {
        eligible: false,
        reason: 'Nurse approval required to enable athletics',
        physicalCleared: true,
        nurseApproved: false
      };
    }

    // Both conditions met: Physical cleared AND Nurse approved
    return {
      eligible: true,
      physicalCleared: true,
      nurseApproved: true,
      physicalExamDate: sportsClearance.clearanceDate,
      expiryDate: sportsClearance.expiryDate,
      restrictions: sportsClearance.restrictions || [],
      nurseApprovalDate: sportsClearance.nurseApprovalDate,
      athleticsTabEnabled: true
    };
  }

  async approveSportsActivity(studentId: string, sportsProgramName: string, notes: string, user: any): Promise<any> {
    try {
      if (!studentId || !sportsProgramName) {
        throw new BadRequestException('Student ID and sports program name are required');
      }

      if (![UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)) {
        throw new ForbiddenException('Only nurses and admins can approve sports activities');
      }

      const programName = await this.resolveSportsProgramName(sportsProgramName);
      const record = await this.healthRecordModel.findOne({ studentId });
      if (!record) {
        throw new NotFoundException('Health record not found for student');
      }

      const clearanceIndex = record.activityClearances?.findIndex(
        c => c.activityType === 'sports' && (c.activityName === programName || c.activityName === sportsProgramName)
      );

      if (clearanceIndex === -1 || clearanceIndex === undefined) {
        throw new NotFoundException('Sports clearance record not found for this program');
      }

      // Check if physician has already cleared
      if (!record.activityClearances[clearanceIndex].cleared) {
        throw new BadRequestException('Physician clearance must be obtained before nurse approval');
      }

      // Check if physical exam is still valid
      const expiryDate = record.activityClearances[clearanceIndex].expiryDate;
      if (expiryDate && expiryDate <= new Date()) {
        throw new BadRequestException('Physical exam clearance has expired');
      }

      // Mark as nurse approved
      record.activityClearances[clearanceIndex].nurseApproved = true;
      record.activityClearances[clearanceIndex].nurseApprovalDate = new Date();
      record.activityClearances[clearanceIndex].nurseNotes = notes;

      await record.save();

      return {
        success: true,
        message: `${sportsProgramName} sports activity approved for student`,
        approved: true,
        approvalDate: new Date(),
        athleticsTabEnabled: true
      };
    } catch (error) {
      console.error('Error in approveSportsActivity:', error);
      throw error;
    }
  }

  async ensureActivityClearanceForSports(
    studentId: string,
    programName: string,
    options?: { cleared?: boolean; clearanceDate?: Date; expiryDate?: Date; restrictions?: string[] }
  ): Promise<void> {
    if (!studentId || !programName) return;
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) return;
    if (!record.activityClearances) record.activityClearances = [];
    const existing = record.activityClearances.find(
      c => c.activityType === 'sports' && c.activityName === programName
    );
    if (existing) return;
    const now = new Date();
    record.activityClearances.push({
      activityType: 'sports',
      activityName: programName,
      cleared: options?.cleared ?? false,
      clearanceDate: options?.clearanceDate ?? (options?.cleared ? now : undefined),
      expiryDate: options?.expiryDate,
      restrictions: options?.restrictions ?? [],
      clearingPhysician: undefined,
      notes: undefined,
      nurseApproved: false,
      nurseApprovalDate: undefined,
      nurseNotes: undefined
    } as any);
    await record.save();
  }

  async getPendingSportsApprovals(schoolId: string): Promise<any[]> {
    const records = await this.healthRecordModel
      .find({ schoolId: new Types.ObjectId(schoolId) })
      .populate({
        path: 'studentId',
        select: 'firstName lastName gradeLevel class',
        populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
      })
      .lean();
    const now = new Date();
    const pending: any[] = [];
    for (const record of records) {
      const clearances = record.activityClearances?.filter((c: any) =>
        c.activityType === 'sports' &&
        c.cleared === true &&
        (!c.expiryDate || new Date(c.expiryDate) > now) &&
        !c.nurseApproved
      ) || [];
      const student = record.studentId as any;
      const profile = student?.studentProfileId;
      const studentName = profile
        ? `${(profile as any).firstName || ''} ${(profile as any).lastName || ''}`.trim()
        : (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown') || 'Unknown';
      const gradeLevel = (profile as any)?.gradeLevel || student?.gradeLevel || student?.class;
      for (const c of clearances) {
        const sid = (record as any).studentId;
        pending.push({
          studentId: (typeof sid === 'object' && sid?._id ? sid._id : sid)?.toString?.() ?? sid,
          studentName,
          programName: c.activityName,
          gradeLevel: gradeLevel || 'N/A'
        });
      }
    }
    return pending;
  }

  async getHealthRecordsBySchool(schoolId: string, filters?: any): Promise<HealthRecord[]> {
    const query: any = { schoolId };

    if (filters?.academicYear) {
      query.academicYear = filters.academicYear;
    }

    if (filters?.hasAlerts) {
      query['healthAlerts.isActive'] = true;
    }

    return await this.healthRecordModel
      .find(query)
      .populate('studentId', 'firstName lastName gradeLevel')
      .sort({ updatedAt: -1 });
  }

  async generateHealthReport(schoolId: string, reportType: string, filters?: any): Promise<any> {
    const query: any = { schoolId: new Types.ObjectId(schoolId) };

    if (filters?.academicYear) {
      query.academicYear = filters.academicYear;
    }

    const records = await this.healthRecordModel
      .find(query)
      .populate({
        path: 'studentId',
        select: 'firstName lastName gradeLevel dateOfBirth dob class studentProfileId',
        populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
      });

    switch (reportType) {
      case 'health-overview':
        return this.generateHealthOverviewReport(records, filters || {});
      case 'nurse-visit-medication':
        return this.generateNurseVisitMedicationReport(records);
      case 'immunization':
        return this.generateImmunizationReport(records);
      case 'medication':
        return this.generateMedicationReport(records);
      case 'nurse-visits':
        return this.generateNurseVisitReport(records);
      case 'health-alerts':
        return this.generateHealthAlertReport(records);
      default:
        throw new BadRequestException('Invalid report type');
    }
  }

  private getStudentNameAndGrade(record: HealthRecord): { studentName: string; gradeLevel: string } {
    const student = record.studentId as any;
    if (!student || typeof student !== 'object' || !('firstName' in student) && !('studentProfileId' in student)) {
      return { studentName: 'Unknown Student', gradeLevel: 'N/A' };
    }
    const profile = student?.studentProfileId;
    const studentName = (profile
      ? `${(profile as any).firstName || ''} ${(profile as any).lastName || ''}`.trim()
      : `${student.firstName || ''} ${student.lastName || ''}`.trim()) || 'Unknown Student';
    const gradeLevel = (profile as any)?.gradeLevel ?? student?.gradeLevel ?? student?.class ?? 'N/A';
    return { studentName: studentName || 'Unknown Student', gradeLevel };
  }

  private generateImmunizationReport(records: HealthRecord[]): any {
    const report = {
      totalStudents: records.length,
      vaccinationSummary: {},
      missingVaccinations: [],
      upcomingDue: [],
      immunizations: []
    };

    records.forEach(record => {
      const { studentName, gradeLevel } = this.getStudentNameAndGrade(record);

      if (!record.immunizations || record.immunizations.length === 0) {
        return;
      }

      record.immunizations.forEach(immunization => {
        if (!report.vaccinationSummary[immunization.vaccineName]) {
          report.vaccinationSummary[immunization.vaccineName] = 0;
        }
        report.vaccinationSummary[immunization.vaccineName]++;

        if (immunization.nextDueDate && new Date(immunization.nextDueDate) <= new Date()) {
          report.upcomingDue.push({
            studentId: record.studentId,
            studentName: studentName,
            gradeLevel: gradeLevel,
            vaccineName: immunization.vaccineName,
            dueDate: immunization.nextDueDate
          });
        }

        // Add immunization detail for CSV with gradeLevel
        report.immunizations.push({
          studentName,
          gradeLevel: gradeLevel,
          vaccineName: immunization.vaccineName || 'N/A',
          dateAdministered: immunization.dateAdministered ? new Date(immunization.dateAdministered).toISOString().split('T')[0] : 'N/A',
          administrator: immunization.administratorName || 'N/A',
          nextDueDate: immunization.nextDueDate ? new Date(immunization.nextDueDate).toISOString().split('T')[0] : 'N/A'
        });
      });
    });

    return report;
  }

  private generateMedicationReport(records: HealthRecord[]): any {
    const report = {
      totalStudents: records.length,
      studentsOnMedication: 0,
      medicationsSummary: {},
      activeMedications: []
    };

    records.forEach(record => {
      const { studentName, gradeLevel } = this.getStudentNameAndGrade(record);

      const activeMeds = record.medicationLog ? record.medicationLog.filter((med: any) => med.isActive) : [];
      if (activeMeds.length > 0) {
        report.studentsOnMedication++;
      }

      activeMeds.forEach((medication: any) => {
        if (!report.medicationsSummary[medication.medicationName]) {
          report.medicationsSummary[medication.medicationName] = 0;
        }
        report.medicationsSummary[medication.medicationName]++;

        report.activeMedications.push({
          studentId: record.studentId,
          studentName,
          gradeLevel,
          medicationName: medication.medicationName || 'N/A',
          dosage: medication.dosage || 'N/A',
          frequency: medication.frequency || 'N/A',
          startDate: medication.startDate ? new Date(medication.startDate).toISOString().split('T')[0] : 'N/A',
          endDate: medication.endDate ? new Date(medication.endDate).toISOString().split('T')[0] : (medication.isActive ? 'Ongoing' : 'N/A'),
          status: medication.isActive ? 'Active' : 'Inactive'
        });
      });
    });

    return report;
  }

  private generateNurseVisitReport(records: HealthRecord[]): any {
    const report = {
      totalVisits: 0,
      studentsWithVisits: 0,
      commonReasons: {},
      monthlyTrends: {},
      visits: [] // Add detailed visits array for CSV
    };

    records.forEach(record => {
      if (record.nurseVisits && record.nurseVisits.length > 0) {
        report.studentsWithVisits++;
        report.totalVisits += record.nurseVisits.length;

        record.nurseVisits.forEach(visit => {
          const student = record.studentId as any;
          const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown Student';
          const grade = student?.gradeLevel || student?.class || 'N/A';
          
          if (!report.commonReasons[visit.reason]) {
            report.commonReasons[visit.reason] = 0;
          }
          report.commonReasons[visit.reason]++;

          const monthKey = visit.visitDate ? new Date(visit.visitDate).toISOString().slice(0, 7) : 'Unknown'; // YYYY-MM
          if (!report.monthlyTrends[monthKey]) {
            report.monthlyTrends[monthKey] = 0;
          }
          report.monthlyTrends[monthKey]++;

          // Add visit detail for CSV
          report.visits.push({
            date: visit.visitDate ? new Date(visit.visitDate).toISOString().split('T')[0] : 'N/A',
            studentName,
            grade,
            reason: visit.reason || 'N/A',
            disposition: visit.disposition || 'N/A',
            priority: visit.priority || 'N/A',
            status: visit.status || 'N/A'
          });
        });
      }
    });

    return report;
  }

  private generateNurseVisitMedicationReport(records: HealthRecord[]): any {
    const rows: Array<{ nurseName: string; studentName: string; visitDate: string; reason: string; medicationName: string }> = [];
    records.forEach(record => {
      const { studentName } = this.getStudentNameAndGrade(record);
      if (!record.nurseVisits || record.nurseVisits.length === 0) return;
      record.nurseVisits.forEach((visit: any) => {
        const medGiven = visit.medicationGiven || '';
        const meds = Array.isArray(visit.medications) ? visit.medications : [];
        const medicationName = [medGiven, ...meds].filter(Boolean).join('; ') || 'N/A';
        rows.push({
          nurseName: visit.recordedByName || 'N/A',
          studentName,
          visitDate: visit.visitDate ? new Date(visit.visitDate).toISOString().split('T')[0] : 'N/A',
          reason: visit.reason || 'N/A',
          medicationName
        });
      });
    });
    return { reportType: 'Nurse Visit & Medication', rows };
  }

  private generateHealthAlertReport(records: HealthRecord[]): any {
    const report = {
      totalStudents: records.length,
      studentsWithAlerts: 0,
      alertsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      alertsByType: {},
      activeAlerts: []
    };

    records.forEach(record => {
      const healthAlertsList = record.healthAlerts || [];
      const activeAlerts = healthAlertsList.filter((alert: any) => alert.isActive);
      if (activeAlerts.length > 0) {
        report.studentsWithAlerts++;
      }

      activeAlerts.forEach(alert => {
        report.alertsBySeverity[alert.severity]++;

        if (!report.alertsByType[alert.type]) {
          report.alertsByType[alert.type] = 0;
        }
        report.alertsByType[alert.type]++;

        const { studentName, gradeLevel } = this.getStudentNameAndGrade(record);

        report.activeAlerts.push({
          studentId: record.studentId,
          studentName,
          gradeLevel,
          type: alert.type || 'N/A',
          severity: alert.severity || 'N/A',
          description: alert.description || 'N/A',
          createdDate: alert.createdDate ? new Date(alert.createdDate).toISOString().split('T')[0] : 'N/A'
        });
      });
    });

    return report;
  }

  // ==================== DASHBOARD ANALYTICS ====================

  async getVisitsTrend(schoolId: string, period: string = '7days'): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const days = period === '30days' ? 30 : 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      // Get health records with nurse visits in the date range
      const healthRecords = await this.healthRecordModel.find({
        schoolId: new Types.ObjectId(schoolId),
        'nurseVisits.visitDate': { $gte: startDate, $lte: endDate }
      }).lean();

      // Create daily trend data
      const trendData = [];
      for (let i = days - 1; i >= 0; i--) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - i);
        currentDate.setHours(0, 0, 0, 0);

        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);

        let visitsCount = 0;
        healthRecords.forEach(record => {
          const dayVisits = record.nurseVisits?.filter(visit => {
            const visitDate = new Date(visit.visitDate);
            return visitDate >= currentDate && visitDate < nextDate;
          }).length || 0;
          visitsCount += dayVisits;
        });

        trendData.push({
          date: currentDate.toISOString().split('T')[0],
          visits: visitsCount,
          day: currentDate.toLocaleDateString('en-US', { weekday: 'short' })
        });
      }

      return {
        period,
        data: trendData,
        totalVisits: trendData.reduce((sum, day) => sum + day.visits, 0)
      };
    } catch (error) {
      console.error('Error in getVisitsTrend:', error);
      throw error;
    }
  }

  async getHealthOverview(schoolId: string): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      // Get all health records for the school
      const healthRecords = await this.healthRecordModel.find({
        schoolId: new Types.ObjectId(schoolId)
      }).lean();

      // Common visit reasons
      const reasonCounts = {};
      let totalAllergyStudents = 0;
      let totalMedicationStudents = 0;
      const commonAllergies = {};
      const medicationTypes = {};

      healthRecords.forEach(record => {
        // Count visit reasons
        record.nurseVisits?.forEach(visit => {
          const reason = visit.reason?.toLowerCase() || 'unspecified';
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });

        // Count allergies
        record.allergies?.forEach(allergy => {
          commonAllergies[allergy] = (commonAllergies[allergy] || 0) + 1;
          totalAllergyStudents++;
        });

        // Count active medications
        const activeMeds = record.medicationLog?.filter(med => med.isActive) || [];
        if (activeMeds.length > 0) {
          totalMedicationStudents++;
          activeMeds.forEach(med => {
            const medType = med.medicationName || 'unspecified';
            medicationTypes[medType] = (medicationTypes[medType] || 0) + 1;
          });
        }
      });

      // Get top 5 for each category
      const topReasons = Object.entries(reasonCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      const topAllergies = Object.entries(commonAllergies)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([allergy, count]) => ({ allergy, count }));

      const topMedications = Object.entries(medicationTypes)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([medication, count]) => ({ medication, count }));

      return {
        visitReasons: topReasons,
        allergies: {
          total: totalAllergyStudents,
          common: topAllergies
        },
        medications: {
          studentsOnMedication: totalMedicationStudents,
          common: topMedications
        },
        healthRecordsTotal: healthRecords.length
      };
    } catch (error) {
      console.error('Error in getHealthOverview:', error);
      throw error;
    }
  }

  async getRecentVisits(schoolId: string, limit: number = 5): Promise<any[]> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      // Get health records with recent nurse visits
      const healthRecords = await this.healthRecordModel.find({
        schoolId: new Types.ObjectId(schoolId),
        'nurseVisits.0': { $exists: true }
      })
        .populate('studentId', 'firstName lastName gradeLevel class')
        .exec();

      // Flatten and sort all visits
      const allVisits = [];
      healthRecords.forEach(record => {
        if (record.nurseVisits && record.nurseVisits.length > 0 && record.studentId) {
          const student = record.studentId as any; // Type assertion for populated field
          record.nurseVisits.forEach(visit => {
            allVisits.push({
              studentName: `${student.firstName || 'Unknown'} ${student.lastName || 'Student'}`,
              grade: student.gradeLevel || student.class || 'N/A',
              reason: visit.reason,
              visitDate: visit.visitDate,
              disposition: visit.disposition,
              severity: this.getVisitSeverity(visit.reason, visit.disposition)
            });
          });
        }
      });

      // Sort by date (most recent first) and limit
      return allVisits
        .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error in getRecentVisits:', error);
      throw error;
    }
  }

  private getVisitSeverity(reason: string, disposition: string): 'high' | 'medium' | 'low' {
    const lowerReason = reason?.toLowerCase() || '';
    const lowerDisposition = disposition?.toLowerCase() || '';

    // High severity
    if (lowerReason.includes('injury') || lowerReason.includes('emergency') ||
      lowerReason.includes('allergic') || lowerDisposition.includes('hospital') ||
      lowerDisposition.includes('emergency')) {
      return 'high';
    }

    // Medium severity
    if (lowerReason.includes('fever') || lowerReason.includes('vomit') ||
      lowerReason.includes('pain') || lowerDisposition.includes('home')) {
      return 'medium';
    }

    // Low severity (default)
    return 'low';
  }

  // ==================== MISSING METHODS FOR NEW FEATURES ====================

  async dismissHealthAlert(studentId: string, alertId: string, updatedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const alertIndex = record.healthAlerts.findIndex((alert: any) => alert._id.toString() === alertId);
    if (alertIndex === -1) {
      throw new NotFoundException('Health alert not found');
    }

    record.healthAlerts[alertIndex].isActive = false;
    record.updatedBy = updatedBy as any;
    return await record.save();
  }

  async updateHealthAlert(studentId: string, alertId: string, updateData: any, updatedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const alertIndex = record.healthAlerts.findIndex((alert: any) => alert._id.toString() === alertId);
    if (alertIndex === -1) {
      throw new NotFoundException('Health alert not found');
    }

    Object.assign(record.healthAlerts[alertIndex], {
      ...updateData,
      expiryDate: updateData.expiryDate ? new Date(updateData.expiryDate) : record.healthAlerts[alertIndex].expiryDate
    });
    record.updatedBy = updatedBy as any;
    return await record.save();
  }

  async deleteHealthAlert(studentId: string, alertId: string, deletedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const alertIndex = record.healthAlerts.findIndex((alert: any) => alert._id.toString() === alertId);
    if (alertIndex === -1) {
      throw new NotFoundException('Health alert not found');
    }

    // Soft delete - remove from array
    record.healthAlerts.splice(alertIndex, 1);
    record.updatedBy = deletedBy as any;
    return await record.save();
  }

  async uploadDocument(studentId: string, documentData: any, uploadedBy: string): Promise<HealthRecord> {
    let record = await this.healthRecordModel.findOne({ studentId });

    if (!record) {
      // Auto-create health record if it doesn't exist
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;

      record = new this.healthRecordModel({
        studentId,
        schoolId: student.schoolId,
        academicYear,
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        immunizations: [],
        medicationLog: [],
        healthAlerts: [],
        documents: [],
        createdBy: uploadedBy
      });
    }

    // Handle the actual file upload
    const file = documentData.file;
    let fileName = '';
    let fileSize = 0;
    let mimeType = '';
    let downloadUrl = '';

    if (file) {
      fileSize = file.size;
      mimeType = file.mimetype;

      // Get student info for folder structure
      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      // Create AWS folder structure: school/nurses/documents/student-name-id/
      const schoolId = student.schoolId?.toString() || 'default';
      const studentName = `${student.firstName || 'student'}-${student.lastName || 'unknown'}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const studentIdStr = studentId.toString();
      const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      fileName = `${timestamp}-${sanitizedFileName}`;

      const s3Key = `${schoolId}/nurses/documents/${studentName}-${studentIdStr}/${fileName}`;

      try {
        // Upload to AWS S3 - file.buffer is available from multer
        downloadUrl = await this.awsService.uploadFile(s3Key, file.buffer, mimeType);
      } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new BadRequestException('Failed to upload file to storage');
      }
    }

    const document = {
      fileName: fileName || 'document.pdf',
      originalName: file?.originalname || documentData.fileName || 'document.pdf',
      category: documentData.category,
      description: documentData.description,
      fileSize: fileSize,
      mimeType: mimeType || 'application/pdf',
      uploadDate: new Date(),
      uploadedBy,
      isConfidential: documentData.isConfidential || false,
      accessLevel: documentData.accessLevel || 'Staff Only',
      tags: documentData.tags || [],
      downloadUrl: downloadUrl
    };

    if (!record.documents) {
      record.documents = [];
    }

    record.documents.push(document as any);
    record.updatedBy = uploadedBy as any;
    return await record.save();
  }

  async downloadDocument(studentId: string, documentId: string): Promise<any> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const document = record.documents?.find((doc: any) => doc._id.toString() === documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const docData = document as any;

    // Extract S3 key from downloadUrl
    // downloadUrl format: https://bucket-name.s3.region.amazonaws.com/key
    let s3Key = '';
    if (docData.downloadUrl) {
      try {
        const url = new URL(docData.downloadUrl);
        // Extract key from path (remove leading slash)
        s3Key = url.pathname.substring(1);
      } catch (error) {
        // If downloadUrl is not a valid URL, try to use it as key directly
        s3Key = docData.downloadUrl;
      }
    }

    if (!s3Key) {
      throw new BadRequestException('Document S3 key not found');
    }

    try {
      // Generate signed URL for download (valid for 1 hour)
      const signedUrl = await this.awsService.generateDownloadSignedUrl(s3Key, 3600);
      
      return {
        fileName: docData.originalName || docData.fileName,
        downloadUrl: signedUrl,
        mimeType: docData.mimeType,
        fileSize: docData.fileSize
      };
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw new BadRequestException('Failed to generate download URL');
    }
  }

  async deleteDocument(studentId: string, documentId: string, deletedBy: string): Promise<HealthRecord> {
    const record = await this.healthRecordModel.findOne({ studentId });
    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    const documentIndex = record.documents?.findIndex((doc: any) => doc._id.toString() === documentId);
    if (documentIndex === -1 || documentIndex === undefined) {
      throw new NotFoundException('Document not found');
    }

    const document = record.documents[documentIndex];
    const docData = document as any;
    
    // Extract S3 key from downloadUrl and delete from S3
    if (docData.downloadUrl) {
      try {
        let s3Key = '';
        try {
          const url = new URL(docData.downloadUrl);
          // Extract key from path (remove leading slash)
          s3Key = url.pathname.substring(1);
        } catch (error) {
          // If downloadUrl is not a valid URL, try to use it as key directly
          s3Key = docData.downloadUrl;
        }

        if (s3Key) {
          // Delete from S3
          const deleteResult = await this.awsService.deleteFile(s3Key);
          if (!deleteResult.success) {
            console.warn(`Failed to delete file from S3: ${deleteResult.msg}, but continuing with database deletion`);
          }
        }
      } catch (error) {
        console.error('Error deleting file from S3:', error);
        // Continue with database deletion even if S3 deletion fails
      }
    }

    // Remove from database
    record.documents?.splice(documentIndex, 1);
    record.updatedBy = deletedBy as any;
    return await record.save();
  }

  // ==================== GET ALL DOCUMENTS WITH PAGINATION ====================

  async getDocumentStats(schoolId: string): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        'documents.0': { $exists: true }
      };

      // Get all health records with documents
      const healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      // Flatten all documents
      const allDocuments: any[] = [];
      healthRecords.forEach(record => {
        if (record.documents && Array.isArray(record.documents) && record.documents.length > 0) {
          record.documents.forEach((document: any) => {
            allDocuments.push(document);
          });
        }
      });

      // Calculate stats from all documents (not filtered)
      const totalDocuments = allDocuments.length;
      const confidentialDocuments = allDocuments.filter((doc: any) => doc.isConfidential === true).length;
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentUploads = allDocuments.filter((doc: any) => {
        if (!doc.uploadDate) return false;
        return new Date(doc.uploadDate) >= sevenDaysAgo;
      }).length;

      const storageUsed = allDocuments.reduce((sum: number, doc: any) => sum + (doc.fileSize || 0), 0);

      return {
        totalDocuments,
        confidentialDocuments,
        recentUploads,
        storageUsed: Math.round(storageUsed / (1024 * 1024)) // Convert to MB
      };
    } catch (error: any) {
      console.error('Error in getDocumentStats:', error);
      throw new BadRequestException(error.message || 'Failed to retrieve document stats');
    }
  }

  async getAllDocuments(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        'documents.0': { $exists: true }
      };

      // Pagination
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      // Get health records with documents
      const healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      // Flatten all documents with student info
      const allDocuments: any[] = [];
      healthRecords.forEach((record, recordIndex) => {
        const documents = record.documents;
        const hasDocuments = documents && Array.isArray(documents) && documents.length > 0;
        
        if (hasDocuments) {
          const student = record.studentId as any;
          
          if (!student) {
            console.warn(`[getAllDocuments] Warning: Record ${record._id} has documents but no studentId populated`);
          }
          
          documents.forEach((document: any, docIndex: number) => {
            const docData = document as any;
            const studentId = student?._id || record.studentId || null;
            const studentInfo = student ? {
              _id: student._id,
              firstName: student.firstName,
              lastName: student.lastName,
              gradeLevel: student.gradeLevel || student.class,
              studentId: student.studentId,
              email: student.email
            } : {
              _id: record.studentId,
              firstName: 'Unknown',
              lastName: 'Student',
              gradeLevel: 'N/A',
              studentId: 'N/A',
              email: 'N/A'
            };
            
            allDocuments.push({
              _id: docData._id || docData.id || `temp_${Date.now()}_${recordIndex}_${docIndex}`,
              studentId: studentId,
              student: studentInfo,
              fileName: docData.fileName,
              originalName: docData.originalName,
              category: docData.category,
              description: docData.description,
              fileSize: docData.fileSize,
              mimeType: docData.mimeType,
              uploadDate: docData.uploadDate,
              uploadedBy: docData.uploadedBy,
              isConfidential: docData.isConfidential || false,
              accessLevel: docData.accessLevel || 'Staff Only',
              tags: docData.tags || [],
              downloadUrl: docData.downloadUrl,
              createdAt: docData.uploadDate || (record as any).createdAt,
              updatedAt: docData.updatedAt || (record as any).updatedAt
            });
          });
        }
      });

      // Apply filters
      let filteredDocuments = allDocuments;

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filteredDocuments = filteredDocuments.filter(doc =>
          doc.student?.firstName?.toLowerCase().includes(searchLower) ||
          doc.student?.lastName?.toLowerCase().includes(searchLower) ||
          doc.originalName?.toLowerCase().includes(searchLower) ||
          doc.description?.toLowerCase().includes(searchLower) ||
          doc.category?.toLowerCase().includes(searchLower)
        );
      }

      if (filters?.category && filters.category !== 'all') {
        filteredDocuments = filteredDocuments.filter(doc => doc.category === filters.category);
      }

      if (filters?.accessLevel && filters.accessLevel !== 'all') {
        filteredDocuments = filteredDocuments.filter(doc => doc.accessLevel === filters.accessLevel);
      }

      if (filters?.isConfidential !== undefined) {
        filteredDocuments = filteredDocuments.filter(doc => doc.isConfidential === (filters.isConfidential === 'true'));
      }

      // Sort by upload date (most recent first)
      filteredDocuments.sort((a, b) => {
        const dateA = new Date(a.uploadDate || a.createdAt || 0).getTime();
        const dateB = new Date(b.uploadDate || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      const total = filteredDocuments.length;
      const paginatedDocuments = filteredDocuments.slice(skip, skip + limit);

      return {
        documents: paginatedDocuments,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error in getAllDocuments:', error);
      throw error;
    }
  }

  async generateReport(schoolId: string, reportConfig: any): Promise<any> {
    const query: any = { schoolId: new Types.ObjectId(schoolId) };

    if (reportConfig.startDate && reportConfig.endDate) {
      query.createdAt = {
        $gte: new Date(reportConfig.startDate),
        $lte: new Date(reportConfig.endDate)
      };
    }

    const records = await this.healthRecordModel
      .find(query)
      .populate({
        path: 'studentId',
        select: 'firstName lastName gradeLevel dateOfBirth dob class',
        populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
      });

    switch (reportConfig.reportType) {
      case 'health-overview':
        return this.generateHealthOverviewReport(records, reportConfig);
      case 'immunization-status':
        return this.generateImmunizationReport(records);
      case 'medication-log':
        return this.generateMedicationReport(records);
      case 'nurse-visits':
        return this.generateNurseVisitReport(records);
      case 'health-alerts':
        return this.generateHealthAlertReport(records);
      default:
        throw new BadRequestException('Invalid report type');
    }
  }

  private generateHealthOverviewReport(records: HealthRecord[], config: any): any {
    const calculateAge = (dateOfBirth: Date | string | undefined): number | null => {
      if (!dateOfBirth) return null;
      const dob = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    };

    const studentOverviews = records.map(record => {
      const student = record.studentId as any;
      const profile = student?.studentProfileId;
      const studentName = profile
        ? `${(profile as any).firstName || ''} ${(profile as any).lastName || ''}`.trim()
        : (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown Student') || 'Unknown Student';
      const gradeLevel = (profile as any)?.gradeLevel ?? student?.gradeLevel ?? student?.class ?? 'N/A';
      const dateOfBirth = student?.dateOfBirth ?? student?.dob ?? null;
      const age = calculateAge(dateOfBirth);

      const lastNurseVisit = record.nurseVisits && record.nurseVisits.length > 0
        ? record.nurseVisits[record.nurseVisits.length - 1]
        : null;
      const nurseName = (lastNurseVisit as any)?.recordedByName?.trim() || 'N/A';

      const activeMedications = record.medicationLog
        ? record.medicationLog
            .filter((med: any) => med.isActive)
            .map((med: any) => med.medicationName || 'N/A')
        : [];
      const medicationNamesStr = activeMedications.length > 0 ? activeMedications.join('; ') : 'None';

      return {
        studentId: record.studentId,
        studentName,
        grade: gradeLevel,
        age: age,
        nurseName,
        medicationNames: activeMedications,
        medicationNamesStr,
        totalMedications: activeMedications.length,
        medicalConditions: record.medicalConditions || [],
        allergies: record.allergies || [],
        totalNurseVisits: record.nurseVisits?.length || 0,
        activeAlerts: record.healthAlerts?.filter((a: any) => a.isActive)?.length || 0,
        lastVisitDate: lastNurseVisit?.visitDate || null,
        lastVisitReason: lastNurseVisit?.reason || null
      };
    });

    return {
      reportType: 'Health Overview',
      generatedAt: new Date(),
      totalStudents: records.length,
      studentsWithHealthRecords: records.filter(r => r.medicalConditions?.length > 0 || r.allergies?.length > 0).length,
      totalNurseVisits: records.reduce((sum, r) => sum + (r.nurseVisits?.length || 0), 0),
      activeAlerts: records.reduce((sum, r) => sum + (r.healthAlerts?.filter(a => a.isActive)?.length || 0), 0),
      activeMedications: records.reduce((sum, r) => sum + (r.medicationLog?.filter(m => m.isActive)?.length || 0), 0),
      studentOverviews: studentOverviews,
      config
    };
  }

  async getMedicationReport(schoolId: string): Promise<any> {
    const records = await this.healthRecordModel
      .find({ schoolId: new Types.ObjectId(schoolId) })
      .populate({
        path: 'studentId',
        select: 'firstName lastName gradeLevel class studentProfileId',
        populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
      });

    return this.generateMedicationReport(records);
  }

  async getVisitsReport(schoolId: string): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const records = await this.healthRecordModel
        .find({ schoolId: new Types.ObjectId(schoolId) })
        .populate('studentId', 'firstName lastName gradeLevel class');

      return this.generateNurseVisitReport(records);
    } catch (error: any) {
      console.error('Error in getVisitsReport:', error);
      throw new BadRequestException(error.message || 'Failed to generate visits report');
    }
  }

  async getHealthAlertsReport(schoolId: string): Promise<any> {
    const records = await this.healthRecordModel
      .find({ schoolId: new Types.ObjectId(schoolId) })
      .populate({
        path: 'studentId',
        select: 'firstName lastName gradeLevel class studentProfileId',
        populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
      });

    return this.generateHealthAlertReport(records);
  }

  // ==================== GET ALL NURSE VISITS WITH PAGINATION ====================

  async getNurseVisitStats(schoolId: string): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      const query: any = {
        schoolId: new Types.ObjectId(schoolId),
        'nurseVisits.0': { $exists: true }
      };

      // Get all health records with nurse visits
      const healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      // Flatten all visits
      const allVisits: any[] = [];
      healthRecords.forEach(record => {
        if (record.nurseVisits && Array.isArray(record.nurseVisits) && record.nurseVisits.length > 0) {
          record.nurseVisits.forEach((visit: any) => {
            allVisits.push(visit);
          });
        }
      });

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const totalVisits = allVisits.length;
      const visitsToday = allVisits.filter((visit: any) => {
        const visitDate = new Date(visit.visitDate);
        return visitDate >= today && visitDate <= todayEnd;
      }).length;

      const emergencyVisits = allVisits.filter((visit: any) => {
        const priority = (visit.priority || '').toLowerCase();
        return priority === 'emergency' || priority === 'high';
      }).length;

      const followUpRequired = allVisits.filter((visit: any) => {
        const status = (visit.status || '').toLowerCase().replace(/\s+/g, '_');
        return status === 'follow_up_required' || visit.followUpNeeded || visit.followUpRequired;
      }).length;

      return {
        totalVisits,
        visitsToday,
        emergencyVisits,
        followUpRequired
      };
    } catch (error: any) {
      console.error('Error in getNurseVisitStats:', error);
      throw new BadRequestException(error.message || 'Failed to retrieve nurse visit stats');
    }
  }

  async getAllNurseVisits(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      console.log(`[getAllNurseVisits] Starting query for schoolId: ${schoolId}, type: ${typeof schoolId}`);

      // First, let's check all health records for this school to see what we have
      const allHealthRecords = await this.healthRecordModel
        .find({ schoolId: new Types.ObjectId(schoolId) })
        .lean();
      
      console.log(`[getAllNurseVisits] Total health records for school: ${allHealthRecords.length}`);
      
      // Count records with nurse visits
      const recordsWithVisits = allHealthRecords.filter(r => 
        r.nurseVisits && Array.isArray(r.nurseVisits) && r.nurseVisits.length > 0
      );
      console.log(`[getAllNurseVisits] Health records with nurse visits: ${recordsWithVisits.length}`);
      
      if (recordsWithVisits.length > 0) {
        console.log(`[getAllNurseVisits] Sample record:`, {
          _id: recordsWithVisits[0]._id,
          studentId: recordsWithVisits[0].studentId,
          nurseVisitsCount: recordsWithVisits[0].nurseVisits?.length,
          schoolId: recordsWithVisits[0].schoolId
        });
      }

      // Try multiple query approaches to ensure we find all records
      let query: any = {
        schoolId: new Types.ObjectId(schoolId),
        // Find records with at least one nurse visit
        // Check if first element exists (array has at least one element)
        'nurseVisits.0': { $exists: true }
      };

      // Pagination
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      // Get health records with nurse visits
      let healthRecords = await this.healthRecordModel
        .find(query)
        .populate('studentId', 'firstName lastName gradeLevel class studentId email')
        .lean();

      console.log(`[getAllNurseVisits] Query result: Found ${healthRecords.length} health records with nurse visits for school ${schoolId}`);

      // If no results, try alternative query (in case schoolId format is different)
      if (healthRecords.length === 0 && recordsWithVisits.length > 0) {
        console.log(`[getAllNurseVisits] Trying alternative query without ObjectId conversion...`);
        query = {
          schoolId: schoolId, // Try as string
          'nurseVisits.0': { $exists: true }
        };
        healthRecords = await this.healthRecordModel
          .find(query)
          .populate('studentId', 'firstName lastName gradeLevel class studentId email')
          .lean();
        console.log(`[getAllNurseVisits] Alternative query result: Found ${healthRecords.length} health records`);
      }

      // If still no results but we know records exist, get all and filter in memory
      if (healthRecords.length === 0 && recordsWithVisits.length > 0) {
        console.log(`[getAllNurseVisits] Using fallback: fetching all records and filtering in memory...`);
        const allRecords = await this.healthRecordModel
          .find({ schoolId: new Types.ObjectId(schoolId) })
          .populate('studentId', 'firstName lastName gradeLevel class studentId email')
          .lean();
        
        healthRecords = allRecords.filter(r => 
          r.nurseVisits && Array.isArray(r.nurseVisits) && r.nurseVisits.length > 0
        );
        console.log(`[getAllNurseVisits] Fallback result: Found ${healthRecords.length} health records with nurse visits`);
      }

      // Flatten all visits with student info
      const allVisits: any[] = [];
      healthRecords.forEach((record, index) => {
        console.log(`[getAllNurseVisits] Processing record ${index + 1}/${healthRecords.length}:`, {
          recordId: record._id,
          hasNurseVisits: !!record.nurseVisits,
          isArray: Array.isArray(record.nurseVisits),
          visitsLength: record.nurseVisits?.length || 0,
          hasStudentId: !!record.studentId,
          studentIdType: typeof record.studentId,
          studentIdValue: record.studentId
        });

        // Check if nurseVisits exists and is an array with items
        const visits = record.nurseVisits;
        const hasVisits = visits && Array.isArray(visits) && visits.length > 0;
        
        console.log(`[getAllNurseVisits] Record ${record._id} visit check:`, {
          hasVisits,
          visitsType: typeof visits,
          isArray: Array.isArray(visits),
          length: visits?.length,
          firstVisit: visits?.[0] ? {
            hasId: !!((visits[0] as any)._id || (visits[0] as any).id),
            visitDate: (visits[0] as any).visitDate,
            reason: (visits[0] as any).reason
          } : null
        });

        if (hasVisits) {
          const student = record.studentId as any;
          console.log(`[getAllNurseVisits] Processing ${visits.length} visits for record ${record._id}`);
          
          if (!student) {
            console.warn(`[getAllNurseVisits] Warning: Record ${record._id} has visits but no studentId populated`);
          }
          
          visits.forEach((visit: any, visitIndex: number) => {
            console.log(`[getAllNurseVisits] Processing visit ${visitIndex + 1}/${visits.length}:`, {
              visitId: (visit as any)._id || (visit as any).id,
              hasId: !!((visit as any)._id || (visit as any).id),
              visitDate: (visit as any).visitDate,
              reason: (visit as any).reason
            });
            
            // Handle case where student might not be populated
            const studentId = student?._id || record.studentId || null;
            const studentInfo = student ? {
              _id: student._id,
              firstName: student.firstName,
              lastName: student.lastName,
              gradeLevel: student.gradeLevel || student.class,
              studentId: student.studentId,
              email: student.email
            } : {
              _id: record.studentId,
              firstName: 'Unknown',
              lastName: 'Student',
              gradeLevel: 'N/A',
              studentId: 'N/A',
              email: 'N/A'
            };
            
            const visitData = visit as any;
            allVisits.push({
              _id: visitData._id || visitData.id || `temp_${Date.now()}_${visitIndex}`,
              studentId: studentId,
              student: studentInfo,
              visitDate: visitData.visitDate,
              visitTime: visitData.visitTime,
              reason: visitData.reason,
              symptoms: visitData.symptoms,
              temperature: visitData.temperature,
              bloodPressure: visitData.bloodPressure,
              heartRate: visitData.heartRate,
              weight: visitData.weight,
              height: visitData.height,
              treatment: visitData.treatment,
              medications: visitData.medications || [],
              followUpNeeded: visitData.followUpNeeded,
              parentNotified: visitData.parentNotified,
              returnToClass: visitData.returnToClass,
              restrictionsNotes: visitData.restrictionsNotes,
              priority: visitData.priority,
              status: visitData.status,
              disposition: visitData.disposition,
              dispositionTime: visitData.dispositionTime,
              visitDuration: visitData.visitDuration,
              actionTaken: visitData.actionTaken || [],
              nurseNotes: visitData.nurseNotes,
              parentContacted: visitData.parentContacted,
              contactMethod: visitData.contactMethod,
              followUpRequired: visitData.followUpRequired,
              followUpDate: visitData.followUpDate,
              createdAt: visitData.createdAt || (record as any).createdAt,
              updatedAt: visitData.updatedAt || (record as any).updatedAt
            });
          });
        }
      });

      console.log(`[getAllNurseVisits] Flattened ${allVisits.length} total visits from ${healthRecords.length} health records`);

      // Apply filters
      let filteredVisits = allVisits;

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filteredVisits = filteredVisits.filter(visit =>
          visit.student?.firstName?.toLowerCase().includes(searchLower) ||
          visit.student?.lastName?.toLowerCase().includes(searchLower) ||
          visit.reason?.toLowerCase().includes(searchLower) ||
          visit.treatment?.toLowerCase().includes(searchLower)
        );
      }

      if (filters?.priority && filters.priority !== 'all') {
        // Handle both enum values and display labels
        const priorityValue = filters.priority.toLowerCase();
        filteredVisits = filteredVisits.filter(visit => {
          const visitPriority = (visit.priority || '').toLowerCase();
          return visitPriority === priorityValue;
        });
      }

      if (filters?.status && filters.status !== 'all') {
        // Handle both enum values and display labels
        const statusValue = filters.status.toLowerCase().replace(/\s+/g, '_');
        filteredVisits = filteredVisits.filter(visit => {
          const visitStatus = (visit.status || '').toLowerCase().replace(/\s+/g, '_');
          return visitStatus === statusValue;
        });
      }


      if (filters?.studentId) {
        filteredVisits = filteredVisits.filter(visit =>
          visit.studentId?.toString() === filters.studentId
        );
      }

      // Sort by createdAt (most recently added first)
      filteredVisits.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.visitDate || 0).getTime();
        const dateB = new Date(b.createdAt || b.visitDate || 0).getTime();
        return dateB - dateA; // Descending order (newest first)
      });

      const total = filteredVisits.length;
      const paginatedVisits = filteredVisits.slice(skip, skip + limit);

      console.log(`[getAllNurseVisits] Total visits: ${total}, Returning page ${page} with ${paginatedVisits.length} visits`);

      return {
        visits: paginatedVisits,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error: any) {
      console.error('Error in getAllNurseVisits:', error);
      throw new BadRequestException(error.message || 'Failed to retrieve nurse visits');
    }
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  // return bcrypt.hash(password, salt);

  return '123';
}

function generateRandomPassword(length = 10): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
} 
