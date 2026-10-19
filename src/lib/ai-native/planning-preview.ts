/** Decode only a bounded JSON string prefix; unfinished escapes are withheld. */
function stringAt(text:string,start:number){
 let i=start+1,value=''
 for(;i<text.length;i++){
  const c=text[i]
  if(c==='"')return {value,end:i+1,complete:true}
  if(c==='\\'){
   if(i+1>=text.length)break
   const e=text[++i],esc:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}
   if(e==='u'){const hex=text.slice(i+1,i+5);if(!/^[a-f0-9]{4}$/i.test(hex))break;value+=String.fromCharCode(parseInt(hex,16));i+=4}
   else if(e in esc)value+=esc[e];else break
  }else{if(c<' ')break;value+=c}
 }
 return {value:value.replace(/[\uD800-\uDBFF]$/,''),end:i,complete:false}
}
/** Shallow field locator that skips nested JSON and string escapes without regex
 * matching property names inside generated content. No syntax repair is returned. */
function field(text:string,start:number,wanted:string):{at:number}|null{
 let i=start;const space=()=>{while(/\s/.test(text[i]||'x'))i++}
 space();if(text[i++]!=='{')return null
 while(i<text.length){
  space();if(text[i]!== '"')return null
  const key=stringAt(text,i);if(!key.complete)return null;i=key.end;space();if(text[i++]!==':')return null;space()
  if(key.value===wanted)return {at:i}
  if(text[i]==='"'){const value=stringAt(text,i);if(!value.complete)return null;i=value.end}
  else if(text[i]==='{'||text[i]==='['){
   const stack=[text[i++]]
   while(i<text.length&&stack.length){const c=text[i];if(c==='"'){const str=stringAt(text,i);if(!str.complete)return null;i=str.end;continue}if(c==='{'||c==='[')stack.push(c);else if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'['))return null}i++}
   if(stack.length)return null
  }else{while(i<text.length&&!/[,}]/.test(text[i]))i++}
  space();if(text[i++]!==',')return null
 }
 return null
}
export function planningPreview(args:string,path:string,brandId:string):string|null{
 if(typeof args!=='string'||args.length>2_000_000)return null
 const read=(start:number,key:string,partial=false)=>{const f=field(args,start,key);if(!f||args[f.at]!=='"')return null;const s=stringAt(args,f.at);return s.complete||partial?s.value:null}
 if(read(0,'path')!==path)return null
 const artifact=field(args,0,'content');if(!artifact||args[artifact.at]!=='{')return null
 if(read(artifact.at,'kind')!=='conversation'||read(artifact.at,'brandId')!==brandId)return null
 const content=read(artifact.at,'content',true)
 return content?.trim()?content.slice(0,8000):null
}
