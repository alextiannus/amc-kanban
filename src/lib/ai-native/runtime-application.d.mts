import type {Application,ApplicationOptions,ArtifactReference} from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type {Pool} from 'pg'
type WorkspaceWriteGuard=(input:{expectedRevision:number;content:string},context:{actor:{scopeId:string;subjectId:string};taskId?:string},write:()=>Promise<{reference:ArtifactReference}>)=>Promise<{reference:ArtifactReference}>
export function openApplication(options:ApplicationOptions&{taskPool?:Pool;workspaceWrite?:WorkspaceWriteGuard;workspacePreflight?:(input:{path:string;content:string},context:{actor:{scopeId:string;subjectId:string};taskId?:string})=>Promise<{valid:boolean;feedback?:string}>}):Promise<Application>
