// Application facts only: integration credentials and unrelated drafts are never projected.
export function readBrandFacts(db:any,brandId:string){
  return db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,knowledge:{select:{brandTone:true,negPrompts:true,audienceAssumptions:true,productAssumptions:true,menuItems:true,businessHours:true,brandVoice:true}}}})
}
