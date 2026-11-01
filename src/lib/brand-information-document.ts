/** Plain document projection: metadata is kept outside the visible/model body. */
export function brandInformationText(info:any):string{
 if(typeof info?.content==='string')return info.content
 const lines=[['品牌',info?.name],['品牌介绍',info?.description],['行业',info?.industry],['市场',info?.market||info?.location],['区域',info?.district],['地址',info?.address],['电话',info?.phone],['网站',info?.website],['营业时间',info?.businessHours]].filter(([,v])=>v).map(([k,v])=>`**${k}：** ${v}`)
 if(info?.restrictions?.length)lines.push(`**表达要求：** ${info.restrictions.join('；')}`)
 if(info?.merchantInformation?.content)lines.push(info.merchantInformation.content)
 if(info?.researchInformation?.content)lines.push(`**调研观察（待核实）：**\n\n${info.researchInformation.content}`)
 return lines.join('\n\n')
}
