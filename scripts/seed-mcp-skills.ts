import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// Simple helper to parse frontmatter from markdown files
function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    return { metadata: {}, body: content }
  }
  
  const yamlSection = match[1]
  const body = match[2]
  const metadata: Record<string, string> = {}
  
  yamlSection.split('\n').forEach(line => {
    const parts = line.split(':')
    if (parts.length >= 2) {
      const key = parts[0].trim()
      const val = parts.slice(1).join(':').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
      metadata[key] = val
    }
  })
  
  return { metadata, body }
}

async function main() {
  const brands = await prisma.brand.findMany()
  if (brands.length === 0) {
    console.error('No brands found in the database. Please create a brand first.')
    return
  }

  const liveExpressDir = path.join(process.cwd(), 'docs/LiveExpress')
  const skillFiles = ['agent.md', 'credit-card.skill', 'dct-logistics.skill']

  for (const brand of brands) {
    console.log(`Seeding brand: ${brand.name} (${brand.id})`)

    // 1. Create or update MCP Config for dct-logistics
    const mcpConfig = {
      name: 'dct-logistics',
      url: 'https://devmcp.12eat.ai/mcp',
      headers: {
        Authorization: 'Bearer 60677f288ebce1648b46b'
      },
      isActive: true
    }

    const existingMcp = await prisma.mcpServerConfig.findFirst({
      where: { brandId: brand.id, name: mcpConfig.name }
    })

    if (existingMcp) {
      await prisma.mcpServerConfig.update({
        where: { id: existingMcp.id },
        data: mcpConfig
      })
      console.log(`Updated MCP Server config for brand ${brand.name}`)
    } else {
      await prisma.mcpServerConfig.create({
        data: {
          brandId: brand.id,
          ...mcpConfig
        }
      })
      console.log(`Created MCP Server config for brand ${brand.name}`)
    }

    // 2. Parse and seed Skill Files
    for (const filename of skillFiles) {
      const filePath = path.join(liveExpressDir, filename)
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`)
        continue
      }

      const rawContent = fs.readFileSync(filePath, 'utf-8')
      const { metadata, body } = parseFrontmatter(rawContent)

      const skillName = metadata.name || filename.replace(/\.(skill|md)$/, '')
      const displayName = metadata.summary || metadata.name || skillName
      const description = metadata.description || `Skill loaded from ${filename}`

      const existingSkill = await prisma.companionSkill.findFirst({
        where: { brandId: brand.id, name: skillName }
      })

      const skillData = {
        name: skillName,
        displayName,
        description,
        systemPrompt: body,
        isEnabled: true
      }

      if (existingSkill) {
        await prisma.companionSkill.update({
          where: { id: existingSkill.id },
          data: skillData
        })
        console.log(`Updated skill ${skillName} for brand ${brand.name}`)
      } else {
        await prisma.companionSkill.create({
          data: {
            brandId: brand.id,
            ...skillData
          }
        })
        console.log(`Created skill ${skillName} for brand ${brand.name}`)
      }
    }
  }

  console.log('Seeding completed successfully!')
}

main()
  .catch(err => {
    console.error('Error during seeding:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
