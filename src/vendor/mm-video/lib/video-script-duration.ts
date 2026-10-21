/** Explicit second ranges only: ignore prices, years and diner counts. */
export function videoScriptDuration(script: string): number | null {
  const scriptBody=script.split(/\n(?:素材要求|素材需求|Required assets|Asset requirements)\s*[:：]/i)[0]
  const ends = [...scriptBody.matchAll(/(\d+(?:\.\d+)?)\s*[-–—~～至]\s*(\d+(?:\.\d+)?)\s*(?:秒|seconds?\b|secs?\b|s\b)/gi)]
    .filter(m => Number(m[2]) > Number(m[1])).map(m => Number(m[2]))
  return ends.length ? Math.ceil(Math.max(...ends)) : null
}
