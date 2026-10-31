/** Deterministic screenplay compiler. Authored words are never rewritten by a model. */
import {materialPassages} from './video-material-bindings'
export type ScriptTurn={speaker:string;text:string;direction?:string}
export type ScriptScene={passageId:string;script:string;startSec?:number;endSec?:number;turns:ScriptTurn[];caption:string}
const speech=/^(?:口播(?:文本|内容)?|旁白|配音|speech|ucapan|pertuturan|spoken\s*text|voiceover(?:\s*text)?|narration|narasi|dialog|suara(?:\s+latar)?|sulih\s+suara)$/i
const metadata=/^(?:文字|待拍|kamera|bunyi|action|aksi|tindakan|needed|kebutuhan|keperluan|画面|动作|镜头|分镜|景别|运镜|机位|构图|灯光|主体|服装|道具|开场钩子|视频风格|视频结构|字幕|声音|音效|转场|叙事|连贯|标题|时长|地点|时间|场景|角色|人物|情绪|语气|素材|卖点|价格|地址|电话|备注|提示|音乐|背景音乐|旁白说明|visual|shot scale|camera movement|sound|transition|camera|caption|overlay|title|duration|scene|shot|setting|characters?|cast|emotion|music|notes?|teks|sarikata|gambar|visualisasi|adegan|babak|syot|narrative|continuity|subject|selling)/i
const silent=/^(?:[—–-]|无|无口播|无旁白|无字幕|静音|不需要字幕|关闭|none|silent|off|no subtitles?|tiada|tanpa\s+(?:suara|narasi))$/i
export function scriptSpeechSeconds(text:string,language:string){
 if(!text.trim())return 0
 if(['en','id','ms'].includes(language))return text.trim().split(/\s+/).length/2.2
 return (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[\p{Script=Han}]|./gu)||[]).reduce((n,p)=>n+(/^[A-Za-z0-9]/.test(p)?1.8:/[\p{Script=Han}]/u.test(p)?1:.15),0)/4
}
export function parseScreenplay(script:string):ScriptScene[]{
 const scenes=materialPassages(script).map((passage,i)=>{
  const range=passage.split('\n')[0].match(/(?:^|[ ·:：（(【\[])\s*(\d+(?:\.\d+)?)\s*[-–—~～至]\s*(\d+(?:\.\d+)?)\s*(?:秒|s\b|seconds?\b)/i)
  const scene:ScriptScene={passageId:`passage-${i+1}`,script:passage,turns:[],caption:'',...(range?{startSec:Number(range[1]),endSec:Number(range[2])}:{})}
  let reading:ScriptTurn|undefined;let structured=false;let caption=false
  for(const raw of passage.split(/\n|\s*[|｜]\s*(?=(?:\*\*)?[\p{L}\p{N} _·.（）()-]{1,32}[:：])/u)){
   const line=raw.trim().replace(/^[-*]\s+/,'').replace(/\*\*/g,'')
   if(!line){reading=undefined;caption=false;continue}
   const field=line.match(/^([^:：]{1,32})[:：]\s*(.*)$/)
   if(field){
    const label=field[1].trim(),value=field[2].trim(),named=label.match(/^(.*?)(?:[（(]([^）)]+)[）)])?$/)!
    const name=named[1].trim(),direction=named[2]
    reading=undefined;caption=false;structured=true
    if(/^(?:字幕|captions?|overlay(?:\s*text)?|on.screen\s*text)$/i.test(name)){if(!silent.test(value)){scene.caption+= (scene.caption?'\n':'')+value;caption=true}continue}
    if(speech.test(name)||(!metadata.test(name)&&/^[\p{L}\p{N} _·.-]{1,20}$/u.test(name))){
     if(value&&!silent.test(value)){reading={speaker:speech.test(name)?'旁白':name,text:value,...(direction?{direction}:{})};scene.turns.push(reading)}
     continue
    }
    continue
   }
   if(/^(?:#|\d+(?:\.\d+)?\s*[-–—]|(?:镜头|分镜|scene|shot)\s*\d)/i.test(line)){reading=undefined;caption=false;structured=true;continue}
   if(reading)reading.text+='\n'+line
   else if(caption)scene.caption+='\n'+line
  }
  if(!structured&&passage.trim())scene.turns=[{speaker:'旁白',text:passage.trim()}]
  return scene
 })
 return scenes
}
export function screenplaySpeakers(script:string){return [...new Set(parseScreenplay(script).flatMap(s=>s.turns.map(t=>t.speaker)))]}
/** Keep visual passages and dialogue turns distinct. Timing never cuts authored speech. */
export function planScreenplay(script:string,durationSec:number,language:string){
 const scenes=parseScreenplay(script)
 if(!scenes.length)throw new Error('EMPTY_SCREENPLAY')
 const minima=scenes.map(s=>Math.max(.75,s.turns.reduce((n,t)=>n+Math.max(.75,scriptSpeechSeconds(t.text,language)+.25),0)))
 const minimum=minima.reduce((a,b)=>a+b,0)
 if(minimum>durationSec+.01)throw Object.assign(new Error(`完整对白至少需要 ${Math.ceil(minimum)} 秒，请延长整片时长。`),{status:422,code:'source_voiceover_duration_insufficient'})
 let previousEnd=0
 const weights=scenes.map((scene,index)=>{
  if(scene.startSec!==undefined&&scene.endSec!==undefined){
   if(scene.startSec<previousEnd-.01||scene.endSec<scene.startSec)throw Object.assign(new Error('脚本时间码重叠，请调整时间码。'),{status:422,code:'SCRIPT_DURATION_MISMATCH'})
   const weight=Math.max(.75,scene.endSec-previousEnd);previousEnd=scene.endSec;return weight
  }
  return minima[index]
 })
 const totalWeight=weights.reduce((a,b)=>a+b,0)
 // Preserve source pacing when it fits. Otherwise extend short dialogue scenes from
 // the available total budget, rather than truncating or speeding up speech.
 const preserveTiming=Math.abs(totalWeight-durationSec)<.01&&weights.every((w,i)=>w>=minima[i])
 let cursor=0
 return scenes.flatMap((scene,index)=>{
  const available=preserveTiming?weights[index]:minima[index]+(durationSec-minimum)*weights[index]/totalWeight
  const end=index===scenes.length-1?durationSec:cursor+available
  const turns=scene.turns.length?scene.turns:[{speaker:'',text:''}]
  const units=turns.map(t=>Math.max(.75,scriptSpeechSeconds(t.text,language)+.25)),sum=units.reduce((a,b)=>a+b,0)
  return turns.map((turn,j)=>{
   const length=j===turns.length-1?end-cursor:available*units[j]/sum
   const result={...turn,passageId:scene.passageId,prompt:scene.script,caption:j===0?scene.caption:'',startSec:cursor,endSec:cursor+length,durationSec:length}
   cursor+=length;return result
  })
 })
}
