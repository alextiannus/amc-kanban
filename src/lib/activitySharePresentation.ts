import { activityText, type ActivityPage } from './activityPage'

export function activitySharePresentation(name: string, page?: ActivityPage | null, locale: 'zh' | 'en' = 'zh') {
  const brand = name.trim() || (locale === 'zh' ? '这家小店' : 'A little discovery')
  const invitation = activityText(page, 'followTitle', locale).trim() || (locale === 'zh' ? '很高兴遇见你' : 'Lovely to see you')
  const description = [activityText(page, 'shareNote', locale), activityText(page, 'followNote', locale)].map(value => value.trim()).filter(Boolean).join(' ').slice(0, 180)
  return { title: `${brand}${locale === 'zh' ? '｜' : ' — '}${invitation}`.slice(0, 100), description }
}
