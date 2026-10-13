export type PlanningBudget={currency:string;total:number;months:number[];reserve:number}
/** Exact two-decimal accounting, independent of model-written totals. */
export function checkPlanningBudget(value:PlanningBudget){
 const money=(n:number)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e10||Math.abs(n*100-Math.round(n*100))>0.0001)throw Error('invalid_budget_amount');return Math.round(n*100)}
 if(!value||typeof value.currency!=='string'||!/^[A-Z]{3}$/.test(value.currency)||!Array.isArray(value.months)||value.months.length!==12)throw Error('invalid_annual_budget')
 const total=money(value.total),months=value.months.map(money),reserve=money(value.reserve),allocated=months.reduce((sum,n)=>sum+n,0)
 return {currency:value.currency,total:total/100,months:months.map(n=>n/100),reserve:reserve/100,allocated:allocated/100,quarterTotals:[0,3,6,9].map(i=>months.slice(i,i+3).reduce((a,b)=>a+b,0)/100),difference:(total-allocated-reserve)/100,balanced:total===allocated+reserve}
}
