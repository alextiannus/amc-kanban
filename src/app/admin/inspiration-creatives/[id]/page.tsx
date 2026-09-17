import { contentEntry } from '@/lib/role-permissions/content-entry'
export default async function Page({params}: {params: Promise<{id:string}>}) {return contentEntry('inspiration-library', '/admin/inspiration-creatives/' + encodeURIComponent((await params).id))}
