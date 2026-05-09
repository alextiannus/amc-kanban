# AMC Agent Avatar Prompt Guide

This guide standardizes how AI agent avatars are generated so they look consistent, clean, and professional.

Default direction for this project: cute chibi lobster mascot style (friendly, playful, high readability at small size).

## 1) Visual Standard (must follow)

- Framing: front-facing bust portrait, head occupies 65%-75% of frame
- Ratio: 1:1 square image
- Background: clean gradient or soft abstract shape, no busy scene
- Lighting: soft cinematic key light, clear face details
- Quality: high detail, no blur, no watermark, no text overlay
- Mood: confident, intelligent, friendly
- For mascot style: large expressive eyes, clear silhouette, simplified body details, high color contrast

## 2) Universal Prompt Template

Use this template for any agent role.

```text
Create a high-quality 1:1 avatar portrait for an AI assistant.
Role: {ROLE_NAME}
Persona: {PERSONA_DESC}
Visual style: {STYLE_PRESET}
Primary color: {PRIMARY_COLOR_HEX}
Secondary color: {SECONDARY_COLOR_HEX}

Requirements:
- front-facing bust portrait
- centered composition
- clean silhouette and clear facial features
- modern digital art quality
- soft gradient background with subtle geometric elements
- sharp focus, high detail, professional finish

Output constraints:
- no text, no logo, no watermark
- no extra limbs, no distorted face, no asymmetry artifacts
- no cluttered background
```

## 3) Negative Prompt (always append)

```text
low quality, blurry, pixelated, noisy skin, distorted face, asymmetrical eyes,
extra fingers, extra limbs, deformed anatomy, cropped head, out of frame,
text, letters, watermark, logo, signature, messy background, overexposed,
underexposed, jpeg artifacts
```

## 4) Style Presets

Pick one style family for all agents in the same board to avoid visual inconsistency.

### Preset A: Neo-3D Mascot

```text
stylized 3D character portrait, soft volumetric lighting, smooth shading,
subtle rim light, premium product illustration look
```

### Preset B: Flat Editorial Illustration

```text
clean vector-like editorial portrait, bold shapes, controlled shadows,
high contrast, minimal but expressive composition
```

### Preset C: Cyber Minimal

```text
futuristic minimal portrait, precise geometry, subtle holographic accents,
dark-neutral base with controlled neon highlights
```

### Preset D: Cute Lobster Mascot (recommended)

```text
cute 3D chibi lobster mascot, bright coral-red shell, huge sparkling eyes,
rounded soft body proportions, playful friendly smile, toy-like premium render,
clean white or light gradient background, subtle soft shadow, crisp outline
```

## 5) Role Prompt Examples

### Research Agent

```text
Role: Market Research Analyst AI
Persona: analytical, detail-oriented, methodical, trustworthy
Visual style: stylized 3D character portrait, soft volumetric lighting
Primary color: #2563EB
Secondary color: #0EA5E9
```

### Product Agent

```text
Role: Product Strategy AI
Persona: strategic, user-centered, calm and decisive
Visual style: clean vector-like editorial portrait, bold shapes
Primary color: #16A34A
Secondary color: #14B8A6
```

### Operations Agent

```text
Role: Operations Coordinator AI
Persona: efficient, practical, stable, reliable
Visual style: futuristic minimal portrait, precise geometry
Primary color: #7C3AED
Secondary color: #3B82F6
```

### Lobster Agent (project default)

```text
Role: AMC Mascot AI Assistant
Persona: friendly, energetic, clever, approachable
Visual style: cute 3D chibi lobster mascot, toy-like premium render
Primary color: #F04438
Secondary color: #22D3EE
```

## 6) Selection Rubric (pick best from 6-8 candidates)

Score each candidate from 1 to 5.

- Clarity: face and silhouette are readable at small size
- Consistency: style matches other agent avatars
- Character fit: aligns with role/persona
- Cleanliness: no artifacts, no text, no visual noise
- Contrast: looks good in both light and dark UI

Use total score as ranking. Keep only the top one.

## 7) Delivery Standard

Before writing to avatar field:

- crop to square
- min size 512x512 (recommended 1024x1024)
- export as webp/jpg with balanced compression
- verify visibility at 32px, 48px, and 80px
- avoid over-complex details that disappear at 32px

## 8) One-Click Prompt (quick copy)

```text
Create a premium 1:1 AI agent avatar in cute chibi lobster mascot style. Front-facing bust portrait, centered, head fills about 70% frame, bright coral-red shell, huge glossy expressive eyes, rounded cute body shapes, friendly smile, clean white or soft gradient background, subtle soft shadow, crisp outline, toy-like high-end 3D render. Persona: {PERSONA}. Primary color {COLOR1}, secondary color {COLOR2}. No text, no logo, no watermark, no distortion, no extra limbs, no clutter.
```

## 9) Ready-to-Use Prompts For This Board

### Chinese prompt (recommended)

```text
请生成一个 1:1 的 AI 头像，风格为「可爱 Q 版 3D 龙虾吉祥物」。
要求：正面胸像构图，头部占画面约 70%，主体居中；红珊瑚色外壳，超大有神的高光眼睛，表情友好聪明，整体圆润、干净、精致；背景使用浅色纯色或柔和渐变，不要复杂场景；画质清晰锐利，边缘干净，适合在 32px 仍可辨识。
禁止：文字、水印、logo、畸形肢体、五官错位、噪点、模糊、脏背景。
```

### English prompt (recommended)

```text
Generate a 1:1 avatar in a cute chibi 3D lobster mascot style.
Requirements: front-facing bust portrait, centered composition, head fills around 70% of frame; bright coral-red shell, huge glossy expressive eyes, friendly and clever expression, rounded clean shapes, premium toy-like render; plain light or soft gradient background; crisp sharp details and strong readability at 32px.
Avoid: text, watermark, logo, distorted anatomy, facial asymmetry, noise, blur, cluttered background.
```
