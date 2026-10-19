import {createServer} from 'node:net';
import {mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const dir=await mkdtemp('/private/tmp/amc-agent-skills-pg-');const bin='/opt/homebrew/opt/postgresql@18/bin/';
const run=(name,args)=>execFileSync(bin+name,args,{stdio:'pipe',timeout:60000});
run('initdb',['-D',dir,'-A','trust','--no-locale','-E','UTF8']);
let started=false;
try{
 run('pg_ctl',['-D',dir,'-l',dir+'/server.log','-o','-h 127.0.0.1 -p '+port+' -k '+dir,'-w','start']);started=true;
 run('createdb',['-h','127.0.0.1','-p',String(port),'amc_agent_skills_test']);
 execFileSync(process.execPath,['--import','tsx','scripts/test-agent-skills.mts'],{stdio:'inherit',timeout:180000,env:{...process.env,AGENT_SKILLS_TEST_DATABASE_URL:`postgresql://127.0.0.1:${port}/amc_agent_skills_test`}});
}finally{if(started)run('pg_ctl',['-D',dir,'-m','immediate','-w','stop'])}
