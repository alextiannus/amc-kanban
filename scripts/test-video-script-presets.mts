import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { localVideoScriptPresets, mergeVideoScriptPresets } from '../src/lib/videoScriptPresets.ts'

const page = await readFile(new URL('../src/app/dashboard/video/page.tsx', import.meta.url), 'utf8')

assert.ok(localVideoScriptPresets.length >= 6, 'local video preset catalog should provide multiple selectable templates')
assert.ok(localVideoScriptPresets.some((preset) => preset.id.includes('group-buying')), 'group-buying combo template must be available')
assert.ok(localVideoScriptPresets.some((preset) => preset.id.includes('festival')), 'festival offer template must be available')
assert.ok(localVideoScriptPresets.some((preset) => preset.creatorType === 'menu_recommendation'), 'menu recommendation template must be available')

const eventPresets = mergeVideoScriptPresets([], 'event_offer')
assert.ok(eventPresets.length >= 2, 'event_offer should still have selectable presets when remote catalog is empty')
assert.ok(eventPresets.some((preset) => preset.id === 'event-group-buying-combo'))
assert.ok(eventPresets.some((preset) => preset.id === 'event-festival-offer'))

assert.match(page, /resolveVideoLanguage/)
assert.match(page, /value=\{videoLanguageMode\}/)
assert.doesNotMatch(page, /language:\s*'zh',/, 'video creation requests must not hard-code Chinese language')
assert.doesNotMatch(page, /json\.presets\)\s*\?\s*json\.presets\.map\(localizeScriptPreset\)/, 'presets should not be unconditionally localized to Chinese')

console.log('SUCCESS: Video script presets cover offer/menu scenarios and preserve user-selected video language')
