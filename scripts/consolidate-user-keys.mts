import {prisma} from '../src/lib/prisma.ts'
import {consolidateUserKeys} from '../src/lib/consolidate-user-keys.ts'
try{console.log('SINGLE_KEY_RESULT '+JSON.stringify(await consolidateUserKeys(prisma,process.argv.includes('--apply'))))}finally{await prisma.$disconnect()}
