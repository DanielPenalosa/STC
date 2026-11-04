# SCOUT System - Test Case Scenarios

## Test Environment Setup

### Prerequisites
- ✅ Development server running (`npm run dev`)
- ✅ Supabase project configured
- ✅ Test data seeded (barangays, categories, departments)
- ✅ Sample government ID photos prepared
- ✅ Admin account available

---

## 1. USER REGISTRATION & VERIFICATION

### Test Case 1.1: Successful Registration with Auto-Approval
**Objective:** Verify auto-approval for valid Sta. Cruz, Laguna residents

**Test Data:**
- Name: Juan dela Cruz
- Email: juan.delacruz@test.com
- Phone: 09171234567
- Password: TestPass123!
- ID: Government ID with address "Brgy. Alipit, Sta. Cruz, Laguna"

**Steps:**
1. Navigate to `/register`
2. Fill in all required fields
3. Upload clear photo of government ID showing Sta. Cruz address
4. Click "Create account"
5. Wait on success screen

**Expected Results:**
- ✅ Registration completes within 5 seconds
- ✅ Success screen shows "Checking your verification status..."
- ✅ Spinner animation appears
- ✅ Within 30-60 seconds: "Account Approved!" message
- ✅ Auto-redirects to dashboard after 2 seconds
- ✅ User can submit reports immediately

**Database Validation:**
```sql
SELECT 
  full_name, 
  verification_status, 
  id_verification_status,
  id_verification->'address_validation'->>'isStaCruz' as is_sta_cruz
FROM users 
WHERE email = 'juan.delacruz@test.com';
```
Expected: `verification_status = 'verified'`, `id_verification_status = 'passed'`

---

### Test Case 1.2: Registration with Manual Review (Unclear Address)
**Objective:** Verify manual review workflow for unclear IDs

**Test Data:**
- Name: Maria Santos
- Email: maria.santos@test.com
- ID: Government ID with partial address "Laguna" (no municipality visible)

**Steps:**
1. Complete registration with unclear ID photo
2. Wait on success screen

**Expected Results:**
- ✅ Registration completes successfully
- ✅ Shows "Checking your verification status..."
- ✅ After 30-60 seconds: "Administrator will review your registration"
- ✅ Status remains "AI needs review"
- ✅ Admin notification sent

**Admin Verification:**
1. Login as admin
2. Go to Dashboard → Users → Pending approval
3. Verify user appears with "AI needs review" badge
4. Can view uploaded ID
5. Can manually approve/reject

---

### Test Case 1.3: Registration Rejection (Non-Resident)
**Objective:** Verify auto-rejection for non-residents

**Test Data:**
- Name: Pedro Reyes
- Email: pedro.reyes@test.com
- ID: Government ID with address "Quezon City, Metro Manila"

**Steps:**
1. Complete registration with non-Sta. Cruz ID
2. Wait on success screen

**Expected Results:**
- ✅ Registration completes successfully
- ✅ Shows "Checking your verification status..."
- ✅ After 30-60 seconds: "Registration Not Approved"
- ✅ Shows rejection reason: "Address verification failed: Address belongs to another municipality/province"
- ✅ "Try Again" button appears
- ✅ User remains signed out

---

### Test Case 1.4: Registration with Blurry ID
**Objective:** Verify handling of poor quality images

**Test Data:**
- Name: Ana Cruz
- ID: Blurry government ID photo

**Expected Results:**
- ✅ OCR may timeout or fail to extract text
- ✅ Status: "AI needs review"
- ✅ Admin can manually review

---

## 2. REPORT SUBMISSION

### Test Case 2.1: Submit Report with Photo (Citizen)
**Objective:** Verify citizen can submit reports

**Test Data:**
- Title: "Pothole on Main Street"
- Description: "Large pothole causing traffic issues"
- Photo: Road damage image
- Location: GPS coordinates in Sta. Cruz

**Steps:**
1. Login as verified citizen
2. Go to Dashboard → Submit Report
3. Fill in title and description
4. Upload photo
5. Select location on map (or allow GPS)
6. Submit

**Expected Results:**
- ✅ Report created with unique ref code (RPT-XXXXXXXX)
- ✅ Status: "submitted"
- ✅ AI analysis runs in background
- ✅ Category auto-suggested (e.g., "Road Damage")
- ✅ Barangay auto-detected from GPS
- ✅ Appears in citizen's "My Reports"
- ✅ Admin receives notification

**Database Validation:**
```sql
SELECT 
  ref_code, 
  status, 
  category_id, 
  barangay_id,
  ai_analysis.detected_issue,
  ai_analysis.confidence
FROM reports r
LEFT JOIN ai_analysis a ON r.id = a.report_id
WHERE r.title = 'Pothole on Main Street';
```

---

### Test Case 2.2: Submit Anonymous Report
**Objective:** Verify anonymous reporting functionality

**Steps:**
1. Login as citizen
2. Submit report
3. Check "Submit anonymously" option
4. Submit

**Expected Results:**
- ✅ Report created with `is_anonymous = true`
- ✅ Citizen name hidden from public view
- ✅ Admin can still see reporter identity
- ✅ Report appears in community feed

---

### Test Case 2.3: Duplicate Detection
**Objective:** Verify duplicate report detection

**Steps:**
1. Submit report about same issue
2. Use similar photo or same location
3. Check duplicate warning

**Expected Results:**
- ✅ System flags as `is_possible_duplicate = true`
- ✅ Shows similar reports to user
- ✅ User can proceed or cancel

---

## 3. ADMIN WORKFLOW

### Test Case 3.1: Review Pending Report
**Objective:** Verify admin can review and assign reports

**Steps:**
1. Login as admin
2. Go to Dashboard → Reports
3. Open "submitted" report
4. Review details and AI suggestions
5. Click "Verify"
6. Assign to department
7. Add notes

**Expected Results:**
- ✅ Status changes: submitted → under_review → verified → assigned
- ✅ Department receives notification
- ✅ Status history logged
- ✅ Citizen notified of each status change

---

### Test Case 3.2: Approve User Registration
**Objective:** Verify manual user approval

**Steps:**
1. Login as admin
2. Go to Dashboard → Users → Pending approval
3. View user's uploaded ID
4. Click "Approve"

**Expected Results:**
- ✅ User status: pending → verified
- ✅ User can now login
- ✅ `verified_at` timestamp recorded
- ✅ `verified_by` references admin

---

### Test Case 3.3: Reject User Registration
**Objective:** Verify manual user rejection

**Steps:**
1. Login as admin
2. Go to Dashboard → Users → Pending approval
3. View user's ID
4. Click "Reject"
5. Enter rejection reason: "ID is expired"

**Expected Results:**
- ✅ User status: pending → rejected
- ✅ `rejection_reason` saved
- ✅ User cannot login
- ✅ User sees rejection reason when trying to login

---

## 4. DEPARTMENT STAFF WORKFLOW

### Test Case 4.1: Accept Assigned Report
**Objective:** Verify department staff can work on reports

**Test Data:**
- Login as: Department staff (DPWH)
- Report: Assigned road damage report

**Steps:**
1. Login as department staff
2. Go to Dashboard → Assigned Reports
3. Open assigned report
4. Click "Accept Assignment"
5. Change status to "In Progress"
6. Add work notes

**Expected Results:**
- ✅ Only sees reports assigned to their department
- ✅ Status changes to "in_progress"
- ✅ Assignment marked as accepted
- ✅ Can add progress updates

---

### Test Case 4.2: Mark Report as Done with Resolution Photo
**Objective:** Verify completion workflow

**Steps:**
1. Open in-progress report
2. Upload resolution photo (after fixing)
3. Add completion notes
4. Mark as "Done"

**Expected Results:**
- ✅ Status changes to "done"
- ✅ Resolution photo saved with `kind = 'resolution'`
- ✅ Admin receives notification for verification
- ✅ Citizen notified of progress

---

## 5. BARANGAY STAFF WORKFLOW

### Test Case 5.1: View Barangay Reports
**Objective:** Verify barangay staff see only their barangay's reports

**Test Data:**
- Login as: Barangay staff (Brgy. Alipit)

**Steps:**
1. Login as barangay staff
2. Go to Dashboard

**Expected Results:**
- ✅ Only sees reports from Brgy. Alipit
- ✅ Cannot see reports from other barangays
- ✅ Can update assigned reports
- ✅ Dashboard shows barangay-specific stats

---

## 6. FACEBOOK AUTO-POSTING

### Test Case 6.1: Auto-Post Resolved Report
**Objective:** Verify Facebook integration

**Prerequisites:**
- ✅ Facebook Page configured
- ✅ `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN` set

**Steps:**
1. Admin marks report as "Resolved"
2. Report has before/after photos
3. Wait a few seconds

**Expected Results:**
- ✅ Post appears on Facebook Page feed
- ✅ Side-by-side BEFORE | AFTER image
- ✅ Caption includes:
  - Report title
  - Location (barangay + municipality)
  - Category
  - Dates reported & resolved
  - Reference code
  - Hashtags
- ✅ Post visible to public

**Validation:**
- Check Facebook Page: https://facebook.com/[your-page]
- Verify post contains all required info

---

### Test Case 6.2: Facebook Post Without Photos
**Objective:** Verify text-only post when no photos

**Steps:**
1. Resolve report without resolution photo

**Expected Results:**
- ✅ Text-only status post created
- ✅ Contains report details

---

## 7. EMAIL NOTIFICATIONS

### Test Case 7.1: Password Reset Email
**Objective:** Verify email delivery

**Prerequisites:**
- ✅ Gmail OAuth2 configured
- ✅ SMTP credentials set

**Steps:**
1. Go to `/forgot-password`
2. Enter registered email
3. Click "Send code"
4. Check email inbox

**Expected Results:**
- ✅ Email received within 30 seconds
- ✅ Contains 6-digit verification code
- ✅ Code valid for 10 minutes
- ✅ Can reset password successfully

---

### Test Case 7.2: Status Update Notification Email
**Objective:** Verify citizens receive status updates

**Steps:**
1. Admin changes report status
2. Check citizen's email

**Expected Results:**
- ✅ Email sent to report submitter
- ✅ Contains report title and new status
- ✅ Link to view report

---

## 8. AI FEATURES

### Test Case 8.1: AI Photo Classification
**Objective:** Verify AI categorizes report photos

**Test Data:**
- Photo: Clear image of road damage

**Steps:**
1. Citizen submits report with photo
2. Wait 5-10 seconds for AI processing

**Expected Results:**
- ✅ AI suggests category (e.g., "Road Damage")
- ✅ Confidence score > 0.6
- ✅ Suggests appropriate department (DPWH)
- ✅ Admin can accept or override suggestion

---

### Test Case 8.2: AI ID Verification (FREE OCR)
**Objective:** Verify Tesseract.js OCR works

**Prerequisites:**
- ✅ No `OPENAI_API_KEY` configured (uses FREE OCR)

**Test Data:**
- ID: Clear government ID with printed text

**Steps:**
1. Register new user with ID
2. Check server logs

**Expected Results:**
- ✅ Console: "[Upload ID] Using FREE Tesseract.js OCR"
- ✅ Text extracted from ID
- ✅ Name found and matched
- ✅ Address validated against Sta. Cruz barangays
- ✅ Auto-approval if all checks pass

---

## 9. MAP & LOCATION

### Test Case 9.1: GPS Auto-Detection
**Objective:** Verify barangay detection from GPS

**Test Data:**
- GPS: 14.2771152, 121.4178920 (Poblacion I)

**Steps:**
1. Submit report
2. Allow GPS access or click map

**Expected Results:**
- ✅ Barangay auto-detected: "Poblacion I"
- ✅ Map shows marker at correct location
- ✅ Address text populated

---

### Test Case 9.2: Map View of Reports
**Objective:** Verify reports appear on map

**Steps:**
1. Go to Dashboard → Map
2. View clustered markers

**Expected Results:**
- ✅ All public reports shown as markers
- ✅ Markers clustered when zoomed out
- ✅ Clicking marker shows report preview
- ✅ Can filter by status/category

---

## 10. ANALYTICS

### Test Case 10.1: View Admin Analytics
**Objective:** Verify analytics dashboard

**Steps:**
1. Login as admin
2. Go to Dashboard → Analytics

**Expected Results:**
- ✅ Chart: Reports by status
- ✅ Chart: Reports by category
- ✅ Chart: Reports by barangay
- ✅ Chart: Resolution time trends
- ✅ Total counts displayed
- ✅ Data updates in real-time

---

## 11. SECURITY & ACCESS CONTROL

### Test Case 11.1: Citizen Cannot Access Admin Features
**Objective:** Verify RLS policies work

**Steps:**
1. Login as citizen
2. Try to access `/dashboard/users`
3. Try to access another user's anonymous report

**Expected Results:**
- ✅ Redirected or access denied
- ✅ Cannot see admin-only menu items
- ✅ Cannot view other citizens' data
- ✅ Can only edit own reports (if status = submitted)

---

### Test Case 11.2: Department Staff Scope Restrictions
**Objective:** Verify staff only see assigned reports

**Steps:**
1. Login as DPWH staff
2. Try to view Health Office reports

**Expected Results:**
- ✅ Cannot see reports assigned to other departments
- ✅ Dashboard shows only DPWH stats
- ✅ RLS policy enforces scope

---

## 12. EDGE CASES

### Test Case 12.1: Registration During Downtime
**Objective:** Verify graceful failure handling

**Steps:**
1. Disable Tesseract.js (simulate failure)
2. Register new user

**Expected Results:**
- ✅ Registration still completes
- ✅ ID saved but marked "not_run"
- ✅ Admin can manually review
- ✅ User not blocked

---

### Test Case 12.2: Multiple Rapid Status Changes
**Objective:** Verify status history tracking

**Steps:**
1. Admin rapidly changes report status multiple times

**Expected Results:**
- ✅ All status changes logged
- ✅ Status history shows correct order
- ✅ No race conditions
- ✅ Notifications sent for each change

---

### Test Case 12.3: Large Photo Upload
**Objective:** Verify file size limits

**Steps:**
1. Try uploading 15 MB photo

**Expected Results:**
- ✅ Error: "Photo must be under 8 MB"
- ✅ Photo not uploaded
- ✅ Client-side compression attempted first

---

## 13. MOBILE RESPONSIVENESS

### Test Case 13.1: Mobile Registration
**Objective:** Verify mobile camera integration

**Device:** Mobile phone

**Steps:**
1. Navigate to `/register` on mobile
2. Take photo of ID using camera

**Expected Results:**
- ✅ Camera opens via `capture="environment"`
- ✅ Photo captured successfully
- ✅ Preview shows before upload
- ✅ Registration completes

---

### Test Case 13.2: Mobile Report Submission
**Objective:** Verify mobile-friendly submission

**Steps:**
1. Submit report on mobile
2. Use GPS location

**Expected Results:**
- ✅ GPS permission requested
- ✅ Location detected automatically
- ✅ Map interaction works on touch
- ✅ Photo upload works

---

## 14. PERFORMANCE

### Test Case 14.1: Load Time - Dashboard
**Objective:** Verify acceptable load times

**Steps:**
1. Login and navigate to dashboard
2. Measure load time

**Expected Results:**
- ✅ Initial load < 3 seconds
- ✅ Navigation between pages < 1 second
- ✅ API responses < 500ms

---

### Test Case 14.2: Concurrent Users
**Objective:** Test under load

**Steps:**
1. Simulate 50 concurrent users registering
2. Monitor server resources

**Expected Results:**
- ✅ All registrations succeed
- ✅ OCR processing queues properly
- ✅ No crashes or timeouts

---

## 15. DATA INTEGRITY

### Test Case 15.1: Database Constraints
**Objective:** Verify data validation

**Steps:**
1. Try creating report with invalid status
2. Try assigning non-existent department

**Expected Results:**
- ✅ Database constraint violations caught
- ✅ Friendly error messages shown
- ✅ Data remains consistent

---

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test users
DELETE FROM users WHERE email LIKE '%@test.com';

-- Delete test reports
DELETE FROM reports WHERE title LIKE 'TEST%';

-- Reset sequences if needed
-- (Supabase handles this automatically)
```

---

## Automated Testing Checklist

For CI/CD pipeline:

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build succeeds
- [ ] TypeScript type checking passes
- [ ] No ESLint errors
- [ ] Database migrations apply cleanly
- [ ] Environment variables configured
- [ ] Supabase Edge Functions deployed

---

## Test Execution Summary Template

| Test Case | Status | Notes | Tester | Date |
|-----------|--------|-------|--------|------|
| 1.1 Auto-approval | ✅ Pass | - | - | - |
| 1.2 Manual review | ✅ Pass | - | - | - |
| 1.3 Rejection | ✅ Pass | - | - | - |
| 2.1 Submit report | ✅ Pass | - | - | - |
| ... | | | | |

---

**Test Environment:**
- Version: SCOUT v1.0
- Database: PostgreSQL 15 (Supabase)
- Frontend: Next.js 16.3.5
- OCR: Tesseract.js (FREE) or OpenAI GPT-4o-mini

**Last Updated:** 2026-05-11
