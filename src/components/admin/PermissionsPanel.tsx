'use client'

import React, { useState } from 'react'
import { 
  ShieldCheck, Bot, Store, Users, RefreshCw
} from 'lucide-react'
import { type UserRecord } from './UsersTab'
import { type BrandRecord } from './BrandsTab'

interface PermissionsPanelProps {
  users: UserRecord[]
  agents: UserRecord[]
  brands: BrandRecord[]
  onSavePermissions: (humanId: string, agentIds: string[]) => Promise<void>
  savingPerms: boolean
  onFetchUsers: () => Promise<void>
  onFetchBrands: () => Promise<void>
}

export default function PermissionsPanel({
  users,
  brands,
  onFetchUsers,
  onFetchBrands
}: PermissionsPanelProps) {
  const [savingBrandOwnerId, setSavingBrandOwnerId] = useState<string | null>(null)

  const humans = users.filter(u => u.type === 'HUMAN')
  const principals = humans.filter(u => u.businessRoles?.some(r => r.role === 'AMC_PRINCIPAL'))
  const brandOwners = humans.filter(u => u.businessRoles?.some(r => r.role === 'BRAND_OWNER'))

  const handleUpdateBrandOwner = async (brandId: string, ownerUserId: string) => {
    setSavingBrandOwnerId(brandId)
    try {
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId }),
      })
      if (res.ok) {
        await Promise.all([onFetchBrands(), onFetchUsers()])
      } else {
        alert('绑定品牌方业主失败')
      }
    } catch (e) {
      console.error(e)
      alert('网络连接错误')
    } finally {
      setSavingBrandOwnerId(null)
    }
  }

  const uniqueBrandsFromOwnerLinks = (links: Array<{ brand: { id: string; name: string; status: string } }> = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  // Functional permissions audit matrix data
  const matrixRows = [
    { group: '系统管理员组 (Admin)', viewBrand: '读写 / 所有', viewCalendar: '读写 / 所有', configActivity: '读写 / 所有', analytics: '查看 / 所有', aiAgents: '管理 / 所有', sysSettings: '是' },
    { group: '运营主理人组 (Principal)', viewBrand: '读写 / 授权品牌', viewCalendar: '读写 / 授权品牌', configActivity: '读写 / 授权品牌', analytics: '查看 / 授权品牌', aiAgents: '用户 Key 分身', sysSettings: '否' },
    { group: '品牌业主组 (Brand Owner)', viewBrand: '只读 / 自有品牌', viewCalendar: '只读 / 自有品牌', configActivity: '审批 / 自有品牌', analytics: '查看 / 自有品牌', aiAgents: '不可见', sysSettings: '否' },
    { group: '普通运营成员 (USER)', viewBrand: '只读 / 无', viewCalendar: '只读 / 无', configActivity: '否', analytics: '否', aiAgents: '不可见', sysSettings: '否' }
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 2-Column Split: Principal Agent Assignments & Brand Asset Assignment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Box 1: Principal Agent permissions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
            <Users size={16} className="text-blue-500" />
            <span>主理人 AI 分身 Key (Principal AI Keys)</span>
          </h3>
          {principals.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">暂无运营主理人。请先将用户添加至“平台运营主理人组”。</p>
          ) : (
            <div className="space-y-3">
              {principals.map(p => (
                <div key={p.id} className="p-4 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-955/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-800 dark:text-white">{p.nickname || p.email}</p>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{p.email}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-750 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-350 bg-white dark:bg-slate-900 shadow-sm">
                      <Bot size={11} className="text-indigo-500" />
                      <span>{(p.apiKeys || []).filter(key => !key.revokedAt).length} active AI</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-450 font-bold">
                    <span>AI 分身连接方式:</span>{' '}
                    {(p.apiKeys || []).filter(key => !key.revokedAt).length > 0 ? (
                      <span className="text-indigo-650 dark:text-indigo-400 font-bold">
                        使用账号管理中的用户 API Key 连接 AMC，并继承该用户权限。
                      </span>
                    ) : (
                      <span className="text-slate-400">暂无 AI Key。请到账号管理中生成 Key。</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Box 2: Owner Brand assets */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
            <Store size={16} className="text-blue-500" />
            <span>品牌资产所有权归属 (Owner & Brand Assets)</span>
          </h3>
          {brands.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">系统内暂无托管品牌记录。</p>
          ) : (
            <div className="space-y-3">
              {brands.map(brand => {
                const currentOwner = brand.owners[0]?.userId || ''
                const isSaving = savingBrandOwnerId === brand.id

                return (
                  <div key={brand.id} className="p-4 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-955/10 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-800 dark:text-white truncate">{brand.name}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{brand.location || '曼哈顿'}</p>
                    </div>

                    <div className="space-y-1 text-right flex-shrink-0">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">拥有权业主</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={currentOwner}
                          disabled={isSaving}
                          onChange={e => handleUpdateBrandOwner(brand.id, e.target.value)}
                          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">-- 未归属/无业主 --</option>
                          {brandOwners.map(owner => (
                            <option key={owner.id} value={owner.id}>{owner.nickname || owner.email}</option>
                          ))}
                        </select>
                        {isSaving && <RefreshCw size={11} className="animate-spin text-blue-500" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Box 3: Audit Permissions Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-black text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-500" />
          <span>系统功能菜单准入矩阵 (Sidebar Menu Permissions Matrix)</span>
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-905 text-slate-400 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">用户角色组</th>
                <th className="text-left px-4 py-3">品牌看板</th>
                <th className="text-left px-4 py-3">发布日历</th>
                <th className="text-left px-4 py-3">店内活动 (游戏)</th>
                <th className="text-left px-4 py-3">数据分析</th>
                <th className="text-left px-4 py-3">AI 分身/日志</th>
                <th className="text-left px-4 py-3">Admin 控制台</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
              {matrixRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors">
                  <td className="px-4 py-3 font-black text-slate-850 dark:text-white">{row.group}</td>
                  <td className="px-4 py-3 font-medium">{row.viewBrand}</td>
                  <td className="px-4 py-3 font-medium">{row.viewCalendar}</td>
                  <td className="px-4 py-3 font-medium">{row.configActivity}</td>
                  <td className="px-4 py-3 font-medium">{row.analytics}</td>
                  <td className="px-4 py-3 font-medium">{row.aiAgents}</td>
                  <td className="px-4 py-3 font-bold text-indigo-650 dark:text-indigo-400">{row.sysSettings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
