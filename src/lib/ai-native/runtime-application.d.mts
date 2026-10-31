import type {Application,ApplicationOptions,ArtifactReference} from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type {Pool} from 'pg'
type WorkspaceWriteGuard=(input:{expectedRevision:number;content:string},context:{actor:{scopeId:string;subjectId:string};taskId?:string},write:()=>Promise<{reference:ArtifactReference}>)=>Promise<{reference:ArtifactReference}>
export function openApplication(options:Omit<ApplicationOptions,'runtimeLimits'>&{runtimeLimits?:ApplicationOptions['runtimeLimits']&{maxOutputBytes?:number};taskPool?:Pool;hostAction?:null|((request:any,context:{actor:{scopeId:string;subjectId:string}})=>Promise<any|null>);taskLifecycle?:boolean;requestExecutorHandoff?:boolean;skillCatalog?:unknown;workspaceWrite?:WorkspaceWriteGuard;workspacePreflight?:(input:{path:string;content:string},context:{actor:{scopeId:string;subjectId:string};taskId?:string})=>Promise<{valid:boolean;feedback?:string}>}):Promise<Application>

export const AMC_CONTEXT_MAX_BYTES:number
