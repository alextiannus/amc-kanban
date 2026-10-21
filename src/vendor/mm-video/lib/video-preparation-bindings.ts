import {materialPassages} from '@/vendor/mm-video/lib/video-material-bindings'

/** Translate legacy paragraph indices to grouped timed shots without moving references to another shot. */
export function migrateTimedMaterialBindings(script:string,bindings:Record<string,string[]>):Record<string,string[]> {
 const before=materialPassages(script,false),after=materialPassages(script)
 if(before.length===after.length)return bindings
 const migrated:Record<string,string[]>={}
 let index=0
 for(const [position,passage] of after.entries()){
  let joined='',manual=false
  const assets:string[]=[]
  while(index<before.length){
   joined+=(joined?'\n':'')+before[index]
   const id=`passage-${++index}`
   if(Object.hasOwn(bindings,id)){manual=true;assets.push(...bindings[id])}
   if(joined===passage)break
   if(!passage.startsWith(joined+'\n'))return {}
  }
  const unique=[...new Set(assets)]
  // Keep overflow assets in the selected-material tray instead of silently truncating them.
  if(manual&&unique.length<=2)migrated[`passage-${position+1}`]=unique
 }
 return migrated
}

/** Move a scene's references as one group; occupied scenes swap instead of losing assets. */
export function moveSceneMaterials(bindings:Record<string,string[]>,source:string|null,target:string,assetId?:string):Record<string,string[]> {
 if(source===target)return bindings
 const moving=source?bindings[source]||[]:assetId?[assetId]:[]
 if(!moving.length)return bindings
 const next={...bindings,[target]:[...moving]}
 if(source)next[source]=[...(bindings[target]||[])]
 return next
}
