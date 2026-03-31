/**
 * Converts time string "HH:MM" to minutes for comparison
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if two time ranges overlap
 * Returns true if there's any overlap
 */
export function timeSlotsOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  // Check if ranges overlap
  return s1 < e2 && s2 < e1;
}

/**
 * Validates time format (HH:MM) and logical order
 */
export function validateTimeSlot(slot: any): { valid: boolean; error?: string } {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  
  if (!timeRegex.test(slot.startTime)) {
    return { valid: false, error: `Invalid startTime format: ${slot.startTime}. Use HH:MM (24-hour format)` };
  }
  
  if (!timeRegex.test(slot.endTime)) {
    return { valid: false, error: `Invalid endTime format: ${slot.endTime}. Use HH:MM (24-hour format)` };
  }
  
  if (timeToMinutes(slot.startTime) >= timeToMinutes(slot.endTime)) {
    return { valid: false, error: `startTime (${slot.startTime}) must be before endTime (${slot.endTime}) on ${slot.day}` };
  }
  
  return { valid: true };
}
