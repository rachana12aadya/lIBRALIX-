# libralix Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document in `/users/{userId}` and its subcollections (`private`, `tasks`, `research`, `events`, `notes`, `decisions`, `triage`, `integrations`) belongs strictly to `userId == request.auth.uid` with `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email is isolated in `/users/{userId}/private/{docId}` and never readable or listable by any other user.
3. **Immutable Ownership & Timestamps**: `uid` and `createdAt` can never be changed after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
4. **Strict Schema & Bounds**: Every write validates exact key membership (`hasAll` + `hasOnly` on create, `diff(existing()).affectedKeys().hasOnly(...)` on update), strict types, enum allowlists, regex ID validation (`^[a-zA-Z0-9_\-]+$`), and string/list size bounds.
5. **Terminal State Locking**: Once a `DecisionAnalysis` reaches `status == 'decided'` or an `InboxTriageItem` reaches `status == 'archived'`, no further updates are permitted.
6. **Master Gate on Subcollections**: Every subcollection operation verifies `isOwner(userId)` and checks `exists(/databases/$(database)/documents/users/$(userId))` (for sub-resources after profile bootstrap, or `userId == request.auth.uid` on `private/info` bootstrap). Wait: to allow first-login parallel bootstrap or require profile first, the client creates `/users/{userId}` first, then `/users/{userId}/private/info` and subcollections! Using `exists(/databases/$(database)/documents/users/$(userId))` on subcollections (`tasks`, `research`, `events`, `notes`, `decisions`, `triage`, `integrations`) enforces the Master Gate cleanly.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: `auth == null` attempting `get` or `create` on `/users/u1/tasks/t1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: "u1", token: { email_verified: false } }` attempting `create` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Read**: `u2` attempting `get` or `list` on `/users/u1/tasks` -> `PERMISSION_DENIED`.
4. **Cross-Tenant PII Leak**: `u2` attempting `get` on `/users/u1/private/info` -> `PERMISSION_DENIED`.
5. **UID Spoofing on Create**: `u1` creating `/users/u1/tasks/t1` with `data.uid = "u2"` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: `u1` creating a task with extra field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
7. **Timestamp Forgery**: `u1` creating a task with client-forged `createdAt: "2020-01-01"` instead of `request.time` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: `u1` creating `/users/u1/tasks/bad$id!!` or 200-char ID -> `PERMISSION_DENIED`.
9. **Denial-of-Wallet Oversized String**: `u1` creating a note with 20,000-character `content` -> `PERMISSION_DENIED`.
10. **Unbounded Array Injection**: `u1` creating a `ResearchBrief` with 25 `keyFindings` -> `PERMISSION_DENIED`.
11. **Immortal Field Mutation**: `u1` updating a task's `createdAt` or `uid` -> `PERMISSION_DENIED`.
12. **Terminal State Bypass**: `u1` updating a `DecisionAnalysis` whose existing `status == "decided"` -> `PERMISSION_DENIED`.
