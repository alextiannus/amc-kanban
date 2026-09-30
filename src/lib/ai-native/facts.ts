// Application facts only: integration credentials and unrelated drafts are never projected.
export async function readBrandFacts(db:any,brandId:string){
  const facts=await db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,location:true,timezone:true,knowledge:{select:{brandTone:true,negPrompts:true,audienceAssumptions:true,productAssumptions:true,menuItems:true,businessHours:true,brandVoice:true,market:true,brandImage:true,promotionFocus:true}}}})
  if(!facts)return null
  return {...facts,knowledge:facts.knowledge||{brandTone:null,negPrompts:[],audienceAssumptions:null,productAssumptions:null,menuItems:null,businessHours:null,brandVoice:null,market:null,brandImage:null,promotionFocus:null}}
}
