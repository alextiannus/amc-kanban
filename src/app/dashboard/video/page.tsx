import {redirect} from 'next/navigation'
import {unifiedVideoEditorUrl, type VideoEditorEntryParams} from '@/lib/unifiedVideoEditor'

// Compatibility address; the destination enforces actor, brand and saved-project access.
export default async function VideoEditorEntry({searchParams}:{searchParams:Promise<VideoEditorEntryParams>}){
 redirect(unifiedVideoEditorUrl(await searchParams))
}
