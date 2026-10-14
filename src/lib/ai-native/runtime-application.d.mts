import type {Application,ApplicationOptions} from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type {Pool} from 'pg'
export function openApplication(options:ApplicationOptions&{taskPool?:Pool}):Promise<Application>
