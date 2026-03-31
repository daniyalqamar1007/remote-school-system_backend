# Rollover System Documentation

## Overview
The rollover system manages year-end transitions, including student grade promotion, data archiving, and academic year transitions. This ensures proper student advancement while maintaining historical data integrity.

---

## System Architecture

### Core Components
1. **RolloverConfig Schema**: Defines rollover rules, archive settings, execution tracking
2. **Student Promotion Engine**: Evaluates and applies promotion rules  
3. **Data Archival System**: Preserves historical grade, attendance, behavior data
4. **Audit & Logging**: Tracks all changes for compliance and troubleshooting

### Database Models Involved
- `StudentProfile`: Student grade levels and status
- `Grade`: Course grades (to be archived)
- `Attendance`: Attendance records (to be archived)
- `Behavior`: Discipline/behavior records (to be archived)
- `RolloverConfig`: Rollover configuration and execution history
- `AuditLog`: All changes logged for compliance

---

## Admin Workflow

### Step 1: Create Rollover Configuration
**Endpoint**: `POST /super-admin/rollover/configs`

**Request Body**:
```json
{
  "name": "Academic Year 2024-2025 Rollover",
  "fromYear": "2023-2024",
  "toYear": "2024-2025",
  "schoolId": "school-id-here",
  "promotionRules": [
    {
      "fromGrade": "9",
      "toGrade": "10",
      "condition": "passing_grades"
    },
    {
      "fromGrade": "10",
      "toGrade": "11",
      "condition": "passing_grades"
    },
    {
      "fromGrade": "11",
      "toGrade": "12",
      "condition": "passing_grades"
    },
    {
      "fromGrade": "12",
      "toGrade": "graduated",
      "condition": "automatic"
    }
  ],
  "archiveSettings": {
    "archiveGrades": true,
    "archiveAttendance": true,
    "archiveBehavior": true,
    "archiveDocuments": false,
    "retentionPeriod": 7
  }
}
```

**Promotion Rule Conditions**:
- `automatic`: All students in this grade are promoted
- `passing_grades`: Students promoted if GPA ≥ 2.0 (C average or higher)
- `manual_review`: Requires admin approval before promotion (not auto-promoted)

**Status After Creation**: `draft`

---

### Step 2: Preview Rollover
**Endpoint**: `GET /super-admin/rollover/preview/:id`

**Response Example**:
```json
{
  "summary": {
    "totalStudents": 1250,
    "willPromote": 1180,
    "willRetain": 50,
    "requiresManualReview": 20
  },
  "promotionBreakdown": [
    {
      "fromGrade": "9",
      "toGrade": "10",
      "condition": "passing_grades",
      "totalCount": 320,
      "willPromote": 305,
      "willRetain": 15,
      "requiresManualReview": 0
    }
  ],
  "archiveSettings": {
    "archiveGrades": true,
    "archiveAttendance": true,
    "retentionPeriod": 7
  },
  "rolloverPeriod": "2023-2024 → 2024-2025",
  "adminNextSteps": [
    "1. ✅ Review this preview to verify promotion rules and student counts",
    "2. 🚀 Execute rollover (updates student grades and archives old data)",
    "3. 🔍 Verify post-rollover data integrity",
    "4. 📅 Create new academic schedules for next year",
    "5. ❓ Manually approve manual_review students"
  ]
}
```

**What to Check**:
- ✅ Total student count matches expectations
- ✅ Promotion breakdown looks correct (are retention numbers reasonable?)
- ✅ Manual review students identified correctly
- ✅ Archive settings are appropriate

---

### Step 3: Execute Rollover
**Endpoint**: `POST /super-admin/rollover/execute/:id`

**Request Body** (optional):
```json
{
  "includeManualReview": false
}
```

**What Happens During Execution**:

#### 3.1 Student Promotion
For each student in school:
1. Find applicable promotion rule (based on current grade)
2. Evaluate condition:
   - **Automatic**: Promote all students in grade
   - **Passing Grades**: Check if GPA ≥ 2.0
   - **Manual Review**: Skip (requires separate approval)
3. Update `StudentProfile.gradeLevel` to new grade
4. Log promotion in audit trail

#### 3.2 Data Archival
If configured:
- **Grade Archive**: Move semester/final grades to archive
- **Attendance Archive**: Move attendance records to archive (with retention date)
- **Behavior Archive**: Move discipline records to archive

#### 3.3 Status Tracking
- Update `RolloverConfig.status`: `in-progress` → `completed`
- Record: `studentsProcessed`, `studentsPromoted`, `studentsRetained`
- Log any errors in `errorMessages`
- Set `executedAt` timestamp and `executedBy` admin

**Response Example**:
```json
{
  "success": true,
  "message": "Rollover executed successfully",
  "summary": {
    "studentsProcessed": 1250,
    "studentsPromoted": 1180,
    "studentsRetained": 50,
    "errors": []
  },
  "executedAt": "2024-05-15T14:30:00Z"
}
```

**Status Flow**:
```
draft → preview → ready → execute → in-progress → completed
                                  → failed (if errors occur)
```

---

### Step 4: Post-Rollover Verification
After execution completes:

**Check Student Data**:
```
GET /student/profiles?schoolId=:schoolId
```
Verify students' grade levels are updated correctly.

**Check Archive Integrity**:
```
GET /super-admin/archive?type=grades&fromYear=:fromYear
```
Verify historical data is preserved.

**Check Audit Trail**:
```
GET /super-admin/audit-logs?entityType=StudentProfile&action=UPDATE
```
Review all student promotion records.

---

### Step 5: Handle Manual Review Cases
Students with `condition: manual_review` must be handled separately.

**Options**:
1. Execute with `includeManualReview: true` (promotes all)
2. Execute with `includeManualReview: false` (skips them)
3. Update students manually in admin panel
4. Create override endpoint for admin approval

**Recommended Flow**:
1. Execute rollover with `includeManualReview: false`
2. Review manual_review students separately
3. Create endpoint to promote them individually after admin approval

---

## Data Integrity & Safety

### Transaction Support
- All operations within `executeRollover()` use MongoDB sessions
- If any step fails, entire transaction is rolled back
- Student grades unchanged if error occurs
- Archive marked as `failed` status

### Audit Logging
Every student promotion logged with:
- Student ID and name
- Grade change (from → to)
- Promotion condition met
- Timestamp and executed by whom
- Status (SUCCESS/FAILURE)

### Rollback Strategy
If issues discovered after rollover:
1. Check status in `RolloverConfig` (should be `completed` or `failed`)
2. Review audit logs to see all changes made
3. If critical issues: Manually revert student grades in DB
4. Create new rollover config for corrected version

---

## Common Scenarios

### Scenario 1: Automatic Grade Advancement
**Setup**:
```json
"promotionRules": [
  {"fromGrade": "12", "toGrade": "graduated", "condition": "automatic"}
]
```
**Result**: All grade 12 students automatically graduated.

---

### Scenario 2: Performance-Based Promotion
**Setup**:
```json
"promotionRules": [
  {"fromGrade": "9", "toGrade": "10", "condition": "passing_grades"}
]
```
**Result**: Only grade 9 students with GPA ≥ 2.0 promoted to grade 10. Others retained in grade 9.

---

### Scenario 3: Manual Approval Required
**Setup**:
```json
"promotionRules": [
  {"fromGrade": "11", "toGrade": "12", "condition": "manual_review"}
]
```
**Result**: No automatic promotion. Admin reviews borderline students individually.

---

## Troubleshooting

### Issue: "Cannot execute rollover with status: completed"
**Cause**: Rollover already executed
**Solution**: Create new rollover config for next year

### Issue: Promotion counts don't match preview
**Cause**: Student data changed between preview and execution
**Solution**: Update students, run new preview, execute again

### Issue: Archived data not visible
**Cause**: Archive queries not implemented yet
**Solution**: Check archiveSettings - ensure desired types are enabled

### Issue: Manual review students not handled
**Cause**: Executed with `includeManualReview: false`
**Solution**: Execute again with `includeManualReview: true`, or approve individually

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/super-admin/rollover/configs` | GET | List all rollover configs |
| `/super-admin/rollover/configs` | POST | Create new rollover config |
| `/super-admin/rollover/configs/:id` | GET | Get single config |
| `/super-admin/rollover/configs/:id` | PUT | Update config (only if draft) |
| `/super-admin/rollover/preview/:id` | GET | Preview rollover without execution |
| `/super-admin/rollover/execute/:id` | POST | Execute rollover (IRREVERSIBLE) |

---

## Best Practices

### ✅ DO:
- Create rollover configs early (weeks before year-end)
- Always preview before executing
- Test with small subset first if possible
- Review audit logs after execution
- Document any manual exceptions made
- Schedule rollover during low-activity period
- Backup database before executing

### ❌ DON'T:
- Execute without preview
- Change rules after preview (run new preview!)
- Execute multiple rollowers simultaneously
- Forget to handle manual_review students
- Skip post-rollover verification
- Execute without understanding promotion rules

---

## Future Enhancements
- [ ] Batch import promotion rules from CSV
- [ ] Dry-run execution (preview actual SQL changes)
- [ ] Rollover rollback functionality
- [ ] Performance optimization for large schools (>5000 students)
- [ ] Email notifications to admins on completion
- [ ] Scheduled rollover execution
- [ ] Per-grade custom promotion logic
- [ ] Historical rollover reports and analytics

---

## Support
For issues or questions:
1. Check audit logs for what happened
2. Review this guide's troubleshooting section
3. Contact system administrator
4. Check server logs for detailed errors
