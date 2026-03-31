import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, Req, Res } from '@nestjs/common';
import { Request } from 'express';
import { Response } from 'express';
import { HealthService } from './health.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('health')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Health profile
  @Get('profile/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  getHealthProfile(@Param('studentId') studentId: string, @Req() req: Request) {
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.getHealthProfile(studentId, userSchoolId);
  }

  @Put('profile/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  upsertHealthProfile(@Param('studentId') studentId: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.upsertHealthProfile(studentId, body, actorId, userSchoolId);
  }

  // Allergies visible to all staff
  @Get('allergies/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT, UserRole.PARENT)
  getAllergies(@Param('studentId') studentId: string, @Req() req: Request) {
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.getAllergies(studentId, userSchoolId);
  }

  @Put('allergies/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  updateAllergies(@Param('studentId') studentId: string, @Body() body: { allergies: string[] }, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.updateAllergies(studentId, body.allergies, actorId, userSchoolId);
  }

  // Immunization
  @Get('immunizations/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  getImmunizations(@Param('studentId') studentId: string, @Req() req: Request) {
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.getImmunizations(studentId, userSchoolId);
  }

  @Post('immunizations/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  addImmunization(@Param('studentId') studentId: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.addImmunization(studentId, body, actorId, userSchoolId);
  }

  // Medication logs (simple, no standing orders)
  @Get('medications/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  getMedicationLogs(@Param('studentId') studentId: string, @Req() req: Request) {
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.getMedicationLogs(studentId, userSchoolId);
  }

  @Post('medications/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  addMedicationLog(@Param('studentId') studentId: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.addMedicationLog(studentId, body, actorId, userSchoolId);
  }

  // Nurse visits
  @Get('visits/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  getNurseVisits(@Param('studentId') studentId: string, @Req() req: Request) {
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.getNurseVisits(studentId, userSchoolId);
  }

  @Post('visits/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  addNurseVisit(@Param('studentId') studentId: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    const userSchoolId = (req as any)?.user?.schoolId?.toString();
    return this.healthService.addNurseVisit(studentId, body, actorId, userSchoolId);
  }

  // Reports
  @Get('reports/visits')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  visitsReport(@Query('date') date?: string) {
    return this.healthService.generateVisitsReport(date);
  }

  @Get('reports/medications')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  medicationsReport(@Query('date') date?: string) {
    return this.healthService.generateMedicationsReport(date);
  }

  @Get('reports/immunizations')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  immunizationsReport() {
    return this.healthService.generateImmunizationsReport();
  }

  // PDF exports (basic layout)
  @Get('reports/visits/pdf')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  async visitsReportPdf(@Res() res: Response, @Query('date') date?: string) {
    const data = await this.healthService.generateVisitsReport(date);
    // Lazy require to avoid type deps
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="visits-report.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Daily Nurse Visits Report', { underline: true });
    if (date) doc.moveDown(0.2).fontSize(10).text(`Date filter: ${date}`);
    doc.moveDown();
    data.forEach((v) => {
      doc.fontSize(12).text(`Student: ${String(v.studentId)}`);
      doc.fontSize(10).text(`Visit: ${v.visitDateTime} | Reason: ${v.reason} | Action: ${v.actionTaken}`);
      doc.text(`Disposition: ${v.disposition} | Parent contacted: ${v.parentContacted ? 'Yes' : 'No'} ${v.contactMethod ? '('+v.contactMethod+')' : ''}`);
      if (v.notes) doc.text(`Notes: ${v.notes}`);
      doc.moveDown(0.8);
    });
    doc.end();
  }

  @Get('reports/medications/pdf')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  async medicationsReportPdf(@Res() res: Response, @Query('date') date?: string) {
    const data = await this.healthService.generateMedicationsReport(date);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="medications-report.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Medication Administration Report', { underline: true });
    if (date) doc.moveDown(0.2).fontSize(10).text(`Date filter: ${date}`);
    doc.moveDown();
    data.forEach((m) => {
      doc.fontSize(12).text(`Student: ${String(m.studentId)} | Medication: ${m.medication}`);
      doc.fontSize(10).text(`Dosage: ${m.dosage} | Frequency: ${m.frequency} | By: ${m.administeredBy}`);
      doc.text(`Start: ${m.startDate} | End: ${m.endDate} | At: ${m.dateTime}`);
      if (m.description) doc.text(`Description: ${m.description}`);
      doc.moveDown(0.8);
    });
    doc.end();
  }

  @Get('reports/immunizations/pdf')
  @Roles(UserRole.NURSE, UserRole.ADMIN)
  async immunizationsReportPdf(@Res() res: Response) {
    const data = await this.healthService.generateImmunizationsReport();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="immunizations-report.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Immunizations Report', { underline: true });
    doc.moveDown();
    data.forEach((im) => {
      doc.fontSize(12).text(`Student: ${String(im.studentId)} | Vaccine: ${im.vaccineName}`);
      doc.fontSize(10).text(`Date: ${im.date} ${im.lotNumber ? '| Lot: ' + im.lotNumber : ''}`);
      if (im.fileUrl) doc.text(`File: ${im.fileUrl}`);
      doc.moveDown(0.8);
    });
    doc.end();
  }

  // Medical Documents - Parent Portal Access
  @Get('medical-documents/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  getMedicalDocuments(@Param('studentId') studentId: string) {
    return this.healthService.getMedicalDocuments(studentId);
  }

  @Get('medical-documents/:studentId/type/:type')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  getMedicalDocumentsByType(@Param('studentId') studentId: string, @Param('type') type: string) {
    return this.healthService.getMedicalDocumentsByType(studentId, type);
  }

  @Post('medical-documents')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  createMedicalDocument(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    return this.healthService.createMedicalDocument(body, actorId);
  }

  @Put('medical-documents/:documentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  updateMedicalDocument(@Param('documentId') documentId: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any)?.user?.sub;
    return this.healthService.updateMedicalDocument(documentId, body, actorId);
  }

  // Health Conditions for Parent Portal
  @Get('conditions/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT, UserRole.TEACHER)
  getHealthConditions(@Param('studentId') studentId: string) {
    return this.healthService.getHealthConditions(studentId);
  }

  @Post('conditions/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.PARENT)
  addHealthCondition(
    @Param('studentId') studentId: string, 
    @Body() body: { condition: string }, 
    @Req() req: Request
  ) {
    const actorId = (req as any)?.user?.sub;
    return this.healthService.addHealthCondition(studentId, body.condition, actorId);
  }

  // Parent-specific endpoints
  @Get('parent/:parentId/medical-documents')
  @Roles(UserRole.PARENT)
  getMedicalDocumentsByParent(@Param('parentId') parentId: string) {
    return this.healthService.getMedicalDocumentsByParent(parentId);
  }
}


