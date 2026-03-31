import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { EmailTemplate, EmailTemplateDocument } from './schema/email-template.schema';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private isConfigured: boolean = false;

  constructor(
    @InjectModel(EmailTemplate.name) private templateModel: Model<EmailTemplateDocument>,
  ) {
    // Initialize nodemailer transporter
    this.setupTransporter();
  }

  private setupTransporter() {
    // Check if email credentials are properly configured
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    
    if (!smtpUser || !smtpPass || smtpUser === 'your-email@gmail.com' || smtpPass === 'your-app-password') {
      console.warn('⚠️ Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
      console.log('📧 To enable emails:');
      console.log('   1. Copy .env.example to .env');
      console.log('   2. Set SMTP_USER to your Gmail address');
      console.log('   3. Set SMTP_PASS to your Gmail App Password (16 characters)');
      console.log('   4. Enable 2FA on Gmail and generate App Password');
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.isConfigured = true;
      console.log('✅ Email service configured successfully');
      
      // Note: skip immediate transporter.verify() logs in development to avoid leaking credentials in console
      // The transporter will still attempt to send emails when used; errors will be caught per-send.
        
    } catch (error) {
      console.error('❌ Failed to configure email service:', error);
      this.isConfigured = false;
    }
  }

  // ==================== EMAIL TEMPLATE MANAGEMENT ====================

  /**
   * Create a new email template
   */
  async createTemplate(schoolId: string, templateData: any, createdBy: string): Promise<EmailTemplate> {
    // Check for duplicate template name
    const existing = await this.templateModel.findOne({
      schoolId: new Types.ObjectId(schoolId),
      templateName: templateData.templateName
    });

    if (existing) {
      throw new BadRequestException('Template with this name already exists');
    }

    const template = new this.templateModel({
      ...templateData,
      schoolId: new Types.ObjectId(schoolId),
      createdBy,
      updatedBy: createdBy
    });

    return template.save();
  }

  /**
   * Get all email templates for a school
   */
  async getTemplates(schoolId: string, category?: string, includeInactive: boolean = false): Promise<EmailTemplate[]> {
    const query: any = {
      schoolId: new Types.ObjectId(schoolId)
    };

    if (!includeInactive) {
      query.isActive = true;
    }

    if (category) {
      query.category = category;
    }

    return this.templateModel.find(query).sort({ templateName: 1 });
  }

  /**
   * Get a specific email template by ID
   */
  async getTemplateById(templateId: string): Promise<EmailTemplate> {
    const template = await this.templateModel.findById(templateId);

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template;
  }

  /**
   * Get a template by name for a school
   */
  async getTemplateByName(schoolId: string, templateName: string): Promise<EmailTemplate> {
    const template = await this.templateModel.findOne({
      schoolId: new Types.ObjectId(schoolId),
      templateName
    });

    if (!template) {
      throw new NotFoundException(`Template '${templateName}' not found`);
    }

    return template;
  }

  /**
   * Update an email template
   */
  async updateTemplate(templateId: string, updateData: any, updatedBy: string): Promise<EmailTemplate> {
    const template = await this.templateModel.findByIdAndUpdate(
      templateId,
      { ...updateData, updatedBy },
      { new: true }
    );

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template;
  }

  /**
   * Delete an email template
   */
  async deleteTemplate(templateId: string): Promise<{ message: string }> {
    const result = await this.templateModel.findByIdAndDelete(templateId);

    if (!result) {
      throw new NotFoundException('Email template not found');
    }

    return { message: 'Template deleted successfully' };
  }

  /**
   * Soft delete an email template (set isActive to false)
   */
  async deactivateTemplate(templateId: string, updatedBy: string): Promise<EmailTemplate> {
    const template = await this.templateModel.findByIdAndUpdate(
      templateId,
      { isActive: false, updatedBy },
      { new: true }
    );

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template;
  }

  /**
   * Render template with variables
   */
  renderTemplate(templateContent: string, variables: Record<string, any>): string {
    let rendered = templateContent;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }

    return rendered;
  }

  /**
   * Send email using a template
   */
  async sendEmailWithTemplate(
    to: string,
    templateId: string,
    variables: Record<string, any> = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const template = await this.getTemplateById(templateId);

      const subject = this.renderTemplate(template.subject, variables);
      const htmlBody = this.renderTemplate(template.htmlBody, variables);
      const textBody = template.textBody ? this.renderTemplate(template.textBody, variables) : undefined;

      const success = await this.sendEmail(to, subject, textBody || '', htmlBody);
      return { success };
    } catch (error) {
      console.error('Error sending templated email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email using template name
   */
  async sendEmailByTemplateName(
    schoolId: string,
    to: string,
    templateName: string,
    variables: Record<string, any> = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const template = await this.getTemplateByName(schoolId, templateName);

      const subject = this.renderTemplate(template.subject, variables);
      const htmlBody = this.renderTemplate(template.htmlBody, variables);
      const textBody = template.textBody ? this.renderTemplate(template.textBody, variables) : undefined;

      const success = await this.sendEmail(to, subject, textBody || '', htmlBody);
      return { success };
    } catch (error) {
      console.error('Error sending templated email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(
    userEmail: string,
    userFirstName: string,
    userLastName: string,
    role: string,
    temporaryPassword: string
  ): Promise<boolean> {
    // Skip email sending if not configured but log the credentials
    if (!this.isConfigured) {
      console.log('\n' + '='.repeat(60));
      console.log('📧 EMAIL SERVICE NOT CONFIGURED - CREDENTIALS BELOW:');
      console.log('='.repeat(60));
      console.log(`� User: ${userFirstName} ${userLastName}`);
      console.log(`📧 Email: ${userEmail}`);
      console.log(`🔑 Temporary Password: ${temporaryPassword}`);
      console.log(`👔 Role: ${role}`);
      console.log(`🔗 Login URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`);
      console.log('⚠️  User must change password on first login');
      console.log('='.repeat(60) + '\n');
      return false;
    }

    try {
      const loginUrl = `${process.env.FRONTEND_URL || 'http://ec2-3-17-131-17.us-east-2.compute.amazonaws.com:3000'}/login`;
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'SRS System <noreply@srs.edu>',
        to: userEmail,
        subject: 'Welcome to Student Revelation System - Your Account Credentials',
        html: this.generateWelcomeEmailTemplate(userFirstName, userLastName, userEmail, role, temporaryPassword, loginUrl),
        text: this.generateWelcomeEmailText(userFirstName, userLastName, userEmail, role, temporaryPassword, loginUrl),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email sent to ${userEmail} (Message ID: ${info.messageId})`);
      
      // Log credentials to console as backup
      console.log(`📧 Backup - Credentials for ${userEmail}: Password = ${temporaryPassword}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error);
      
      // Log credentials to console as fallback
      console.log('\n' + '='.repeat(60));
      console.log('❌ EMAIL FAILED - CREDENTIALS BELOW:');
      console.log('='.repeat(60));
      console.log(`👤 User: ${userFirstName} ${userLastName}`);
      console.log(`📧 Email: ${userEmail}`);
      console.log(`🔑 Temporary Password: ${temporaryPassword}`);
      console.log(`👔 Role: ${role}`);
      console.log(`🔗 Login URL: ${process.env.FRONTEND_URL || 'http://ec2-3-17-131-17.us-east-2.compute.amazonaws.com:3000'}/login`);
      console.log('⚠️  User must change password on first login');
      console.log('='.repeat(60) + '\n');
      
      return false;
    }
  }

  private generateWelcomeEmailTemplate(
    firstName: string, 
    lastName: string, 
    email: string, 
    role: string, 
    password: string, 
    loginUrl: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SRS</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: #000000; padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Welcome to SRS!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">Student Revelation System</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${firstName} ${lastName}!</h2>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Your account has been successfully created in the Student Revelation System. 
              You have been assigned the role of <strong style="color: #000000;">${role}</strong>.
            </p>
            
            <!-- Credentials Box -->
            <div style="background: #f8f9fa; border: 2px solid #000000; border-radius: 12px; padding: 25px; margin: 30px 0;">
              <h3 style="color: #333; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
                <span style="margin-right: 10px;">🔐</span>
                Your Login Credentials
              </h3>
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 10px 0; color: #333; font-size: 16px;">
                  <strong>📧 Email:</strong> <code style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; color: #495057;">${email}</code>
                </p>
                <p style="margin: 10px 0; color: #333; font-size: 16px;">
                  <strong>🔑 Temporary Password:</strong> <code style="background: #fff3cd; padding: 8px 12px; border-radius: 4px; color: #856404; font-size: 18px; font-weight: bold; letter-spacing: 1px;">${password}</code>
                </p>
              </div>
            </div>
            
            <!-- Important Notice -->
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h4 style="color: #856404; margin: 0 0 10px 0; display: flex; align-items: center;">
                <span style="margin-right: 8px;">⚠️</span>
                Important Security Notice
              </h4>
              <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                <strong>You must change your password immediately after your first login.</strong> 
                This temporary password will expire and you'll be required to set a new, secure password.
              </p>
            </div>
            
            <!-- Login Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${loginUrl}" 
                 target="_blank"
                 rel="noopener noreferrer"
                 style="background: #000000; 
                        color: white; 
                        padding: 15px 35px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        display: inline-block; 
                        font-weight: bold;
                        font-size: 16px;
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);">
                🚀 Login to SRS
              </a>
              <p style="margin-top: 15px; color: #666; font-size: 14px;">
                Or copy and paste this link: <a href="${loginUrl}" target="_blank" style="color: #000000; text-decoration: underline;">${loginUrl}</a>
              </p>
            </div>
            
            <!-- Instructions -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h4 style="color: #000000; margin: 0 0 15px 0;">📋 Getting Started:</h4>
              <ol style="color: #374151; margin: 0; padding-left: 20px;">
                <li style="margin: 8px 0;">Click the login button above</li>
                <li style="margin: 8px 0;">Enter your email and temporary password</li>
                <li style="margin: 8px 0;">You'll be prompted to create a new password</li>
                <li style="margin: 8px 0;">Complete your profile setup</li>
              </ol>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8f9fa; padding: 25px 30px; border-top: 1px solid #e9ecef; text-align: center;">
            <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px 0;">
              If you have any questions or need assistance, please contact your system administrator.
            </p>
            <p style="color: #6c757d; font-size: 12px; margin: 0;">
              This is an automated message from the Student Revelation System. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateWelcomeEmailText(
    firstName: string, 
    lastName: string, 
    email: string, 
    role: string, 
    password: string, 
    loginUrl: string
  ): string {
    return `
Welcome to Student Revelation System!

Hello ${firstName} ${lastName},

Your account has been successfully created with the role of ${role}.

LOGIN CREDENTIALS:
Email: ${email}
Temporary Password: ${password}

IMPORTANT: You must change your password immediately after your first login.

Login here: ${loginUrl}

Getting Started:
1. Click the login link above
2. Enter your email and temporary password
3. You'll be prompted to create a new password
4. Complete your profile setup

If you have any questions, please contact your system administrator.

---
Student Revelation System
This is an automated message. Please do not reply.
    `;
  }

  async sendPasswordResetEmail(
    userEmail: string,
    userFirstName: string,
    resetToken: string
  ): Promise<boolean> {
    // Skip email sending if not configured
    if (!this.isConfigured) {
      console.log(`📧 Email service not configured. Skipping password reset email for ${userEmail}`);
      return false;
    }

    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://ec2-3-17-131-17.us-east-2.compute.amazonaws.com:3000'}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'SRS System <noreply@srs.edu>',
        to: userEmail,
        subject: 'Password Reset Request - Student Revelation System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Student Revelation System</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
              <h2 style="color: #333; margin-top: 0;">Hello ${userFirstName}!</h2>
              
              <p style="color: #666; line-height: 1.6;">
                We received a request to reset your password for your Student Revelation System account.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #000000; 
                          color: white; 
                          padding: 12px 30px; 
                          text-decoration: none; 
                          border-radius: 25px; 
                          display: inline-block; 
                          font-weight: bold;">
                  Reset Your Password
                </a>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #856404;">
                  <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
                </p>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #999; font-size: 14px; margin: 0;">
                  If the button doesn't work, copy and paste this link into your browser:
                </p>
                <p style="color: #999; font-size: 14px; margin: 5px 0 0 0; word-break: break-all;">
                  ${resetUrl}
                </p>
              </div>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      return false;
    }
  }

  async sendMFACode(
    userEmail: string,
    mfaCode: string,
    userName: string = 'User',
    schoolName: string = 'School'
  ): Promise<boolean> {
    if (!this.isConfigured) {
      console.log(`📧 Email service not configured. Skipping MFA email for ${userEmail}`);
      console.log(`🔐 MFA Code for ${userEmail}: ${mfaCode}`);
      return false;
    }

    try {
      const mailOptions = {
        from: `"${schoolName} Portal Security" <${process.env.SMTP_USER}>`,
        to: userEmail,
        subject: `Multi-Factor Authentication Code - ${schoolName}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: #000000; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Security Verification</h1>
              <p style="color: #f8f9fa; margin: 10px 0 0 0; opacity: 0.9;">${schoolName} Portal</p>
            </div>
            
            <div style="padding: 40px 30px; background: white; border-left: 4px solid #000000;">
              <h2 style="color: #333; margin-top: 0;">Hello ${userName}!</h2>
              
              <p style="color: #666; line-height: 1.6; font-size: 16px;">
                Someone is trying to sign in to your ${schoolName} Portal account. To complete the login process, 
                please enter the verification code below:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="background: #f8f9fa; border: 2px dashed #000000; border-radius: 12px; padding: 20px; display: inline-block;">
                  <p style="color: #666; margin: 0 0 10px 0; font-size: 14px;">Your verification code is:</p>
                  <div style="font-size: 32px; font-weight: bold; color: #000000; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                    ${mfaCode}
                  </div>
                </div>
              </div>
              
              <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #374151;">
                  <strong>🛡️ Security Tips:</strong>
                </p>
                <ul style="color: #374151; margin: 10px 0 0 0; padding-left: 20px;">
                  <li>This code expires in 10 minutes</li>
                  <li>Never share this code with anyone</li>
                  <li>If you didn't request this, contact your administrator</li>
                </ul>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #999; font-size: 14px; margin: 0; text-align: center;">
                  This is an automated security message from ${schoolName} Portal
                </p>
              </div>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ MFA code email sent to ${userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send MFA code email:', error);
      return false;
    }
  }

  async sendOTPEmail(
    userEmail: string,
    otpCode: string,
    userName: string = 'User',
    schoolName: string = 'School'
  ): Promise<boolean> {
    if (!this.isConfigured) {
      console.log(`📧 Email service not configured. Skipping OTP email for ${userEmail}`);
      console.log(`🔐 OTP Code for ${userEmail}: ${otpCode}`);
      return false;
    }

    try {
      const mailOptions = {
        from: `"${schoolName} Portal Security" <${process.env.SMTP_USER}>`,
        to: userEmail,
        subject: `OTP - ${schoolName}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: #000000; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">OTP</h1>
              <p style="color: #f8f9fa; margin: 10px 0 0 0; opacity: 0.9;">${schoolName} Portal</p>
            </div>
            
            <div style="padding: 40px 30px; background: white; border-left: 4px solid #000000;">
              <h2 style="color: #333; margin-top: 0;">Hello ${userName}!</h2>
              
              <p style="color: #666; line-height: 1.6; font-size: 16px;">
                Your login credentials have been verified. To complete the login process, 
                please enter the OTP code below:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="background: #f8f9fa; border: 2px dashed #000000; border-radius: 12px; padding: 20px; display: inline-block;">
                  <p style="color: #666; margin: 0 0 10px 0; font-size: 14px;">Your OTP code is:</p>
                  <div style="font-size: 32px; font-weight: bold; color: #000000; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                    ${otpCode}
                  </div>
                </div>
              </div>
              
              <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #374151;">
                  <strong>🛡️ Security Tips:</strong>
                </p>
                <ul style="color: #374151; margin: 10px 0 0 0; padding-left: 20px;">
                  <li>This code expires in 1 minute</li>
                  <li>Never share this code with anyone</li>
                  <li>If you didn't request this, contact your administrator</li>
                </ul>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #999; font-size: 14px; margin: 0; text-align: center;">
                  This is an automated security message from ${schoolName} Portal
                </p>
              </div>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ OTP email sent to ${userEmail}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send OTP email:', error);
      return false;
    }
  }

  async sendAdminPasswordResetRequest(
    adminEmails: string[],
    userEmail: string,
    userName: string,
    userRole: string,
    schoolName: string
  ): Promise<boolean> {
    // Skip email sending if not configured
    if (!this.isConfigured) {
      console.log(`📧 Email service not configured. Skipping admin reset request for ${userEmail}`);
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'SRS System <noreply@srs.edu>',
        to: adminEmails.join(', '),
        subject: `Password Reset Request - ${userName} (${userEmail})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Student Revelation System</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
              <h2 style="color: #333; margin-top: 0;">Administrator Action Required</h2>
              
              <p style="color: #666; line-height: 1.6;">
                A user has requested a password reset through the administrator reset option.
              </p>
              
              <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0; font-size: 18px;">User Information:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold; width: 120px;">Name:</td>
                    <td style="padding: 8px 0; color: #333;">${userName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                    <td style="padding: 8px 0; color: #333;">${userEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Role:</td>
                    <td style="padding: 8px 0; color: #333;">${userRole}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">School:</td>
                    <td style="padding: 8px 0; color: #333;">${schoolName}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #856404;">
                  <strong>⚠️ Action Required:</strong> Please reset the password for this user through the admin panel and notify them once completed.
                </p>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #999; font-size: 14px; margin: 0;">
                  This is an automated notification from the Student Revelation System.
                </p>
              </div>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Admin password reset request sent to ${adminEmails.length} recipient(s) for ${userEmail}`);
      console.log(`📧 Recipients: ${adminEmails.join(', ')}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send admin password reset request:', error);
      return false;
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string
  ): Promise<boolean> {
    // Skip email sending if not configured
    if (!this.isConfigured) {
      console.log(`📧 Email service not configured. Skipping email to ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${text}`);
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'SRS System <noreply@srs.edu>',
        to,
        subject,
        text,
        html: html || text.replace(/\n/g, '<br>'),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to} - ${subject}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      return false;
    }
  }
}
