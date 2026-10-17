import assert from 'node:assert/strict'
import { getMenuGroups, type AppRole } from '../src/lib/permissions.ts'
import { MENU_PERMISSIONS } from '../src/lib/role-permissions/contract.ts'
for (const role of ['ADMIN','AMC_PRINCIPAL','BRAND_OWNER'] as AppRole[]) {
 const groups=getMenuGroups([role]);const services=groups.find(group=>group.groupLabel==='增值服务')
 assert.equal(services?.items.find(item=>item.id==='game')?.badge,'free')
 assert.equal(groups.flatMap(group=>group.items).filter(item=>item.id==='game').length,1)
}
assert.equal(getMenuGroups(['BRAND_OWNER'],[]).flatMap(group=>group.items).some(item=>item.id==='game'),false)
assert.equal(getMenuGroups(['BRAND_OWNER'],[MENU_PERMISSIONS.game]).find(group=>group.groupLabel==='增值服务')?.items[0]?.id,'game')
for (const role of ['BD','RESEARCHER'] as AppRole[]) assert.equal(getMenuGroups([role]).flatMap(group=>group.items).some(item=>item.id==='game'),false)
console.log('PASS free activity entry under value-added services, no duplicate menus and unchanged role/grant visibility.')
