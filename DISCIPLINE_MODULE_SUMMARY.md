# Discipline Module - Complete Implementation Summary

## Quick Reference

### Who Can Do What?

| Action | Teacher | Admin | Counselor | Secretary | Parent |
|--------|---------|-------|-----------|-----------|--------|
| Assign Discipline | ✅ | ✅ | ✅ | ❌ | ❌ |
| View All Actions | ✅ | ✅ | ✅ | ✅ | ⚠️* |
| View Pending Approvals | ❌ | ✅ | ✅ | ❌ | ❌ |
| Approve Action | ❌ | ✅ | ✅ | ❌ | ❌ |
| Reject Action | ❌ | ✅ | ✅ | ❌ | ❌ |
| View Single Action | ✅ | ✅ | ✅ | ✅ | ⚠️* |
| Complete Action | ❌ | ✅ | ✅ | ✅ | ❌ |

*Parent can only view their child's actions

---

## Complete Workflow

### Step 1: Teacher/Admin Creates Discipline Action

**Endpoint**: `POST /discipline/actions`
**Allowed Roles**: TEACHER, ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

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
  "assignedBy": "teacher-id",
  "approvalStatus": "pending_approval",
  "approvedBy": null,
  "createdAt": "2025-02-03T10:30:00Z"
}
```

**Important**: 
- Teachers CAN create discipline actions
- Action starts with `approvalStatus: pending_approval`
- Requires admin/counselor approval to take effect

---

### Step 2: Admin/Counselor Reviews Pending Actions

**Endpoint**: `GET /discipline/actions/pending-approval`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

```bash
curl http://localhost:3014/discipline/actions/pending-approval \
  -H "Authorization: Bearer {token}"
```

**Response**:
```json
{
  "data": [
    {
      "_id": "action-id",
      "studentId": {
        "_id": "student-id",
        "name": "John Doe"
      },
      "type": "insubordination",
      "severity": "minor",
      "description": "Spoke disrespectfully to teacher",
      "assignedBy": {
        "_id": "teacher-id",
        "name": "Ms. Smith"
      },
      "approvalStatus": "pending_approval",
      "createdAt": "2025-02-03T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

**Note**: Only Admin and Counselor can see pending approvals

---

### Step 3a: Admin/Counselor Approves Action

**Endpoint**: `POST /discipline/actions/:id/approve`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

```bash
curl -X POST http://localhost:3014/discipline/actions/action-id/approve \
  -H "Authorization: Bearer {token}"
```

**Response**:
```json
{
  "_id": "action-id",
  "approvalStatus": "approved",
  "approvedBy": "counselor-id",
  "approvalDate": "2025-02-03T14:00:00Z"
}
```

**Effect**: Action now takes effect, can be completed

---

### Step 3b: Admin/Counselor Rejects Action

**Endpoint**: `POST /discipline/actions/:id/reject`
**Allowed Roles**: ADMIN, SUPER_ADMIN, GUIDANCE_COUNSELOR

```bash
curl -X POST http://localhost:3014/discipline/actions/action-id/reject \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Insufficient evidence"}'
```

**Response**:
```json
{
  "_id": "action-id",
  "approvalStatus": "rejected",
  "rejectionReason": "Insufficient evidence",
  "approvedBy": "counselor-id",
  "approvalDate": "2025-02-03T14:00:00Z"
}
```

**Effect**: Action is discarded, no discipline served

---

## API Endpoints Reference

### Create Discipline
- **Endpoint**: `POST /discipline/actions`
- **Roles**: Teacher, Admin, Counselor
- **Purpose**: Teacher or Admin creates discipline action
- **Status After**: `approvalStatus: pending_approval`

### View All Actions
- **Endpoint**: `GET /discipline/actions`
- **Roles**: Teacher, Admin, Counselor, Secretary
- **Purpose**: View all discipline actions for school
- **Filters**: `?studentId=xxx&severity=major&type=insubordination`

### View Pending Approvals
- **Endpoint**: `GET /discipline/actions/pending-approval`
- **Roles**: Admin, Counselor only
- **Purpose**: Admin/Counselor reviews actions needing approval
- **Filters**: `?studentId=xxx&severity=major&page=1&limit=10`

### View Single Action
- **Endpoint**: `GET /discipline/actions/:id`
- **Roles**: Teacher, Admin, Counselor, Secretary
- **Purpose**: View detailed information about one action
- **Includes**: Student, assignedBy, approvedBy populated

### Approve Action
- **Endpoint**: `POST /discipline/actions/:id/approve`
- **Roles**: Admin, Counselor only
- **Purpose**: Approve a pending discipline action
- **Effect**: Sets `approvalStatus: approved`, records approver

### Reject Action
- **Endpoint**: `POST /discipline/actions/:id/reject`
- **Roles**: Admin, Counselor only
- **Required**: `{"reason": "explanation"}`
- **Purpose**: Reject a pending discipline action
- **Effect**: Sets `approvalStatus: rejected`, records reason

### Complete Action
- **Endpoint**: `PATCH /discipline/actions/:id/complete`
- **Roles**: Admin, Counselor, Secretary
- **Purpose**: Mark approved action as completed (served)
- **Requires**: Action must be `approvalStatus: approved` first

---

## Role Permissions Summary

### TEACHER
✅ **Can**:
- Create discipline actions (POST /discipline/actions)
- View all discipline actions (GET /discipline/actions)
- View single action details (GET /discipline/actions/:id)

❌ **Cannot**:
- Approve actions
- Reject actions
- View pending approvals
- Complete actions

### ADMIN
✅ **Can**:
- Create discipline actions
- View all discipline actions
- View pending approvals
- Approve actions
- Reject actions
- View single action details
- Complete actions
- Generate reports and statistics

❌ **Cannot**: Nothing (full authority)

### GUIDANCE_COUNSELOR (Counselor)
✅ **Can**:
- Create discipline actions
- View all discipline actions
- View pending approvals
- Approve actions
- Reject actions
- View single action details
- Complete actions

❌ **Cannot**: Generate school reports (admin-only)

### SECRETARY
✅ **Can**:
- View all discipline actions
- View single action details
- Complete actions (mark as served)

❌ **Cannot**:
- Create discipline actions
- View pending approvals
- Approve actions
- Reject actions

### PARENT
✅ **Can**:
- View discipline actions for their child only
- (if child has discipline action assigned)

❌ **Cannot**:
- View actions for other students
- Create, approve, reject
- Complete actions

---

## Database Fields

### Discipline Action Fields (Added for Approval Workflow)

```
approvalStatus: string
  - "pending_approval" (initial state)
  - "approved" (approved by admin/counselor)
  - "rejected" (rejected by admin/counselor)

approvedBy: ObjectId
  - References User (admin/counselor who approved/rejected)
  - null if pending_approval

approvalDate: Date
  - When approval/rejection occurred
  - null if pending_approval

rejectionReason: string
  - Only set if approvalStatus is "rejected"
  - null otherwise
```

---

## Audit Trail

Every discipline action records:

1. **Who Created It**: `assignedBy` (Teacher or Admin)
2. **When Created**: `createdAt`
3. **Who Approved/Rejected**: `approvedBy` (Admin or Counselor)
4. **When Approved/Rejected**: `approvalDate`
5. **Why Rejected**: `rejectionReason` (if applicable)

---

## Common Scenarios

### Scenario 1: Teacher Reports Incident
1. **3:00 PM**: Teacher observes student misbehavior
2. **3:15 PM**: Teacher creates discipline action
   - `POST /discipline/actions`
   - `approvalStatus: pending_approval`
3. **Next morning**: Counselor reviews and approves
   - `POST /discipline/actions/:id/approve`
4. **After school**: Student serves detention
   - `PATCH /discipline/actions/:id/complete`

### Scenario 2: Admin Rejects Insufficient Evidence
1. **10:00 AM**: Admin creates discipline action
2. **11:00 AM**: Counselor reviews and finds insufficient documentation
3. **11:15 AM**: Counselor rejects with reason
   - `POST /discipline/actions/:id/reject`
   - `reason: "No witness statements provided"`
4. **12:00 PM**: Admin creates new action with documentation
   - `POST /discipline/actions` (new action)

### Scenario 3: Multiple Pending Actions
1. **Throughout day**: Teachers create multiple actions
2. **4:00 PM**: Counselor checks pending approvals
   - `GET /discipline/actions/pending-approval`
   - Shows list of 8 actions awaiting approval
3. **4:15 PM**: Reviews each action in detail
   - `GET /discipline/actions/:id`
4. **4:45 PM**: Approves 7, rejects 1
   - 7 × `POST /discipline/actions/:id/approve`
   - 1 × `POST /discipline/actions/:id/reject`

---

## Implementation Notes

- ✅ Teachers CAN create discipline actions
- ✅ Only Admin/Counselor can approve or reject
- ✅ Full audit trail of all approvals/rejections
- ✅ Teachers cannot see pending approvals (only admins/counselors)
- ✅ Complete workflow with status tracking
- ✅ Rejection reason stored for compliance
- ✅ Roles clearly separated by responsibility

---

## Production Checklist

- [x] Teachers can create discipline actions
- [x] Admin and Counselor can approve/reject
- [x] Full audit trail implemented
- [x] Role-based access control enforced
- [x] Endpoints documented and tested
- [x] Error handling in place
- [x] No compilation errors

Ready for production use! ✅
