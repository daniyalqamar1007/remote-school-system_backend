import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CertificateDocument = Certificate & Document;

@Schema({ timestamps: true })
export class Certificate {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  domain: string;

  @Prop({ required: true, enum: ['ssl', 'tls', 'wildcard', 'code-signing', 'client'], default: 'ssl' })
  type: string;

  @Prop({ required: true, enum: ['active', 'expired', 'expiring', 'revoked', 'pending'], default: 'pending' })
  status: string;

  @Prop({ trim: true })
  issuer?: string;

  @Prop()
  issuedDate?: Date;

  @Prop()
  expiryDate?: Date;

  @Prop({ trim: true })
  serialNumber?: string;

  @Prop({ trim: true })
  fingerprint?: string;

  @Prop({ default: 2048 })
  keySize: number;

  @Prop({ default: 'RSA' })
  algorithm: string;

  @Prop({ type: [String] })
  san?: string[]; // Subject Alternative Names

  @Prop({ default: false })
  autoRenewal: boolean;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop()
  lastChecked?: Date;

  @Prop({ trim: true })
  certificateData?: string; // PEM format

  @Prop({ trim: true })
  privateKey?: string; // PEM format (encrypted)

  @Prop({ trim: true })
  certificateChain?: string; // PEM format

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);

export type CertificateRequestDocument = CertificateRequest & Document;

@Schema({ timestamps: true })
export class CertificateRequest {
  @Prop({ required: true, trim: true })
  domain: string;

  @Prop({ required: true, enum: ['ssl', 'tls', 'wildcard', 'code-signing', 'client'] })
  type: string;

  @Prop({ required: true, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' })
  status: string;

  @Prop({ required: true, trim: true })
  requestedBy: string;

  @Prop()
  requestedAt: Date;

  @Prop({ trim: true })
  csrData?: string; // Certificate Signing Request

  @Prop({ trim: true })
  privateKey?: string; // Private key for CSR

  @Prop({ trim: true })
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;

  @Prop({ trim: true })
  rejectedBy?: string;

  @Prop()
  rejectedAt?: Date;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ trim: true })
  certificateId?: string; // Reference to generated certificate

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;
}

export const CertificateRequestSchema = SchemaFactory.createForClass(CertificateRequest);

export type TrustedCADocument = TrustedCA & Document;

@Schema({ timestamps: true })
export class TrustedCA {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  fingerprint: string;

  @Prop()
  validFrom: Date;

  @Prop()
  validTo: Date;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  certificateData?: string; // PEM format

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;

  @Prop({ trim: true })
  addedBy?: string;

  @Prop()
  lastModified?: Date;
}

export const TrustedCASchema = SchemaFactory.createForClass(TrustedCA);

// Create indexes for better query performance
CertificateSchema.index({ domain: 1 });
CertificateSchema.index({ status: 1 });
CertificateSchema.index({ type: 1 });
CertificateSchema.index({ expiryDate: 1 });
CertificateSchema.index({ createdAt: -1 });

CertificateRequestSchema.index({ domain: 1 });
CertificateRequestSchema.index({ status: 1 });
CertificateRequestSchema.index({ requestedBy: 1 });
CertificateRequestSchema.index({ requestedAt: -1 });

TrustedCASchema.index({ name: 1 });
TrustedCASchema.index({ fingerprint: 1 });
TrustedCASchema.index({ enabled: 1 });
