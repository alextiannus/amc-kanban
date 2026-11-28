import {userInfo} from 'node:os'
import {createServer} from 'node:net'
import {mkdtemp} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const dir=await mkdtemp('/private/tmp/amc-brand-understanding-pg-'),bin=(process.env.PG_BIN||'/opt/homebrew/opt/postgresql@16/bin/').replace(/\/?$/,'/')
const run=(name,args)=>execFileSync(bin+name,args,{stdio:'pipe',timeout:60000})
run('initdb',['-D',dir,'-A','trust','--no-locale','-E','UTF8']);let started=false
try{
 run('pg_ctl',['-D',dir,'-l',dir+'/server.log','-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started=true
 run('createdb',['-h','127.0.0.1','-p',String(port),'amc_lineage_test_understanding'])
 const env={...process.env,DATABASE_URL:`postgresql://${userInfo().username}@127.0.0.1:${port}/amc_lineage_test_understanding`}
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{stdio:'inherit',timeout:60000,env})
 for(const script of ['test-brand-understanding-postgres.mts','test-brand-understanding-runtime.mts','test-interview-chat.mts'])execFileSync(process.execPath,['--import','tsx','scripts/'+script],{stdio:'inherit',timeout:180000,env})
}finally{if(started)run('pg_ctl',['-D',dir,'-m','immediate','-w','stop'])}
