# System Design Spec — Invitation, Fission & Marketing Promo Code Module

This document outlines the detailed system design for the new independent **Invitation, Fission & Marketing Promo Code Module** in AMC. It supports user-to-user fission (referrals), registration relationship binding, dynamic subscription discounts, and campaign-level promo code generation.

---

## 1. Core Objectives
1. **Universal Fission**: Every user (Merchant, BD, Principal, Admin) has a personal invitation code to refer new restaurant owners.
2. **Registration Binding**: Automatically bind the referral tree (`referredById` on the `User` model) during signup via links like `?ref=CODE`.
3. **Special Discounts & Incentives**:
   - **Referee (New User)**: Special discount (e.g. 10% off their first subscription or free Trial month) when registering with a valid invite or promo code.
   - **Referrer (Inviter)**: Role-based rewards:
     - *Brand Owners / Merchants*: Earn system credits or free months of subscription.
     - *BDs / Principals*: Earn percentage-based recurring commissions.
4. **Independent Marketing Promo Codes**: Admins, Principals, and BDs can generate standalone promo codes (e.g. `SUMMER2026`, `12EAT_VIP`) with custom discount rates, expiration dates, and maximum usage quotas.
5. **Open Management Interface**: Admins, Principals, and BDs have access to a dedicated dashboard to generate, view, and monitor marketing promo codes and fission statistics.

---

## 2. Database Schema Design (Prisma)

To support both user-referred codes and campaign-based promo codes, we will implement the following database structure:

```prisma
// ── User Model Extensions ────────────────────────────────────────────────────
model User {
  id           String            @id @default(cuid())
  email        String            @unique
  password     String
  role         String            @default("USER")  // ADMIN | USER
  
  // 1. Personal Invitation Code (For Fission/Attribution)
  inviteCode   String?           @unique           // e.g., AMC-K7F9X2 (Self-healing on first load)
  referredById String?                             // The ID of the User who referred this user
  referredBy   User?             @relation("UserReferrals", fields: [referredById], references: [id])
  referrals    User[]            @relation("UserReferrals")
  
  // 2. Relations to Marketing Promo Codes
  createdCampaigns CampaignPromoCode[] @relation("CreatedPromoCodes")
  ownedCampaigns   CampaignPromoCode[] @relation("OwnedPromoCodes")
}

// ── Independent Marketing/Campaign Promo Codes ──────────────────────────────
model CampaignPromoCode {
  id            String    @id @default(cuid())
  code          String    @unique           // e.g. "SUMMER10", "12EAT_PROMO"
  name          String                      // Campaign Name (e.g., "Singapore Mid-Year Promotion")
  description   String?
  
  // Discount Configuration
  discountType  String    @default("PERCENT") // "PERCENT" (e.g. 10% off) or "FIXED_AMOUNT" (e.g. $50 off)
  discountValue Float                       // The actual numerical value
  applyDuration String    @default("ONCE")    // "ONCE" (first invoice), "FOREVER" (lifetime recurring), or "MULTIPLE_MONTHS"
  durationMonths Int?                       // Null unless applyDuration is "MULTIPLE_MONTHS"
  
  // Constraints
  maxUses       Int?                        // Maximum number of times this code can be used (null = unlimited)
  usedCount     Int       @default(0)
  expiresAt     DateTime?                   // Expiration date (null = perpetual)
  isActive      Boolean   @default(true)
  
  // Creators & Owners
  createdById   String
  createdBy     User      @relation("CreatedPromoCodes", fields: [createdById], references: [id])
  ownerId       String?                     // The BD or Principal who owns this campaign (for commission attribution)
  owner         User?     @relation("OwnedPromoCodes", fields: [ownerId], references: [id])
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

// ── Track Code Usage & Attributed Subscriptions ────────────────────────────
model PromoCodeUsage {
  id             String    @id @default(cuid())
  userId         String                      // The merchant user who redeemed the code
  codeUsed       String                      // The literal code typed (personal invite code or promo code)
  codeType       String                      // "USER_INVITE" | "CAMPAIGN_PROMO"
  referredById   String?                     // User ID who gets credit (if USER_INVITE)
  campaignCodeId String?                     // Campaign ID (if CAMPAIGN_PROMO)
  subscriptionId String                      // The BrandSubscription that was discounted
  discountAmount Float                       // Calculated discount applied in USD
  createdAt      DateTime  @default(now())
}
```

---

## 3. Workflow & Processing Logic

### A. Code Validation & Registration Flow
1. **URL Capture**: When a user hits `/register?ref=CODE` or `/register?promo=CODE`, client-side cookies or `localStorage` cache the code.
2. **Registration Form**:
   - The form renders a field: **"邀请码 / 优惠码" (Invite or Promo Code)**.
   - If a code is detected in the URL or cache, it is automatically pre-filled and locked (or editable).
3. **Backend Registration Handler**:
   - If the code matches a **personal `inviteCode`** on a `User`:
     - Bind `referredById` of the new user to the referrer's user ID.
     - Look up default fission discount settings (e.g. 10% off the first month).
   - If the code matches a **`CampaignPromoCode`**:
     - Check if `isActive === true`, `expiresAt` is in the future, and `usedCount < maxUses`.
     - Associate `referredById` to the campaign owner (`ownerId` of the campaign) if the owner is a BD/Principal.
     - Store the campaign discount configuration.
   - If code is invalid: Return a validation warning, but allow registration without discount if they proceed.

### B. Payment & Discount Calculations
1. **Checkout & Invoicing**:
   - During `BrandSubscription` creation, if the user registered with a code:
     - Look up the discount rules.
     - Calculate `totalDueUsd` after applying the discount (e.g., `$499` plan with `10%` discount = `$449.10` due).
     - Save the `PromoCodeUsage` history record.
2. **Fission Rewards Release**:
   - When the referee pays their first invoice:
     - If the referrer was a **Brand Owner (Merchant)**: Trigger email notification and deposit reward credits to the referrer (or mark their next invoice as discounted).
     - If the referrer was a **BD / Principal**: Log a 20% commission in the revenue table attributed to their ID.

---

## 4. UI/UX Interface Mockups (Admin / Principal / BD)

A new interface **“裂变与营销推广中心 (Fission & Promo Center)”** will be built for management accounts.

### 4.1 "My Referral Code" Card (For all users)
- Displays: *"您的个人裂变推广码: AMC-XXXX"* (Your personal code).
- Quick actions: Copy link, copy code, show QR code.
- Fission summary: Total referred users, total rewards earned.

### 4.2 "Marketing Promo Codes" Panel (Admin, Principal, BD only)
- **Promo Code Table**:
  - Code (e.g., `SUMMER20`)
  - Campaign Name
  - Discount Rate (e.g., 20%)
  - Usage stats (e.g., `45 / 100` uses)
  - Owner (who gets the BD performance credit)
  - Expiration Date
  - Status Toggle (Active/Inactive)
- **"创建营销优惠码" (Create Promo Code) Modal Dialog**:
  - Form Fields:
    - Code Name (alphanumeric, converted to uppercase)
    - Campaign Label
    - Discount Type: `Percentage (%)` or `Fixed Amount ($)`
    - Value (e.g. `15.00`)
    - Duration: `First Month Only` or `Lifetime Recurring`
    - Max Uses (e.g., `50` or leave empty for unlimited)
    - Expiration Calendar selector
    - Target Attribution Owner (Dropdown list of BDs, defaults to self)

---

## 5. Implementation Roadmap & Verification Plan

### Phase 1: Database Migration
- Add `CampaignPromoCode` and `PromoCodeUsage` models.
- Add `UserReferrals` relations.
- Run `npx prisma db push`.

### Phase 2: Backend Logic & Middleware
- Create validation route: `POST /api/promo/validate` (checks code validity and returns discount amount).
- Update registration API `/api/auth/register` to support referral mapping.
- Update `/api/subscription/confirm` to apply promo/invite discounts on checkout invoices.

### Phase 3: Frontend Views
- Add promo code field to the signup flow.
- Add "Fission & Promo Center" tab to `amc-kanban` settings.
- Add referral card to `amc-mm` profile.

### Verification
- Unit test validation logic for expired or exhausted promo codes.
- E2E check signup attributing and discount pricing.
