# Default Lobster Avatar Fallback

## Overview

A cute lobster avatar SVG has been added as the default fallback image when Agent avatars fail to load or are not provided.

## Files Created

- **`public/default-lobster-avatar.svg`** - Cute 3D chibi lobster mascot avatar design with:
  - Coral-red shell with gradient shading
  - Large sparkling eyes
  - Rounded soft body proportions
  - Playful friendly smile
  - Antennas and claws
  - Soft warm background gradient
  - Sparkle effects for visual appeal

- **`src/components/AvatarImage.tsx`** - Reusable React component that:
  - Handles avatar image loading
  - Automatically shows the lobster avatar on load errors
  - Shows the lobster avatar if no avatar URL is provided
  - Prevents broken image icons from displaying

## Components Updated

The following components now use the `AvatarImage` component for proper fallback handling:

1. `TaskCard.tsx` - Task assignee avatar display
2. `TaskModal.tsx` - Agent profile avatar in task modal
3. `Column.tsx` - Agent avatar header in kanban columns
4. `ArchiveView.tsx` - Archived task assignee avatar
5. `AgentSequenceView.tsx` - Agent list avatar display
6. `KanbanBoard.tsx` - Quick task list avatar display
7. `agents/[id]/page.tsx` - Agent profile page avatar

## Usage

To use the `AvatarImage` component:

```tsx
import AvatarImage from '@/components/AvatarImage'

// In your JSX:
<AvatarImage 
  src={agent.avatar} 
  alt="Agent Avatar" 
  className="w-full h-full object-cover" 
/>
```

The component will automatically:
- Display the provided avatar image if it loads successfully
- Fall back to the default lobster avatar if the image fails to load
- Fall back to the default lobster avatar if `src` is null/undefined

## Customization

To customize the fallback behavior or image:
1. Edit `public/default-lobster-avatar.svg` for visual changes
2. Modify `src/components/AvatarImage.tsx` to change the fallback path or behavior
