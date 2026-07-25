# AMC-Kanban Local Agent Rules

## Concurrency and Test Limits
- **Hard Rule**: Always stop or kill any local command, build, or test execution if it runs for more than 5 minutes (300,000 ms). Never allow tasks to exceed this limit.

<!-- BEGIN:icon-design-rules -->
# Icon Design Rules — All Projects

## HARD RULE: No Emoji as UI Icons

NEVER use emoji characters (e.g. 📍 🎯 🗣️ 🚀 💎 ✨ ⚔️ 📡) as icons in any UI component, label, badge, or button.
Emoji rendering is OS-dependent, inconsistent in size/alignment, and looks unprofessional.

## What to Use Instead

| Context | Use |
|---------|-----|
| Icon next to a heading or label | A **Lucide React** icon (`<MapPin />`, `<Target />`, etc.) |
| Icon in an attribute/data row | Small colored `div` wrapper: `w-6 h-6 rounded-lg bg-violet-50` + Lucide icon inside |
| Section header accent | Colored bar span (`w-1 h-4 rounded-full bg-violet-500`) — no extra icon needed |
| Status badge or button text | Plain text only — no emoji prefix |

## Approved Icon Libraries (priority order)

1. **Lucide React** — primary for all projects
2. **Heroicons** — only if Lucide lacks the icon
3. Inline SVG — only for brand/platform logos (Instagram, TikTok, etc.)

## Code Example

```tsx
// ❌ WRONG
<span>📍 门店地址</span>

// ✅ CORRECT
<div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
  <MapPin className="w-3.5 h-3.5 text-slate-500" />
</div>
```
<!-- END:icon-design-rules -->
