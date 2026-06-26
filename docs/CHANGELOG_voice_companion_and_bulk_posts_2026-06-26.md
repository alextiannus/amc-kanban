# Changelog: Voice-Only Companion and Bulk Post Generation Interface

**Date**: 2026-06-26
**Project Scope**: AMC Brand Owner Portal (`amc-mm`) Homepage Enhancements

---

## Overview

We modified the AMC Brand Owner Portal dashboard homepage to deliver a purely voice-controlled companion experience. This aligns with the transition toward hands-free voice operations for F&B brand owners, coupled with rich expressive emojis and a powerful bulk post creation scheduling workflow.

---

## 1. Voice-Only Chat Companion

### Design Decision
The conversation history panel (chat text bubbles) has been completely removed from the home screen (`activeSubPage === null`). Instead, a large, centered, interactive circular Companion Face acts as the main vocal point.

### Implementation Details
- **Speech recognition**: Utilizes standard browser Web Speech APIs (`window.SpeechRecognition` / `window.webkitSpeechRecognition`) to capture microphone inputs.
- **Speech synthesis**: Utilizes `window.speechSynthesis` and `SpeechSynthesisUtterance` to speak AI responses.
- **Backend route**: Integrated `POST /api/brands/[id]/copywriter/voice-chat` which queries brand knowledge parameters (tagline, address, location, menu, and slang dictionary) to generate short, speech-optimized conversational replies (1-2 sentences).

---

## 2. Rich Expressive Facial Animations

### Design Decision
The minimalist face is updated with multi-state animations to increase visual appeal and micro-interaction engagement.

### Implementation Details
The companion renders dynamic SVG eye arcs and Framer Motion mouth shapes based on the current state and emotion:
1. **Listening**: Pulsing green halo, soundwave-style animated mouth.
2. **Thinking**: Pulsing indigo halo, horizontal scale-breathing line mouth.
3. **Speaking**: Pulsing purple halo, vertical open-close speaking mouth.
4. **Effort (努力)**: Pulsing amber halo, sweating drops, determined focused eyes (`> <`), straight flat mouth. Represents AI copywriter processing.
5. **Smile (微笑)**: Curved smile path, friendly eye squint arcs.
6. **Laugh (大笑)**: Wide open crescent mouth, happy squinting eyes, floating sparkles.

---

## 3. Fixed Asset Library Display

### Design Decision
Resolved a mismatch where the front-end was not displaying uploaded assets in the "Media Library" grid.

### Implementation Details
- Changed `setAssets(data)` to `setAssets(data.assets || [])` when loading active brand details to handle the unified backend schema `{ assets, folders }` correctly.
- Replaced the failing `FormData` file upload requests in the homepage file input change handler with base64 data conversion, sending JSON requests to `POST /api/brands/[id]/assets/upload`.
- Differentiated behavior between subpages:
  - Inside the **Assets page** (`activeSubPage === 'assets'`), files upload immediately to the library grid.
  - On the **Homepage** (`activeSubPage === null`), files are stored in pending state for bulk generation.

---

## 4. Homepage Bulk Generation & Preview Grid

### Design Decision
F&B managers can now upload up to 9 photos from a single shift, enter or dictate a creative theme, and have AMC generate scheduled marketing posts for all platforms.

### Implementation Details
- **Thumbnail Grid Preview**: Previews are displayed directly on the home screen with individual deletion buttons.
- **Creative Input**: Displays a text area inviting prompt instructions, supporting mic dictate fills.
- **Backend route**: Integrated `POST /api/brands/[id]/copywriter/bulk-generate`. Automatically queries configured platforms, calls Gemini in parallel, creates drafts in the database scheduled starting tomorrow at 10:00 AM (staggered), links the media assets, and builds approval action items.
- **UX Flow Completion**: On completion, displays a success card pointing to the calendar, plays a spoken confirmation, and refreshes the planner calendar drafts.
