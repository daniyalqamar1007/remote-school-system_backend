# Discipline Module - Approval Workflow Guide

## Overview
The discipline module now implements a proper approval workflow ensuring that:
- ✅ Only **Admin/Counselor** can create discipline actions
- ✅ All discipline actions require **admin/counselor approval** before taking effect
- ✅ Actions can be **approved or rejected** with audit trail
- ✅ **Teachers cannot** directly assign discipline

---

## Workflow Steps

### Step 1: Admin/Counselor Creates Discipline Action
**Endpoint**: `POST /discipline/actions`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

**Request Body**:
```json
{
  "studentId": "student-id",
  "schoolId": "school-id",
  "type": "insubordination",
  "description": "Spoke disrespectfully to teacher",
  "location": "classroom",
  "date": "2025-02-03",
  "time": "10:30",
  "severity": "minor",
  "actionType": "detention",
  "consequenceStartDate": "2025-02-04",
  "consequenceDuration": "1 day",
  "reason": "Student disrupted class"
}
```

**Response**:
```json
{
  "_id": "action-id",
  "studentId": "student-id",
  "approvalStatus": "pending_approval",
  "approvedBy": null,
  "approvalDate": null,
  "status": "pending",
  "createdAt": "2025-02-03T10:30:00Z"
}
```

**Status After Creation**: `approvalStatus: pending_approval`

---

### Step 2: Review Pending Discipline Actions
**Endpoint**: `GET /discipline/actions/pending-approval`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

**Query Parameters**:
```
?page=1&limit=10&studentId=xxx&severity=major&type=insubordination
```

**Response**:
```json
{
  "data": [
    {
      "_id": "action-id",
      "studentId": {
        "_id": "student-id",
        "name": "John Doe",
        "email": "john@school.edu"
      },
      "type": "insubordination",
      "severity": "minor",
      "description": "Spoke disrespectfully to teacher",
      "approvalStatus": "pending_approval",
      "assignedBy": {
        "_id": "admin-id",
        "name": "Admin Name",
        "email": "admin@school.edu"
      },
      "createdAt": "2025-02-03T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "pages": 2
  }
}
```

---

### Step 3a: Approve Discipline Action
**Endpoint**: `POST /discipline/actions/:id/approve`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

**Request Body**: None required

**Response**:
```json
{
  "_id": "action-id",
  "studentId": "student-id",
  "approvalStatus": "approved",
  "approvedBy": "counselor-id",
  "approvalDate": "2025-02-03T14:00:00Z",
  "status": "pending"
}
```

**What Happens**:
- `approvalStatus` → `approved`
- `approvedBy` → Set to approver's ID
- `approvalDate` → Set to current timestamp
- Action now **takes effect** (can be completed)

---

### Step 3b: Reject Discipline Action
**Endpoint**: `POST /discipline/actions/:id/reject`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

**Request Body** (Required):
```json
{
  "reason": "Insufficient evidence for this severity level"
}
```

**Response**:
```json
{
  "_id": "action-id",
  "studentId": "student-id",
  "approvalStatus": "rejected",
  "rejectionReason": "Insufficient evidence for this severity level",
  "approvedBy": "counselor-id",
  "approvalDate": "2025-02-03T14:00:00Z"
}
```

**What Happens**:
- `approvalStatus` → `rejected`
- `rejectionReason` → Set to provided reason
- `approvedBy` → Set to rejector's ID (for audit)
- Action **does NOT take effect** (discarded)

---

## Database Schema Changes

### New Fields in DisciplinaryAction

| Field | Type | Description |
|-------|------|-------------|
| `approvalStatus` | String | `pending_approval` \| `approved` \| `rejected` |
| `approvedBy` | ObjectId | Reference to User (admin/counselor who approved/rejected) |
| `approvalDate` | Date | When the approval/rejection occurred |
| `rejectionReason` | String | Explanation for why action was rejected |

---

## Role-Based Access Control

### Who Can Create Discipline Actions
✅ **ADMIN** - Yes
✅ **SUPER_ADMIN** - Yes
✅ **GUIDANCE_COUNSELOR** - Yes
❌ **TEACHER** - NO (restricted)
❌ **SECRETARY** - NO (removed from creation)
❌ **PARENT** - NO

### Who Can Approve/Reject Discipline Actions
✅ **ADMIN** - Yes
✅ **SUPER_ADMIN** - Yes
✅ **GUIDANCE_COUNSELOR** - Yes
❌ **SECRETARY** - NO (removed from approval)
❌ **TEACHER** - NO
❌ **PARENT** - NO

### Who Can View Pending Approvals
✅ **ADMIN** - Yes (all schools if super admin)
✅ **SUPER_ADMIN** - Yes (all schools)
✅ **GUIDANCE_COUNSELOR** - Yes (their school)
❌ **TEACHER** - NO
❌ **SECRETARY** - NO

---

## API Endpoints Summary

| Endpoint | Method | Role | Purpose |
|----------|--------|------|---------|
| `/discipline/actions` | POST | Admin/Counselor | Create discipline action |
| `/discipline/actions` | GET | All authorized | Get all discipline actions |
| `/discipline/actions/:id/approve` | POST | Admin/Counselor | Approve pending action |
| `/discipline/actions/:id/reject` | POST | Admin/Counselor | Reject pending action |
| `/discipline/actions/pending-approval` | GET | Admin/Counselor | List all pending approvals |
| `/discipline/actions/:id` | PUT | Admin/Counselor | Update action (before approval) |
| `/discipline/actions/:id/complete` | PATCH | Admin/Counselor | Mark action as completed |

---

## Workflow State Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ DISCIPLINE ACTION CREATED (by Admin/Counselor)              │
│ approvalStatus: pending_approval                            │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├─ Admin/Counselor Reviews →──────────┐
           │                                       │
           ├──→ POST /approve ──→ ┌──────────────┴─┐
           │                      │ APPROVED       │
           │                      │ Can take       │
           │                      │ effect         │
           │                      └────────────────┘
           │
           └──→ POST /reject ──→ ┌──────────────┐
                                 │ REJECTED     │
                                 │ Discarded    │
                                 │ No effect    │
                                 └──────────────┘
```

---

## Audit Trail

Every discipline action now includes:

1. **Creation Audit**:
   - `assignedBy`: Which admin created it
   - `createdAt`: When it was created
   - `approvalStatus: pending_approval`

2. **Approval Audit**:
   - `approvedBy`: Which admin approved it
   - `approvalDate`: When it was approved
   - `approvalStatus: approved`

3. **Rejection Audit**:
   - `approvedBy`: Which admin rejected it
   - `approvalDate`: When it was rejected
   - `rejectionReason`: Why it was rejected
   - `approvalStatus: rejected`

**Compliance**: All changes tracked for complete audit trail of discipline decisions.

---

## Example Workflow

### Day 1: Incident Occurs
- **4:00 PM**: Student speaks disrespectfully to teacher
- **4:15 PM**: Admin creates discipline action (POST /discipline/actions)
  - `approvalStatus`: `pending_approval`
  - Awaits counselor review

### Day 2: Counselor Reviews
- **9:00 AM**: Counselor views pending actions (GET /discipline/actions/pending-approval)
- **9:15 AM**: Counselor reviews student's history
- **9:30 AM**: Counselor approves detention (POST /discipline/actions/:id/approve)
  - `approvalStatus`: `approved`
  - `approvedBy`: Counselor ID
  - `approvalDate`: 2025-02-04T09:30:00Z

### Day 3: Action Executed
- **After school**: Student serves detention
- **5:00 PM**: Admin marks complete (PATCH /discipline/actions/:id/complete)
  - `completion.completed`: `true`
  - `completion.verifiedBy`: Admin ID

---

## Rejection Example

### Alternative Day 2: Counselor Rejects
- **9:30 AM**: Counselor reviews and finds insufficient evidence
- **9:35 AM**: Counselor rejects (POST /discipline/actions/:id/reject)
  ```json
  {
    "reason": "Insufficient evidence. Teacher provided no documentation."
  }
  ```
  - `approvalStatus`: `rejected`
  - `rejectionReason`: "Insufficient evidence..."
  - `approvedBy`: Counselor ID
  - `approvalDate`: 2025-02-04T09:35:00Z
- **Result**: Action discarded, no discipline served

---

## Best Practices

✅ **DO**:
- Review student's discipline history before approving
- Document rejection reasons thoroughly
- Approve/reject within 24 hours of creation
- Use consistent severity levels
- Document special circumstances

❌ **DON'T**:
- Create discipline for minor infractions
- Approve without reviewing details
- Use vague rejection reasons
- Create duplicate actions
- Approve actions by inexperienced staff

---

## Related Features

- **Parent Notifications**: Parents notified once discipline is APPROVED
- **Conduct Letters**: Generated after approval and completion
- **Appeal Process**: Students can appeal AFTER action is served
- **Reports**: Discipline statistics from APPROVED actions only

---

## Migration Notes

If migrating from old system:
- Existing discipline actions without approval status will need manual review
- Can set `approvalStatus: approved` for past actions
- Set `approvedBy` to original admin
- Set `approvalDate` to original completion date

---

## Questions?

**Q: Can teachers still see discipline actions?**
A: Yes. Teachers can view actions (GET /discipline/actions) but cannot create, approve, or reject them.

**Q: What if counselor is unavailable?**
A: Any ADMIN can approve. Multiple approvers can handle workflow.

**Q: Can actions be edited after approval?**
A: No. Rejected actions can be recreated if needed. Use PUT endpoint before approval only.

**Q: How long until approval needed?**
A: Recommended within 24 hours. No hard limit enforced.

**Q: Can rejected actions be re-submitted?**
A: Yes. Admin must create new action with updated details.
