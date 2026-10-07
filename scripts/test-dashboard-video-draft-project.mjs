import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const route = await readFile('src/app/api/dashboard/assets/route.ts', 'utf8')
const library = await readFile('src/lib/videoLibrary.ts', 'utf8')

assert.match(library, /videoProjectId:metadata\.basicVideoProjectId\|\|null/, 'saved video assets retain the AMC Content project id')
assert.match(route, /videoProjectId: asset\.videoProjectId/, 'Asset Library returns the AMC Content project id to MM')
assert.match(route, /canSessionAccessBrandProject/, 'the project id remains behind the existing brand access check')

console.log('PASS: Asset Library returns the authorized saved video project reference')
