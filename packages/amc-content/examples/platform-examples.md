# amc-content platform examples

These examples are starter gold samples for manual review and future regression tests. They focus on local lifestyle businesses rather than only F&B.

## 1. Instagram - Fitness / Pilates

Input brief:

```json
{
  "platform": "instagram",
  "industryVertical": "fitness_pilates",
  "brand": {
    "name": "Core Form Studio",
    "description": "Boutique reformer pilates studio for office workers in Singapore.",
    "tone": "Warm, precise, encouraging. Avoid hype.",
    "address": "12 Tanjong Pagar Road, Singapore",
    "website": "https://coreform.example"
  },
  "theme": "Promote weekday lunch-time reformer pilates trial classes",
  "customerIntent": "trial_class",
  "localProof": ["Tanjong Pagar", "45-minute class", "beginner-friendly"],
  "media": ["Bright studio room", "Reformer machines", "Trainer adjusting posture"]
}
```

Gold output:

```json
{
  "caption": "A stronger Tanjong Pagar lunch break starts here.\n\nStep into a 45-minute reformer pilates trial designed for busy CBD workdays: focused coaching, calm pacing, and movements that help you reset before the afternoon.\n\n• Beginner-friendly class flow\n• Small-group guidance\n• Easy access from the CBD\n\nVisit Core Form Studio at 12 Tanjong Pagar Road or book your trial via our website.",
  "hashtags": ["sgpilates", "reformerpilates", "tanjongpagar", "pilatesstudio"]
}
```

Quality notes:

- Uses a clear benefit hook without overclaiming body transformation.
- Includes local proof and address.
- Keeps Instagram hashtags within the 3-5 focused range.
- Avoids generic AI phrases such as "game-changer" or "discover the secrets".

## 2. Google Business Profile / Google Maps - Beauty & Wellness

Input brief:

```json
{
  "platform": "google_business",
  "industryVertical": "beauty_wellness",
  "brand": {
    "name": "Glow Haus Facial Bar",
    "description": "Calm facial and skin maintenance studio.",
    "tone": "Professional, reassuring, concise.",
    "address": "88 East Coast Road, Singapore",
    "phone": "+65 6123 4567",
    "website": "https://glowhaus.example"
  },
  "theme": "Announce a weekday hydration facial package",
  "customerIntent": "booking",
  "localProof": ["East Coast", "weekday appointments", "60-minute facial"]
}
```

Gold output:

```json
{
  "caption": "Glow Haus Facial Bar is now offering a weekday hydration facial package for guests looking for a calm 60-minute skin maintenance session in East Coast.\n\nVisit us at 88 East Coast Road, Singapore. To book an appointment, visit https://glowhaus.example or use the Call now button on Google.",
  "hashtags": []
}
```

Quality notes:

- Google Business content is concise, location-centric, and contact-led.
- Includes address and a direct CTA.
- Uses no hashtags.
- Avoids writing a phone number in the post text; Google Business Profile should use the native Call now button.
- Avoids medical or guaranteed transformation claims.

## 3. Xiaohongshu - Home Renovation / Local Service

Input brief:

```json
{
  "platform": "xiaohongshu",
  "industryVertical": "home_renovation",
  "brand": {
    "name": "Haven Works",
    "description": "Singapore home renovation team focused on compact condo storage and practical carpentry.",
    "tone": "Useful, friendly, local, practical.",
    "location": "Singapore",
    "negativePrompts": ["全网最低价", "保证最便宜"]
  },
  "theme": "分享小户型玄关收纳改造案例",
  "customerIntent": "upgrade_space",
  "localProof": ["小户型", "玄关收纳", "木作细节", "新加坡公寓"]
}
```

Gold output:

```json
{
  "caption": "📍新加坡小户型玄关这样改，真的会清爽很多！！\n\n很多公寓一进门就容易堆鞋、包包、雨伞，看起来乱，其实问题不一定是空间太小，而是收纳动线没有设计好。\n\n✨ 这次 Haven Works 做的是玄关收纳优化：\n▫️ 鞋柜留出常穿鞋开放区\n▫️ 中段做随手放钥匙和小物的平台\n▫️ 高柜收雨伞、清洁用品和备用物品\n▫️ 木作颜色尽量贴近原本室内风格，不会突兀\n\n✅ 小户型改造最重要的不是塞满柜子，而是让每天进出门都更顺。\n\n想做类似的玄关或公寓收纳规划，可以联系 Haven Works 先聊你的户型和生活习惯～",
  "hashtags": ["新加坡装修", "小户型改造", "玄关收纳", "公寓装修", "本地生活"]
}
```

Quality notes:

- Uses Xiaohongshu-native layout with short sections and visual separators.
- Avoids unsupported price claims such as "全网最低价".
- Uses practical local-service proof instead of exaggerated renovation promises.
- Keeps hashtags within the 3-10 range.
