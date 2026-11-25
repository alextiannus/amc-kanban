async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const errors = []
  const writes = []
  const targetName = '锅包肉 (Sweet and Sour Crispy Pork) 长目录名称测试'
  const targetPath = `菜品与饮品 / 招牌菜实拍 / ${targetName}`
  let releaseRetry
  const retryGate = new Promise(resolve => { releaseRetry = resolve })
  page.on('pageerror', error => errors.push(error.message))

  await page.route('**/api/brands/fixture/folders', async route => {
    const response = await route.fetch()
    const data = await response.json()
    const dish = data.folders.find(folder => folder.id === 'dish')
    data.folders.push({ ...dish, id: 'pork', name: targetName, path: targetPath, parentId: dish.id, depth: 3, subtreeAssetCount: 0 })
    for (let number = 0; number < 24; number++) {
      const name = `备用目录 ${number}`
      data.folders.push({ ...dish, id: `extra-${number}`, name, path: name, parentId: null, depth: 1, subtreeAssetCount: 0 })
    }
    await route.fulfill({ response, json: data })
  })

  await page.route('**/api/brands/*/assets', async route => {
    const request = route.request()
    if (request.method() !== 'PATCH') return route.continue()
    writes.push(request.postDataJSON())
    if (writes.length === 1) {
      return route.fulfill({ status: 409, json: { error: '测试保存失败，请重试' } })
    }
    if (writes.length === 2) await retryGate
    await route.fulfill({ json: { ok: true, updatedCount: 1 } })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:3115/?switchBrand')
  const navigation = page.getByRole('dialog', { name: '选择素材目录' })
  await page.getByRole('button', { name: '素材目录', exact: true }).click()
  await navigation.getByRole('textbox', { name: '搜索目录' }).fill('sweet and sour')
  await navigation.getByText(targetName, { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await navigation.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '素材目录', exact: true }).click()
  await navigation.getByText(targetName, { exact: true }).waitFor()
  await navigation.getByRole('button', { name: '原始素材', exact: true }).click()
  await navigation.waitFor({ state: 'hidden' })

  const asset = page.locator('[data-asset-id="asset-0"]')
  const selected = asset.getByTitle('点击取消选择', { exact: true })
  await asset.getByTitle('点击选择', { exact: true }).click()
  const trigger = page.getByRole('button', { name: '转移文件夹', exact: true })
  const picker = page.getByRole('dialog', { name: '选择文件夹', exact: true })
  const search = picker.getByRole('textbox', { name: '搜索目录' })
  const move = picker.getByRole('button', { name: '移动', exact: true })

  await trigger.focus()
  await trigger.press('Enter')
  check(await move.isDisabled(), 'A destination must be chosen before moving')
  await picker.getByRole('heading', { name: '原始素材', exact: true }).waitFor()
  await picker.getByRole('heading', { name: 'AI制作成果', exact: true }).waitFor()
  await picker.getByRole('heading', { name: '人工加工', exact: true }).waitFor()
  await picker.getByRole('heading', { name: '待归类', exact: true }).waitFor()
  check(await picker.getByText(targetName, { exact: true }).count() === 0, 'Nested target should start collapsed')
  await picker.getByRole('button', { name: '展开 菜品与饮品', exact: true }).click()
  await picker.getByRole('button', { name: '展开 招牌菜实拍', exact: true }).click()
  await picker.getByText(targetName, { exact: true }).click()
  await picker.getByText(`原始素材 / ${targetPath}`, { exact: true }).waitFor()
  check(writes.length === 0, 'Selecting a folder must not send a write')
  await page.keyboard.press('Escape')
  await picker.waitFor({ state: 'hidden' })
  await selected.waitFor()
  check(await trigger.evaluate(button => button === document.activeElement), 'Escape must restore focus to the trigger')
  await trigger.click()
  await page.mouse.click(12, 160)
  await picker.waitFor({ state: 'hidden' })
  await selected.waitFor()
  check(writes.length === 0, 'Dismissing the picker must not send a write')

  await trigger.click()
  await search.fill('sweet and sour')
  const parent = picker.getByText('菜品与饮品', { exact: true })
  const child = picker.getByText('招牌菜实拍', { exact: true })
  const grandchild = picker.getByText(targetName, { exact: true })
  check((await parent.boundingBox()).x < (await child.boundingBox()).x &&
    (await child.boundingBox()).x < (await grandchild.boundingBox()).x, 'Search results must retain tree indentation')
  await grandchild.click()
  await page.screenshot({ path: 'output/playwright/material-folder-move/desktop.png' })
  await move.click()
  await picker.getByRole('alert').getByText('测试保存失败，请重试').waitFor()
  await picker.getByText(`原始素材 / ${targetPath}`, { exact: true }).waitFor()
  await selected.waitFor()
  check(writes.length === 1 && writes[0].folderId === 'pork' && writes[0].assetIds.join() === 'asset-0', 'Move must use the exact folder ID and selected asset IDs')
  await move.click()
  const saving = picker.getByRole('button', { name: '移动中…', exact: true })
  await saving.waitFor()
  check(await saving.isDisabled() && await search.isDisabled(), 'The destination and submit controls must stay disabled while saving')
  await page.keyboard.press('Escape')
  check(await picker.isVisible(), 'Escape must not close an in-flight move')
  releaseRetry()
  await picker.waitFor({ state: 'hidden' })
  check(writes.length === 2 && writes[1].folderId === 'pork', 'Retry must use the retained target')

  await trigger.click()
  await search.fill('人工剪辑')
  await picker.getByText('人工剪辑', { exact: true }).click()
  await move.click()
  const confirmation = page.getByRole('dialog', { name: '确认素材类别调整' })
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await picker.getByText('人工加工 / 人工剪辑', { exact: true }).waitFor()
  await selected.waitFor()
  check(writes.length === 2, 'Cancelling a class change must not submit')
  await move.click()
  await confirmation.getByRole('button', { name: '确认调整', exact: true }).click()
  await picker.waitFor({ state: 'hidden' })
  check(writes.length === 3 && writes[2].folderId === 'manual' && writes[2].confirmMaterialClassChange === true, 'Class change must be explicitly confirmed')

  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  const panelBounds = await picker.boundingBox()
  check(panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= 390, 'Picker overflows the mobile viewport')
  const defaultLocation = picker.getByRole('button', { name: '按原分类归入默认位置' })
  await defaultLocation.click()
  await move.click()
  await picker.waitFor({ state: 'hidden' })
  check(writes.length === 4 && writes[3].folderId === null && !writes[3].confirmMaterialClassChange, 'Default destination must retain the original class')
  await trigger.click()
  await search.fill('不存在的目录')
  await picker.getByRole('status').getByText('没有匹配的目录').waitFor()
  await search.fill('sweet and sour')
  await picker.getByText(targetName, { exact: true }).click()
  await picker.getByText(`原始素材 / ${targetPath}`, { exact: true }).waitFor()
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout has horizontal page overflow')
  await page.screenshot({ path: 'output/playwright/material-folder-move/mobile.png' })

  const switched = page.waitForRequest(request => request.url().includes('brandId=fixture-other'))
  await page.getByRole('button', { name: '切换测试品牌' }).press('Enter')
  await switched
  await picker.waitFor({ state: 'hidden' })
  await trigger.waitFor({ state: 'hidden' })
  check(writes.length === 4, 'Switching brands must discard the pending choice without a write')
  check(!errors.length, errors.join('\n'))
  return { pass: true, coverage: 'desktop and mobile directory tree, mixed-language search, safe dismissal, exact target IDs, failed move retry, category confirmation, default target and brand switch' }
}
