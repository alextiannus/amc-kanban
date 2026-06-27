# Changelog: AMC-MM UI Improvements & Brand Management — 2026-06-27

## Overview
Three UI improvements to amc-kanban and amc-mm:
1. Added "添加新品牌" (Add New Brand) button in BrandSwitcher dropdown
2. In-store activity (game) preview button already opens new tab (confirmed working)
3. AMC main login + AMC-MM login/register pages redesigned with unified light theme and updated copy

---

## 1. BrandSwitcher — Add New Brand Button

**File**: `src/components/layout/BrandSwitcher.tsx`

- Added a "添加新品牌" button at the bottom of the brand switcher dropdown (below a divider)
- Clicking navigates to `/board/subscription` (no brandId), entering the subscription onboarding flow for a brand-new brand
- Uses `useRouter` from next/navigation for programmatic navigation
- Visual: indigo Plus icon, matches brand's design language

## 2. In-Store Activity Preview (Confirmed Working)

**File**: `src/components/dashboard/GameSettingsDashboard.tsx`

- The "预览 H5" (`<Eye>` icon) button at the top-right of the game settings panel already opens `/game/${brandId}` in a new browser tab via `target="_blank"` and `rel="noopener noreferrer"`
- No changes needed — functionality was already implemented correctly

## 3. AMC Login/Register Page — Copy Updates

**File**: `src/app/page.tsx`

### Changes:
- Tab labels: "Sign In" / "Create Account" → **"Meet Your AI Staff"** (both tabs)
- Submit button: "Launch Dashboard" / "Create Account" → **"Meet Your AI Staff"**
- Footer: "Secure access via SSO is enabled." → **"powered by Immedi.ai"**

## 4. AMC-MM Login Page — Full Redesign

**File**: `src/app/mock-merchant/login/page.tsx`

### Changes:
- **Design**: Migrated from minimal dark-capable design to premium light glassmorphic design (matching main AMC login page)
  - `bg-[#F8FAFC]` background with aurora blur glows
  - `bg-white/80 backdrop-blur-md` glass card
  - Indigo-purple gradient header and submit button
  - Sparkles icon in header
- **Copy**:
  - Tab labels: "Sign In" → **"Meet Your AI Staff"**
  - Submit button: "Sign In" → **"Meet Your AI Staff"**
  - Footer: "Simulator Environment" → **"powered by Immedi.ai"**
- Removed dark mode classes entirely

## 5. AMC-MM Register Page — Full Redesign

**File**: `src/app/mock-merchant/register/page.tsx`

### Changes:
- **Design**: Unified with login page — same glassmorphic light design
  - Same aurora glow backgrounds
  - Same Sparkles icon header
  - Same indigo-purple gradient submit button
- **Copy**:
  - Tab labels: "Create Account" → **"Meet Your AI Staff"**
  - Submit button: "Create Simulator Account" → **"Meet Your AI Staff"**
  - Footer: "SIMULATOR ENVIRONMENT • SECURED WITH SSO" → **"powered by Immedi.ai"**
- Removed dark mode classes entirely
