export type VideoScriptPreset = {
  id: string
  name: string
  description?: string
  creatorType: string
  vertical?: string
  bestFor?: string[]
  structure?: string
  shotDrafts: Array<{
    title: string
    visualPrompt: string
    cameraMotion: string
    textOverlay: string
    voiceover?: string
  }>
}

const hookBodyCta = 'Hook -> Proof/Body -> CTA'

export const localVideoScriptPresets: VideoScriptPreset[] = [
  {
    id: 'product-food-chopsticks-hero',
    name: 'Food Hero Close-up',
    description: 'Best for signature dishes, noodles, grilled items, and hot food assets that need texture and appetite appeal.',
    creatorType: 'product_showcase',
    vertical: 'food_beverage',
    bestFor: ['signature dish', 'hot dish', 'grilled fish', 'stir fry', 'noodles'],
    structure: hookBodyCta,
    shotDrafts: [
      {
        title: 'Hero Bite',
        visualPrompt: 'Open on the selected dish in a real merchant setting. Show glossy sauce, steam, texture, and appetizing heat without inventing ingredients, claims, prices, or signage.',
        cameraMotion: 'macro food close-up, shallow depth of field, visible steam and appetizing texture',
        textOverlay: 'Fresh from the wok',
        voiceover: 'See the texture, heat, and flavor up close.',
      },
      {
        title: 'Food Detail',
        visualPrompt: 'Move smoothly across the real dish details. Highlight sauce coating, tender pieces, herbs, vegetables, and freshly cooked texture with natural restaurant lighting.',
        cameraMotion: 'slow detail sweep over the dish, subtle steam, warm restaurant light',
        textOverlay: 'Rich color, aroma, and texture',
        voiceover: 'Every detail should feel freshly cooked and ready to eat.',
      },
      {
        title: 'Save or Visit',
        visualPrompt: 'End on the full dish being served or placed on the table. Keep the dining context believable with one clear reason to visit, save, or order.',
        cameraMotion: 'gentle pullback from close-up to full dish, clean final hold',
        textOverlay: 'Ready to enjoy',
        voiceover: 'Save this for your next meal.',
      },
    ],
  },
  {
    id: 'event-group-buying-combo',
    name: 'Group-buying Combo / Set Meal',
    description: 'Best for set meals, bundle value, dine-in packages, weekday deals, or social/group-buying offer assets.',
    creatorType: 'event_offer',
    vertical: 'food_beverage',
    bestFor: ['group-buying package', 'combo meal', 'set menu', 'weekday deal', 'bundle value'],
    structure: 'Bundle reveal -> Value stack -> Claim cue',
    shotDrafts: [
      {
        title: 'Bundle Reveal',
        visualPrompt: 'Open with the selected combo or set meal visuals. Show the included items clearly, but keep price, discount, quantity, and validity editable unless they are explicitly provided.',
        cameraMotion: 'tabletop bundle reveal, clean push-in, readable pacing',
        textOverlay: 'Set meal made easy',
        voiceover: 'A simple set meal option when you want everything decided.',
      },
      {
        title: 'Value Stack',
        visualPrompt: 'Show each included dish, drink, side, service detail, or dining moment using only the selected assets. Make the value understandable without unsupported claims.',
        cameraMotion: 'item-by-item sweep, subtle parallax, warm dining light',
        textOverlay: 'What you get, shown clearly',
        voiceover: 'Show what is included so customers can choose faster.',
      },
      {
        title: 'Claim Cue',
        visualPrompt: 'Close with a calm visit, order, message, or ask-before-you-go cue. Do not invent booking links, promo codes, deadlines, or group-buying platform names.',
        cameraMotion: 'clean offer end frame, gentle zoom, no visual clutter',
        textOverlay: 'Ask or order today',
        voiceover: 'Check the details before you visit or order.',
      },
    ],
  },
  {
    id: 'event-festival-offer',
    name: 'Festival / Holiday Offer',
    description: 'Best for holiday menus, seasonal discounts, festive bundles, opening offers, and limited-time store activities.',
    creatorType: 'event_offer',
    vertical: 'food_beverage',
    bestFor: ['festival offer', 'holiday promotion', 'seasonal menu', 'opening event', 'limited-time activity'],
    structure: 'Occasion -> Offer proof -> Deadline/CTA',
    shotDrafts: [
      {
        title: 'Occasion Hook',
        visualPrompt: 'Open with the selected product, storefront, table, or festive detail. Create a warm holiday or seasonal feeling without adding fake decorations, fake crowds, or unsupported event claims.',
        cameraMotion: 'warm opening push-in, festive but realistic motion accents',
        textOverlay: 'A reason to visit this season',
        voiceover: 'A timely reason to stop by this season.',
      },
      {
        title: 'Offer Proof',
        visualPrompt: 'Show the offer, menu, gift, bundle, or dining detail using real selected assets. Keep any price, discount, date, or redemption rule reviewable and editable.',
        cameraMotion: 'smooth detail sweep across offer visuals, readable text pacing',
        textOverlay: 'Offer details stay clear',
        voiceover: 'Keep the offer simple, clear, and easy to check.',
      },
      {
        title: 'Deadline Cue',
        visualPrompt: 'End with a clear visit, book, order, message, or save cue. Only mention timing if the user supplied a real deadline.',
        cameraMotion: 'clean final hold, gentle zoom, readable CTA space',
        textOverlay: 'Book, visit, or message today',
        voiceover: 'Message or visit today if it fits your plan.',
      },
    ],
  },
  {
    id: 'menu-set-recommendation',
    name: 'Menu Recommendation / Set Pick',
    description: 'Best for today recommendations, lunch/dinner sets, chef picks, and menu item education.',
    creatorType: 'menu_recommendation',
    vertical: 'food_beverage',
    bestFor: ['today pick', 'lunch set', 'dinner set', 'chef recommendation', 'menu highlight'],
    structure: 'Menu reveal -> Hero detail -> Order cue',
    shotDrafts: [
      {
        title: 'Menu Reveal',
        visualPrompt: 'Start with the selected menu item or set meal. Make the dish easy to understand at a glance without inventing price, portion size, or availability.',
        cameraMotion: 'quick menu reveal, natural table framing',
        textOverlay: 'Today recommendation',
        voiceover: 'Here is a practical pick for today.',
      },
      {
        title: 'Hero Detail',
        visualPrompt: 'Show the strongest food detail: texture, freshness, sauce, cooking style, or included sides from the selected assets. Keep the presentation realistic.',
        cameraMotion: 'close-up detail sweep, warm food motion',
        textOverlay: 'Fresh details',
        voiceover: 'The details make the choice easier.',
      },
      {
        title: 'Order Cue',
        visualPrompt: 'Close with a simple ask, order, visit, or save cue. Do not add delivery links or platform names unless provided.',
        cameraMotion: 'clean final frame with gentle zoom',
        textOverlay: 'Ask today',
        voiceover: 'Ask about it when you order.',
      },
    ],
  },
  {
    id: 'local-discovery-save',
    name: 'Local Discovery / Nearby Save',
    description: 'Best for nearby lunch, weekend plans, storefront discovery, and location-aware merchant videos.',
    creatorType: 'local_discovery',
    vertical: 'food_beverage',
    bestFor: ['near-me search', 'neighborhood discovery', 'lunch nearby', 'weekend plan', 'storefront'],
    structure: 'Nearby cue -> Route clue -> Store detail -> Save',
    shotDrafts: [
      {
        title: 'Nearby Cue',
        visualPrompt: 'Start with a real storefront, table, counter, or local context shot, then transition into product or service details. Keep the location cue useful and believable.',
        cameraMotion: 'quick exterior or table reveal, match cut to detail',
        textOverlay: 'Near you',
        voiceover: 'A local option worth saving for later.',
      },
      {
        title: 'Reason to Choose',
        visualPrompt: 'Show the concrete product, dish, service, or atmosphere detail that gives viewers a practical reason to visit or order.',
        cameraMotion: 'warm close-up push-in, smooth detail sweep',
        textOverlay: 'A practical local pick',
        voiceover: 'The details make the choice easier.',
      },
      {
        title: 'Save Cue',
        visualPrompt: 'Close with a clean location-aware save, visit, order, or message prompt. Do not invent address, price, promotion, or opening hours.',
        cameraMotion: 'clean final frame with subtle zoom',
        textOverlay: 'Save this place',
        voiceover: 'Save it for when you are nearby.',
      },
    ],
  },
  {
    id: 'review-social-proof',
    name: 'Review / Social Proof',
    description: 'Best for turning verified reviews, customer comments, or trusted merchant proof into short social proof videos.',
    creatorType: 'review_to_video',
    vertical: 'food_beverage',
    bestFor: ['verified review', 'testimonial content', 'trust building', 'service proof'],
    structure: 'Proof signal -> Visual match -> Low-pressure action',
    shotDrafts: [
      {
        title: 'Proof Signal',
        visualPrompt: 'Open with a tasteful proof signal based only on provided review or merchant facts. Do not invent review text, ratings, awards, or customer claims.',
        cameraMotion: 'slow push-in with clean proof framing',
        textOverlay: 'Customers noticed this',
        voiceover: 'A customer noticed the detail that matters.',
      },
      {
        title: 'Proof Match',
        visualPrompt: 'Match the proof signal to real product, store, team-safe, or service visuals from the selected assets.',
        cameraMotion: 'detail sweep across proof visuals',
        textOverlay: 'Real words, real details',
        voiceover: 'Show the proof behind the words.',
      },
      {
        title: 'Low-pressure Action',
        visualPrompt: 'Close with a calm save, visit, order, book, or message prompt. Avoid hype and unsupported claims.',
        cameraMotion: 'clean final hold',
        textOverlay: 'See it yourself',
        voiceover: 'See it for yourself next time.',
      },
    ],
  },
]

export function listLocalVideoScriptPresets(creatorType?: string): VideoScriptPreset[] {
  if (!creatorType) return localVideoScriptPresets
  return localVideoScriptPresets.filter((preset) => preset.creatorType === creatorType)
}

export function mergeVideoScriptPresets(remotePresets: unknown[], creatorType?: string): VideoScriptPreset[] {
  const remote = remotePresets
    .filter((preset): preset is VideoScriptPreset => Boolean(preset && typeof preset === 'object' && typeof (preset as any).id === 'string'))
    .filter((preset) => !creatorType || preset.creatorType === creatorType)
  const byId = new Map<string, VideoScriptPreset>()
  for (const preset of [...remote, ...listLocalVideoScriptPresets(creatorType)]) {
    if (!byId.has(preset.id)) byId.set(preset.id, preset)
  }
  return Array.from(byId.values())
}
