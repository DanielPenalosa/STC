# SCOUT Database - Entity Relationship Diagram (ERD)

## Database Overview

SCOUT uses PostgreSQL (Supabase) with Row Level Security (RLS) for data access control.

---

## 📊 ERD Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SCOUT Database Schema                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   auth.users │ (Supabase Auth)
└──────┬───────┘
       │
       │ 1:1
       ↓
┌──────────────────────────┐         ┌──────────────────┐
│        users             │◄────┐   │      roles       │
├──────────────────────────┤     │   ├──────────────────┤
│ • id (PK, FK)            │     │   │ • id (PK)        │
│ • email                  │     │   │ • label          │
│ • full_name              │     │   │ • description    │
│ • phone                  │     │   └──────────────────┘
│ • address                │     │
│ • role (FK) ──────────────────┘           │
│ • department_id (FK) ─────────┐           │ Lookup table for:
│ • barangay_id (FK) ───────┐   │           │ - citizen
│ • id_photo_path          │   │           │ - admin
│ • verification_status    │   │           │ - department
│ • verified_at            │   │           │ - barangay
│ • verified_by (FK)       │   │
│ • rejection_reason       │   │
│ • id_verification_status │   │
│ • id_verification (json) │   │
│ • is_active              │   │
│ • created_at             │   │
└──────────────────────────┘   │
       │                       │
       │                       │
       │ 1:N                   │
       ↓                       │
┌──────────────────────────┐   │         ┌──────────────────────┐
│       reports            │   │         │    departments       │
├──────────────────────────┤   │         ├──────────────────────┤
│ • id (PK)                │   │         │ • id (PK)            │
│ • ref_code (unique)      │   │         │ • name (unique)      │
│ • user_id (FK) ──────────┘   │         │ • slug (unique)      │
│ • category_id (FK) ───────┐  │         │ • description        │
│ • title                  │  │         │ • head_name          │
│ • description            │  │         │ • contact_number     │
│ • status                 │  │         │ • color              │
│ • priority               │  │         │ • is_active          │
│ • urgency_priority       │  │         │ • created_at         │
│ • is_anonymous           │  │         │ • default_category   │
│ • barangay_id (FK) ──────┼──┤         └──────────────────────┘
│ • department_id (FK) ────┼──┘                  ▲
│ • latitude               │                     │
│ • longitude              │                     │ N:1
│ • address_text           │                     │
│ • is_possible_duplicate  │                     │
│ • resolved_at            │   ┌──────────────────────┐
│ • created_at             │   │     barangays        │
│ • updated_at             │   ├──────────────────────┤
└──────┬───────────────────┘   │ • id (PK)            │
       │                       │ • name (unique)      │
       │ 1:N                   │ • description        │
       ├───────────────────────│ • captain_name       │
       │                       │ • contact_number     │
       │                       │ • center_lat         │
       │                       │ • center_lng         │
       │                       │ • is_active          │
       │                       │ • created_at         │
       │                       └──────────────────────┘
       │
       │
       ├──────────────────────────────────────────────────────────┐
       │                                                          │
       ↓ 1:N                                                     ↓ 1:N
┌──────────────────────────┐                          ┌──────────────────────────┐
│    report_photos         │                          │     status_history       │
├──────────────────────────┤                          ├──────────────────────────┤
│ • id (PK)                │                          │ • id (PK)                │
│ • report_id (FK)         │                          │ • report_id (FK)         │
│ • storage_path           │                          │ • from_status            │
│ • kind ('citizen'|       │                          │ • to_status              │
│         'resolution')    │                          │ • changed_by (FK→users)  │
│ • caption                │                          │ • note                   │
│ • content_hash           │                          │ • created_at             │
│ • created_at             │                          └──────────────────────────┘
└──────────────────────────┘
       │
       │ 1:N                 ┌──────────────────────────┐
       ↓                     │      ai_analysis         │
┌──────────────────────────┐ ├──────────────────────────┤
│    assignments           │ │ • id (PK)                │
├──────────────────────────┤ │ • report_id (FK)         │
│ • id (PK)                │ │ • suggested_category_id  │
│ • report_id (FK)         │ │ • suggested_dept_id (FK) │
│ • assigned_type          │ │ • suggested_brgy_id (FK) │
│   ('department'|         │ │ • detected_issue         │
│    'barangay')           │ │ • confidence             │
│ • department_id (FK)     │ │ • model_used             │
│ • barangay_id (FK)       │ │ • raw_response (jsonb)   │
│ • assigned_by (FK→users) │ │ • status                 │
│ • note                   │ │ • created_at             │
│ • accepted_at            │ └──────────────────────────┘
│ • completed_at           │              ↑
│ • created_at             │              │ 1:1
└──────────────────────────┘              │
                                          │
       ┌──────────────────────────────────┘
       │
       ↓ 1:N
┌──────────────────────────┐         ┌──────────────────────┐
│   report_duplicates      │         │     categories       │
├──────────────────────────┤         ├──────────────────────┤
│ • id (PK)                │         │ • id (PK)            │
│ • report_id (FK)         │         │ • name (unique)      │
│ • similar_report_id (FK) │         │ • slug (unique)      │
│ • signal ('photo'|       │         │ • description        │
│   'text'|'location'|     │         │ • color              │
│   'category'|'ai_image') │◄────────┤ • icon               │
│ • score                  │    N:1  │ • is_active          │
│ • details (jsonb)        │         │ • default_dept_id    │
│ • created_at             │         │ • created_at         │
└──────────────────────────┘         └──────────────────────┘


┌──────────────────────────┐         ┌──────────────────────┐
│     notifications        │         │      locations       │
├──────────────────────────┤         ├──────────────────────┤
│ • id (PK)                │         │ • id (PK)            │
│ • user_id (FK)           │         │ • report_id (FK)     │
│ • report_id (FK)         │         │ • latitude           │
│ • title                  │         │ • longitude          │
│ • body                   │         │ • address_text       │
│ • type                   │         │ • place_id           │
│ • is_read                │         │ • created_at         │
│ • created_at             │         └──────────────────────┘
└──────────────────────────┘


┌──────────────────────────┐         ┌──────────────────────┐
│      audit_logs          │         │    app_settings      │
├──────────────────────────┤         ├──────────────────────┤
│ • id (PK)                │         │ • key (PK)           │
│ • actor_id (FK→users)    │         │ • value              │
│ • action                 │         └──────────────────────┘
│ • entity_type            │
│ • entity_id              │         Config table for:
│ • details (jsonb)        │         - client_name
│ • created_at             │         - city_name
└──────────────────────────┘         - tagline
```

---

## 🔑 Key Relationships

### Core Entities

1. **auth.users → users** (1:1)
   - Supabase authentication extends to profile table
   - Contains role, department, barangay assignment
   - ID verification status and data

2. **users → reports** (1:N)
   - One user can create many reports
   - Tracks who submitted each report

3. **reports → report_photos** (1:N)
   - One report can have multiple photos
   - Photos can be 'citizen' (before) or 'resolution' (after)

4. **reports → categories** (N:1)
   - Each report belongs to one category
   - Categories define types of issues (Road Damage, Flood, etc.)

5. **reports → departments** (N:1)
   - Each report can be assigned to one department
   - Departments handle specific types of issues

6. **reports → barangays** (N:1)
   - Each report belongs to one barangay
   - Auto-detected from GPS coordinates

### Assignment & Workflow

7. **reports → assignments** (1:N)
   - Tracks assignment history
   - Can assign to department OR barangay
   - Records who assigned, when accepted/completed

8. **reports → status_history** (1:N)
   - Audit trail of status changes
   - Tracks submitted → verified → assigned → in_progress → resolved → closed

9. **reports → ai_analysis** (1:1)
   - AI classification results
   - Suggested category, department, barangay
   - Confidence scores

### User Management

10. **users → roles** (N:1)
    - 4 roles: citizen, admin, department, barangay
    - Determines access permissions

11. **users → departments** (N:1)
    - Department staff belong to one department
    - Only see reports assigned to their department

12. **users → barangays** (N:1)
    - Barangay staff belong to one barangay
    - Only see reports from their barangay

### Communication & Tracking

13. **users → notifications** (1:N)
    - User receives notifications about their reports
    - Admins get registration/report notifications

14. **reports → report_duplicates** (N:N)
    - Links potentially duplicate reports
    - Multiple signals: photo, text, location, category, AI image similarity

15. **reports → locations** (1:N)
    - Reverse geocoded location data
    - GPS coordinates + address text

---

## 📝 Table Details

### users (User Profiles)
- **Purpose:** Extended user profile beyond auth
- **Key Fields:**
  - `role`: citizen | admin | department | barangay
  - `verification_status`: pending | verified | rejected
  - `id_verification_status`: not_run | processing | passed | needs_review | failed
  - `id_verification`: JSONB with extracted ID data + address validation
- **Security:** RLS enabled, users see own data, admins see all

### reports (Issue Reports)
- **Purpose:** Core reporting entity
- **Key Fields:**
  - `ref_code`: Unique reference (RPT-XXXXXXXX)
  - `status`: submitted → under_review → verified → assigned → in_progress → resolved → closed
  - `priority`: low | medium | high
  - `urgency_priority`: 1-5 (AI-calculated from follower count)
  - `is_anonymous`: Hide reporter identity
  - `is_possible_duplicate`: Flagged by duplicate detection
- **Security:** Users see own + public, staff see assigned, admins see all

### report_photos (Photo Evidence)
- **Purpose:** Before/after photos
- **Key Fields:**
  - `kind`: 'citizen' (problem photo) | 'resolution' (fixed photo)
  - `content_hash`: For duplicate detection
  - `storage_path`: Cloudinary or Supabase storage reference
- **Security:** Follows parent report visibility

### categories (Issue Types)
- **Purpose:** Classification of reports
- **Examples:** Road Damage, Flood, Waste Management, Street Lights
- **Key Fields:**
  - `slug`: URL-friendly identifier
  - `default_department_id`: Auto-route to department
  - `icon`: Emoji or icon identifier
- **Security:** Public read, admin write

### departments (Service Departments)
- **Purpose:** Municipal departments that handle reports
- **Examples:** DPWH, Health Office, MENRO, MPDO
- **Key Fields:**
  - `slug`: URL-friendly identifier
  - `head_name`: Department head
  - `color`: UI color coding
- **Security:** Public read, admin write

### barangays (Geographic Units)
- **Purpose:** 26 barangays of Sta. Cruz, Laguna
- **Key Fields:**
  - `center_lat`, `center_lng`: GPS coordinates for auto-detection
  - `captain_name`: Barangay captain
- **Security:** Public read, admin write

### ai_analysis (AI Classification Results)
- **Purpose:** Store AI vision analysis of report photos
- **Key Fields:**
  - `suggested_category_id`: What AI thinks it is
  - `suggested_department_id`: Where to route
  - `confidence`: 0-1 score
  - `model_used`: e.g., "openai:gpt-4o-mini"
  - `raw_response`: Full AI response JSON
- **Security:** Admins + assigned staff can read

### assignments (Task Assignments)
- **Purpose:** Track who is working on what
- **Key Fields:**
  - `assigned_type`: 'department' | 'barangay'
  - `accepted_at`: When staff acknowledged
  - `completed_at`: When work finished
- **Security:** Admins manage, staff update their own

### notifications (In-App Alerts)
- **Purpose:** User notifications
- **Types:**
  - status_change: Report status updated
  - registration: New user needs verification
  - assignment: Report assigned to you
  - revision: Admin sent back for changes
- **Security:** Strictly per-user

### status_history (Audit Trail)
- **Purpose:** Track all status changes
- **Key Fields:**
  - `from_status` → `to_status`
  - `changed_by`: Who made the change
  - `note`: Optional comment
- **Security:** Follows parent report visibility

### report_duplicates (Duplicate Detection)
- **Purpose:** Link similar reports
- **Signals:**
  - photo: Visual similarity (perceptual hash)
  - text: Title/description similarity
  - location: GPS proximity
  - category: Same category + timeframe
  - ai_image: CLIP embedding similarity
- **Key Fields:**
  - `score`: 0-1 similarity score
  - `details`: JSONB with match specifics
- **Security:** Follows parent report visibility

---

## 🔐 Security Model (Row Level Security)

### RLS Policies Summary:

| Table | Citizens | Department Staff | Barangay Staff | Admins |
|-------|----------|-----------------|----------------|--------|
| **users** | Own profile | See citizens | See citizens | All |
| **reports** | Own + public feed | Assigned to dept | Assigned to brgy | All |
| **photos** | Own reports | Assigned reports | Assigned reports | All |
| **categories** | Read all | Read all | Read all | Full |
| **departments** | Read all | Read all | Read all | Full |
| **barangays** | Read all | Read all | Read all | Full |
| **notifications** | Own only | Own only | Own only | All |
| **ai_analysis** | Own reports | Assigned reports | Assigned reports | All |

### Key RLS Functions:
- `is_admin()`: Check if user is admin
- `is_staff()`: Check if user is department/barangay/admin
- `in_assigned_department()`: Check if report assigned to user's department
- `in_assigned_barangay()`: Check if report assigned to user's barangay

---

## 🔄 Status Flow

```
submitted → under_review → verified → assigned → in_progress → resolved → closed
    ↓            ↓            ↓          ↓           ↓            ↓
  Citizen    Admin        Admin      Admin     Department    Admin
  submits    reviews     approves   assigns    works on    verifies
                                                           & closes
```

### Status Descriptions:
1. **submitted**: Citizen created report
2. **under_review**: Admin is reviewing
3. **verified**: Admin approved (not spam/duplicate)
4. **assigned**: Routed to department/barangay
5. **in_progress**: Staff working on it
6. **resolved**: Work completed (with resolution photo)
7. **closed**: Admin verified resolution

---

## 📊 Indexes

Key indexes for performance:
- `reports_status_idx`: Filter by status
- `reports_created_idx`: Recent reports first
- `reports_user_idx`: User's reports
- `reports_category_idx`: Reports by category
- `reports_brgy_idx`: Reports by barangay
- `reports_dept_idx`: Reports by department
- `notifications_user_idx`: User notifications (desc)
- `report_photos_hash_idx`: Duplicate photo detection

---

## 🗄️ Storage Buckets

### report-photos (Public)
- User-submitted photos
- Resolution photos from departments
- Accessible via signed URLs

### verification-ids (Private)
- Government ID photos
- Admin-only access
- Used for citizen verification

---

## 📈 Analytics Queries

Common analytics patterns:

1. **Reports by Status**
   ```sql
   SELECT status, COUNT(*) FROM reports GROUP BY status
   ```

2. **Reports by Barangay**
   ```sql
   SELECT b.name, COUNT(r.*) 
   FROM reports r 
   JOIN barangays b ON r.barangay_id = b.id 
   GROUP BY b.name
   ```

3. **AI Accuracy**
   ```sql
   SELECT 
     COUNT(*) as total,
     AVG(confidence) as avg_confidence
   FROM ai_analysis 
   WHERE status = 'completed'
   ```

4. **Department Workload**
   ```sql
   SELECT d.name, COUNT(r.*) as pending
   FROM reports r
   JOIN departments d ON r.department_id = d.id
   WHERE r.status IN ('assigned', 'in_progress')
   GROUP BY d.name
   ```

---

## 🔮 Future Extensions

Potential schema additions:
- **followers**: Users following specific reports
- **comments**: Public comments on reports
- **report_votes**: Community voting on priority
- **scheduled_maintenance**: Planned work schedules
- **equipment_tracking**: Municipal asset management

---

**Generated:** 2026-05-11  
**Database:** PostgreSQL 15 (Supabase)  
**Version:** SCOUT v1.0
