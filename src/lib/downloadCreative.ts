// Export only the material requirements currently shown to the reviewer.
export function downloadMaterialRequirements(input: {
  title?: string
  materialRequirements?: string[]
  sourceId?: string
  brandId?: string
}) {
  const requirements = (input.materialRequirements || []).map(item => item.trim()).filter(Boolean)
  const text = [
    `# ${input.title || '素材需求 / Material requirements'}`,
    input.brandId ? `品牌 / Brand: ${input.brandId}` : '',
    input.sourceId ? `原创意 / Source: ${input.sourceId}` : '',
    '## 素材清单与拍摄要求 / Materials and shot requirements',
    ...(requirements.length
      ? requirements.map((item, index) => `${index + 1}. ${item}`)
      : ['尚未填写素材清单，请在创意详情中补充后再拍摄。 / Add material requirements in the idea details before shooting.']),
    '## 通用拍摄辅助建议 / General shooting tips',
    '以下为通用建议，以上清单中的具体规格优先。 / Follow the specific requirements above when they differ from these general tips.',
    '- 按清单逐项拍摄，保留完整动作，镜头前后留出剪辑余量。 / Capture each requested shot with the complete action and extra footage before and after for editing.',
    '- 保持画面稳定、主体清晰、光线充足；按清单要求的画幅和时长拍摄。 / Keep the camera steady, the subject in focus and well lit; follow the requested aspect ratio and duration.',
    '- 需要现场声音时，在安静环境录制清晰原声。 / When live sound is needed, record clear audio in a quiet environment.',
    '- 保留未经压缩的原始图片或视频；按清单序号命名，方便上传或从素材库选择。 / Keep original photos or videos without additional compression and name files by checklist number for upload or library selection.',
  ].filter(Boolean).join('\n\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${(input.title || 'materials').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80)}-素材需求.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
