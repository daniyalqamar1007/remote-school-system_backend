export enum NurseVisitStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FOLLOW_UP_REQUIRED = 'follow_up_required',
  CANCELLED = 'cancelled'
}

export enum NurseVisitPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency'
}

export enum NurseVisitDisposition {
  RETURN_TO_CLASS = 'return_to_class',
  SENT_HOME = 'sent_home',
  TRANSPORTED_TO_HOSPITAL = 'transported_to_hospital',
  PARENT_CALLED = 'parent_called'
}

