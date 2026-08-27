import type { BrandIdentityFieldKey, BrandIdentitySnapshot } from './brandIdentity'

export type BrandPlanEditorIdentityValues = {
  brandTone: string
  targetAudience: string
  sellingPointsText: string
  creativeIdentity: {
    brandVoice: string
    brandImage: string
    promotionFocus: string
  }
}

export function brandPlanEditorIdentityValues(snapshot: BrandIdentitySnapshot): BrandPlanEditorIdentityValues {
  const textValue = (field: BrandIdentityFieldKey) => {
    const value = snapshot.fields?.[field]?.value
    return typeof value === 'string' ? value : ''
  }
  const sellingPoints = snapshot.fields?.sellingPoints?.value

  return {
    brandTone: textValue('brandTone'),
    targetAudience: textValue('targetAudience'),
    sellingPointsText: Array.isArray(sellingPoints) ? sellingPoints.join('\n') : '',
    creativeIdentity: {
      brandVoice: textValue('brandVoice'),
      brandImage: textValue('brandImage'),
      promotionFocus: textValue('promotionFocus'),
    },
  }
}
