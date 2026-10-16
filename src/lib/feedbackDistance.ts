/** Exact Unicode-codepoint Levenshtein distance, or unknown when over budget. */
export function boundedEditDistance(a:string,b:string,maxLength=512,maxCells=4_000_000):{distance:number;cells:number}|null {
  // Bound allocation before converting UTF-16 to codepoints.
  if(a.length>maxLength*2||b.length>maxLength*2)return null
  const left=Array.from(a),right=Array.from(b)
  if(left.length>maxLength||right.length>maxLength)return null
  let start=0,endA=left.length,endB=right.length
  while(start<endA&&start<endB&&left[start]===right[start])start++
  while(endA>start&&endB>start&&left[endA-1]===right[endB-1]){endA--;endB--}
  const width=endA-start,height=endB-start,cells=width*height
  if(cells>maxCells)return null
  if(!width||!height)return {distance:Math.max(width,height),cells:0}
  let previous=Array.from({length:width+1},(_,i)=>i)
  for(let i=1;i<=height;i++){
    const next=[i]
    for(let j=1;j<=width;j++)next[j]=Math.min(previous[j]+1,next[j-1]+1,previous[j-1]+(left[start+j-1]===right[start+i-1]?0:1))
    previous=next
  }
  return {distance:previous[width],cells}
}
