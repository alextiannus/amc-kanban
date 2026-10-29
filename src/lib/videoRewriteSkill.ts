import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'

let cached:Promise<{text:string;id:string;resource:string;version:string}>|undefined
/** Generated from the canonical AMC Skills package, shared with amc-creative. */
export function readVideoRewriteSkill(){
 return cached ||= readFile(path.join(process.cwd(),'skills/amc-creative/references/video-rewrite.md'),'utf8').then(text=>{
  if(!text.trim())throw Error('video_rewrite_skill_unavailable')
  return {text,id:'amc-creative/SKILL.md',resource:'references/video-rewrite.md',version:'sha256:'+createHash('sha256').update(text).digest('hex')}
 }).catch(error=>{cached=undefined;throw error})
}
