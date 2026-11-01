/** Older records appended the confirmed nine-section document to an internal draft.
 * Select only a complete, ordered template; never guess or remove prose from other records.
 * Later merchant supplements remain part of the visible body. Stored history is unchanged.
 */
export function interviewDocumentBody(content:string):string{
 const names=['品牌','定位','经营目标','目标顾客','选择理由与阻碍','竞争与差异','产品与服务','表达要求','待补充']
 const headings=[...content.matchAll(/^#{1,6}[ \t]+([^\r\n]+)[ \t]*$/gm)]
 let start=-1
 for(let i=0;i<=headings.length-names.length;i++){
  if(names.every((name,j)=>headings[i+j][1].trim().replace(/[*：:]+$/g,'').trim()===name))start=headings[i].index!
 }
 return start>=0?content.slice(start).trim():content
}
