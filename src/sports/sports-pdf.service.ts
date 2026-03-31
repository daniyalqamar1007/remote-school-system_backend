import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { Readable } from 'stream';

@Injectable()
export class SportsPdfService {
  /**
   * Generate PDF for sports overview report
   */
  async generateOverviewPdf(reportData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Sports Program Overview Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Summary Statistics
      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics');
      doc.moveDown(0.5);
      
      const summary = [
        ['Total Programs:', reportData.totalPrograms || 0],
        ['Total Students:', reportData.totalStudents || 0],
        ['Average Attendance:', `${(reportData.attendanceSummary?.averageAttendance || 0).toFixed(1)}%`]
      ];

      summary.forEach(([label, value]) => {
        doc.fontSize(11).font('Helvetica').text(`${label} `, { continued: true })
           .font('Helvetica-Bold').text(`${value}`);
      });
      doc.moveDown(2);

      // Programs List
      if (reportData.programs && reportData.programs.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Programs');
        doc.moveDown(0.5);

        // Table header
        const tableTop = doc.y;
        const colWidths = { name: 200, sport: 150, students: 100 };
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Program Name', 50, tableTop, { width: colWidths.name, continued: true })
           .text('Sport', { width: colWidths.sport, continued: true })
           .text('Students', { width: colWidths.students });
        
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font('Helvetica');
        reportData.programs.forEach((program: any) => {
          const y = doc.y;
          
          if (y > 700) {
            doc.addPage();
            doc.y = 50;
          }
          
          doc.text(program.name || 'N/A', 50, doc.y, { width: colWidths.name, continued: true })
             .text(program.sport || 'N/A', { width: colWidths.sport, continued: true })
             .text(String(program.studentCount || 0), { width: colWidths.students });
          doc.moveDown(0.5);
        });
      }

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
      }

      doc.end();
    });
  }

  /**
   * Generate PDF for participation report
   */
  async generateParticipationPdf(reportData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Sports Participation Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Participation Statistics
      if (reportData.participationStats && reportData.participationStats.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Program Participation');
        doc.moveDown(0.5);

        reportData.participationStats.forEach((stat: any) => {
          doc.fontSize(12).font('Helvetica-Bold').text(stat._id?.programName || 'Unknown Program');
          doc.fontSize(10).font('Helvetica');
          doc.text(`Total Participants: ${stat.totalParticipants || 0}`);
          doc.text(`Active Participants: ${stat.activeParticipants || 0}`);
          doc.text(`Eligible Participants: ${stat.eligibleParticipants || 0}`);
          
          if (stat.gradeBreakdown && stat.gradeBreakdown.length > 0) {
            doc.text('Grade Breakdown:');
            stat.gradeBreakdown.forEach((grade: any) => {
              doc.text(`  Grade ${grade.grade}: ${grade.count} students`, { indent: 20 });
            });
          }
          
          doc.moveDown(1.5);
        });
      } else {
        doc.fontSize(11).font('Helvetica').text('No participation data available for the selected period.');
      }

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
      }

      doc.end();
    });
  }

  /**
   * Generate PDF for attendance report
   */
  async generateAttendancePdf(reportData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Sports Attendance Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Attendance Statistics
      if (reportData.attendanceStats && reportData.attendanceStats.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Student Attendance');
        doc.moveDown(0.5);

        // Table header
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Student', 50, doc.y, { width: 150, continued: true })
           .text('Program', { width: 120, continued: true })
           .text('Sessions', { width: 60, continued: true })
           .text('Present', { width: 60, continued: true })
           .text('Rate', { width: 60 });
        
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font('Helvetica');
        reportData.attendanceStats.forEach((stat: any) => {
          const y = doc.y;
          
          if (y > 700) {
            doc.addPage();
            doc.y = 50;
          }
          
          const studentName = `${stat.student?.firstName || ''} ${stat.student?.lastName || ''}`.trim() || 'N/A';
          const programName = stat.sportsProgram?.name || 'N/A';
          
          doc.fontSize(9).text(studentName, 50, doc.y, { width: 150, continued: true })
             .text(programName, { width: 120, continued: true })
             .text(String(stat.totalSessions || 0), { width: 60, continued: true })
             .text(String(stat.presentCount || 0), { width: 60, continued: true })
             .text(`${(stat.attendanceRate || 0).toFixed(0)}%`, { width: 60 });
          doc.moveDown(0.5);
        });
      } else {
        doc.fontSize(11).font('Helvetica').text('No attendance data available for the selected period.');
      }

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
      }

      doc.end();
    });
  }
}
