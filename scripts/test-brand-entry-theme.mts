import assert from 'node:assert/strict'
import {brandEntryTheme,configuredBrandColor,safeBrandColor} from '../src/lib/brandEntryTheme.ts'
assert.equal(safeBrandColor('#aBc'),'#aabbcc')
assert.equal(safeBrandColor('red;display:none'),null)
assert.equal(configuredBrandColor({presentationTheme:{primary:'#047857'}}),'#047857')
assert.equal(configuredBrandColor({presentationTheme:{primary:'url(https://bad)'}}),null)
assert.equal(brandEntryTheme(undefined).primary,'#334155')
const luminance=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)
for(const color of ['#ffffff','#ffff00','#000000','#9e3043','#047857','#2563eb','#b45309']){
 const theme=brandEntryTheme(color)
 assert.equal(theme.primary,color)
 const ratio=(luminance(theme.tint)+.05)/(luminance(theme.ink)+.05)
 assert.ok(ratio>=4.5,`${color}: text contrast ${ratio}`)
}
assert.notEqual(brandEntryTheme('#047857').background,brandEntryTheme('#2563eb').background)
console.log('Brand palette selection, validation, dynamic tints and readable light/dark theme contrast passed.')
