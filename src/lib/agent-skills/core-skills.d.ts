declare module '@immedi/iaic-core/skills/metadata.js' {
  export function skillMetadata(text: string, entry: string): { name: string; description: string; format: string }
}
declare module '@immedi/iaic-core/skills/catalog.js' {
  export class SkillCatalog {
    constructor(options: { root: string; entries: string[] })
    read(id: string, options?: { resource?: string | null; expectedVersion?: string | null; expectedResourceVersion?: string | null }): Promise<{ id: string; resource: string | null; text: string; version: string; skillVersion: string }>
  }
}
