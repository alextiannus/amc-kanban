import assert from 'assert'

const BASE = 'http://127.0.0.1:3000'

async function run() {
  console.log('Starting Compliance Validation API integration tests...')

  // 1. Log in to get session cookie
  console.log('Logging in as admin@example.com...')
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password123' })
  })

  assert.strictEqual(loginRes.status, 200, 'Login should succeed')
  const setCookie = loginRes.headers.get('set-cookie')
  assert.ok(setCookie, 'Should receive session cookie')
  console.log('✅ Logged in successfully!')

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': setCookie
  }

  // 2. Fetch brands list to find a brand ID
  console.log('Fetching brands list...')
  const brandsRes = await fetch(`${BASE}/api/brands`, { headers })
  assert.strictEqual(brandsRes.status, 200, 'Should load brands')
  const brands = await brandsRes.json()
  assert.ok(Array.isArray(brands) && brands.length > 0, 'Should return at least one brand')
  
  const brand = brands[0]
  const brandId = brand.id
  console.log(`✅ Using brand: ${brand.name} (ID: ${brandId})`)

  // 3. Fetch current profile markdown
  console.log('Fetching current brand profile markdown...')
  const profileRes = await fetch(`${BASE}/api/brands/${brandId}/profile`, { headers })
  assert.strictEqual(profileRes.status, 200, 'Should load brand profile')
  const { markdown: originalMarkdown } = await profileRes.json()
  console.log('✅ Loaded original brand profile markdown!')

  // 4. Update brand profile with compliance rules in the MANUAL section
  const testMarkdown = `${originalMarkdown.split('<!-- AMC:BRAND_PROFILE:MANUAL:START -->')[0]}<!-- AMC:BRAND_PROFILE:MANUAL:START -->
## 10. 人工补充（此区块不会被系统刷新覆盖）

### 10.6 扩展字段
\`\`\`json
{
  "ext": {
    "compliance": {
      "prohibitedWords": ["秒杀", "最便宜", "全网最低", "No.1"],
      "requiredKeywords": ["手工", "传统配方"],
      "tone": "warm"
    }
  }
}
\`\`\`
<!-- AMC:BRAND_PROFILE:MANUAL:END -->
`

  console.log('Injecting compliance rules into brand profile...')
  const updateProfileRes = await fetch(`${BASE}/api/brands/${brandId}/profile`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ markdown: testMarkdown })
  })
  assert.strictEqual(updateProfileRes.status, 200, 'Should update brand profile')
  console.log('✅ Compliance rules successfully injected!')

  let compliantDraftId = null
  let createdAccountId = null

  try {
    // 5. Fetch or create a social account ID to associate with the draft
    const accountsRes = await fetch(`${BASE}/api/brands/${brandId}/accounts`, { headers })
    assert.strictEqual(accountsRes.status, 200)
    const { accounts } = await accountsRes.json()
    
    let accountId = null
    if (accounts.length > 0) {
      accountId = accounts[0].id
      console.log(`Using existing social account: ${accountId}`)
    } else {
      console.log('No social accounts found, creating a mock one...')
      const createAccountRes = await fetch(`${BASE}/api/brands/${brandId}/accounts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          platformId: 'instagram',
          handle: 'test_compliance_agent',
          displayName: 'Test Compliance Agent'
        })
      })
      assert.strictEqual(createAccountRes.status, 201)
      const mockAccount = await createAccountRes.json()
      accountId = mockAccount.id
      createdAccountId = mockAccount.id
      console.log(`✅ Created mock social account: ${accountId}`)
    }

    // 6. Test Case A: Create a compliant draft (should succeed)
    console.log('Testing Draft Creation: Compliant Caption...')
    const compliantCaption = '我们采用传统配方，纯手工制作好吃的红烧牛肉面。欢迎光临！'

    const createCompliantRes = await fetch(`${BASE}/api/brands/${brandId}/drafts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        caption: compliantCaption,
        accountId,
        status: 'draft'
      })
    })

    const compliantData = await createCompliantRes.json()
    assert.strictEqual(createCompliantRes.status, 201, `Expected 201 Created, got ${createCompliantRes.status}: ${JSON.stringify(compliantData)}`)
    compliantDraftId = compliantData.draft.id
    console.log(`✅ Compliant draft created successfully (ID: ${compliantDraftId})`)

    // 7. Test Case B: Create a non-compliant draft containing "秒杀" (should fail with 400)
    console.log('Testing Draft Creation: Non-Compliant Caption (contains "秒杀")...')
    const nonCompliantCaption = '今日限时秒杀，招牌红烧肉面速来抢购！'
    
    const createNonCompliantRes = await fetch(`${BASE}/api/brands/${brandId}/drafts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        caption: nonCompliantCaption,
        accountId,
        status: 'draft'
      })
    })

    const nonCompliantData = await createNonCompliantRes.json()
    assert.strictEqual(createNonCompliantRes.status, 400, `Expected 400 Bad Request, got ${createNonCompliantRes.status}`)
    assert.ok(
      nonCompliantData.error.includes('内容包含品牌违禁词: 秒杀'),
      `Expected error message to mention '秒杀', got: ${nonCompliantData.error}`
    )
    console.log('✅ Non-compliant draft was correctly rejected by compliance check!')

    // 8. Test Case C: Update draft with non-compliant caption (should fail with 400)
    console.log('Testing Draft Update: Updating compliant draft to non-compliant caption...')
    const updateRes = await fetch(`${BASE}/api/brands/${brandId}/drafts/${compliantDraftId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        caption: '这个全网最低，赶紧来买！'
      })
    })

    const updateData = await updateRes.json()
    assert.strictEqual(updateRes.status, 400, `Expected 400 Bad Request, got ${updateRes.status}`)
    assert.ok(
      updateData.error.includes('内容包含品牌违禁词: 全网最低'),
      `Expected error message to mention '全网最低', got: ${updateData.error}`
    )
    console.log('✅ Non-compliant update request was correctly rejected by compliance check!')

    console.log('🎉 All compliance validation API integration tests passed successfully!')

  } finally {
    // 9. Clean up created draft
    if (compliantDraftId) {
      console.log(`Cleaning up compliant draft ${compliantDraftId}...`)
      await fetch(`${BASE}/api/brands/${brandId}/drafts/${compliantDraftId}`, {
        method: 'DELETE',
        headers
      })
    }

    // 10. Clean up mock social account if created
    if (createdAccountId) {
      console.log(`Cleaning up mock social account ${createdAccountId}...`)
      const deleteAccountRes = await fetch(`${BASE}/api/brands/${brandId}/accounts/${createdAccountId}`, {
        method: 'DELETE',
        headers
      })
      assert.strictEqual(deleteAccountRes.status, 200)
      console.log('✅ Mock social account cleaned up!')
    }

    // 11. Restore original brand profile
    console.log('Restoring original brand profile markdown...')
    const restoreProfileRes = await fetch(`${BASE}/api/brands/${brandId}/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ markdown: originalMarkdown })
    })
    assert.strictEqual(restoreProfileRes.status, 200, 'Should restore brand profile')
    console.log('✅ Brand profile restored successfully!')
  }
}

run().catch((error) => {
  console.error('Test run failed:', error)
  process.exit(1)
})
