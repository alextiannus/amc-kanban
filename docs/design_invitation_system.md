# Design Specification — Invitation & Referral Code System

This document details the database schema, business rules, and registration workflow for the **Referral & Invitation Code System** across the AMC platforms.

---

## 1. Architectural Distinction

We maintain two separate mechanisms for user onboarding:
1. **Direct Onboarding (`Invitation` Table)**: Pre-allocated tokens sent to specific email addresses by Admins/Principals to onboard team members or direct clients.
2. **Referral Invite Codes (`inviteCode` on `User`)**: Personal codes generated for every user. New users register using these codes for attribution.

---

## 2. Database Schema (Prisma)

We will modify the `User` model in `prisma/schema.prisma` in `amc-kanban`:

```prisma
model User {
  id               String            @id @default(cuid())
  email            String            @unique
  password         String
  type             String            @default("HUMAN")
  role             String            @default("USER")
  
  // Invitation System Fields
  inviteCode       String            @unique // Unique referral code (e.g., AMC-A8F9)
  referredById     String?           // Referrer's User ID
  referredBy       User?             @relation("UserReferrals", fields: [referredById], references: [id])
  referrals        User[]            @relation("UserReferrals")
  
  ...
}
```

We also utilize the existing or planned `Revenue` model to log BD commission transactions:
```prisma
model Revenue {
  id          String   @id @default(cuid())
  brandId     String
  brand       Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  amount      Decimal
  currency    String   @default("USD")
  period      String   // e.g. "2026-07"
  type        String   // "subscription" | "addon"
  bdId        String?  // Attributed BD User ID
  inviteCode  String?  // The invite code used for signup
  createdAt   DateTime @default(now())
}
```

---

## 3. Onboarding & Registration Flow

```mermaid
graph TD
    A[New User visits Registration Page] --> B{URL query has ?ref=CODE ?}
    B -- Yes --> C[Autofill Invite Code Input & Cache Code]
    B -- No --> D[Input Invite Code Manually (Optional)]
    C --> E[Submit Registration Form]
    D --> E
    E --> F{Validate inviteCode in DB}
    F -- Valid --> G[Create User & set referredById = Referrer.id]
    F -- Invalid / Empty --> H[Create User with referredById = null]
    G --> I{Inspect Referrer Role}
    I -- BD / Principal --> J[Attribute sales for commission calculation]
    I -- Brand Owner --> K[Attribute referral sharing rewards]
```

### Flow Details:
1. **Invite Code Generation**:
   Upon user signup, the backend generates a unique `inviteCode` using a prefix + random string pattern (e.g., `AMC-${randomAlphanumeric(6)}`).
2. **Attribution Cache**:
   If the user lands on `/register?ref=AMC_8B2F9X`, a client-side hook caches the code in `localStorage` or cookies to ensure persistence if the user navigates away before completing signup.
3. **API Validation**:
   - The `/api/auth/register` API checks if `inviteCode` is provided.
   - If provided, it queries `prisma.user.findUnique({ where: { inviteCode } })`.
   - If found, saves the new user with `referredById`.

---

## 4. Role-based Business Logic

| Referrer Role | Scenario | Triggered Business Logic |
|---|---|---|
| **BD / AMC_PRINCIPAL** | Merchant subscribes to a brand package | Log 20% commission (configurable) to `Revenue` table; tag with `bdId` for financial reporting. |
| **BRAND_OWNER** | Merchant subscribes to a brand package | Grant referral reward (e.g., 50 bonus generation credits or 10% coupon code) to both the referrer and referee. |

---

## 5. Verification Plan

### Automated
- Execute `npx prisma db push` (or migration) and compile checks via `npm run build`.

### Manual
- Simulate merchant registration using a BD's invite code and verify `referredById` is set correctly.
- Trigger mock subscription pay events and verify commission logging in the database.
