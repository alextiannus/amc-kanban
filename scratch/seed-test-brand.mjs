import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Check if admin user exists
  let admin = await prisma.user.findFirst({
    where: { email: 'admin@example.com' }
  })
  
  if (!admin) {
    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash('password123', 12)
    admin = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'ADMIN',
        nickname: 'Admin User'
      }
    })
    console.log('Created admin user')
  } else {
    console.log('Admin user already exists:', admin.email)
  }

  // Check if brand exists
  let brand = await prisma.brand.findFirst()
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: 'Test Brand Store',
        timezone: 'Asia/Singapore',
        status: 'ACTIVE',
        postfastApiKey: 'pf-key-test-12345'
      }
    })
    console.log('Created test brand:', brand.id)
  } else {
    console.log('Test brand already exists:', brand.name, brand.id)
  }

  // Ensure active BrandSubscription exists so the board dashboard is accessible
  let sub = await prisma.brandSubscription.findFirst({
    where: { brandId: brand.id, status: 'ACTIVE' }
  })
  if (!sub) {
    sub = await prisma.brandSubscription.create({
      data: {
        planId: 'advanced',
        planName: 'Advanced Plan',
        durationMonths: 12,
        billedMonths: 12,
        monthlyBaseUsd: 499,
        totalDueUsd: 5988,
        status: 'ACTIVE',
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        brandId: brand.id,
        createdById: admin.id
      }
    })
    console.log('Created active subscription for test brand:', sub.id)
  } else {
    console.log('Active subscription already exists:', sub.id)
  }

  // Ensure brand has an agent linked to it
  let brandAgent = await prisma.brandAgent.findFirst({
    where: { brandId: brand.id }
  })
  if (!brandAgent) {
    // Generate or use a dummy agent
    let agent = await prisma.user.findFirst({
      where: { type: 'AI_AGENT' }
    })
    if (!agent) {
      const bcrypt = await import('bcryptjs')
      const hashedPassword = await bcrypt.default.hash('password123', 12)
      agent = await prisma.user.create({
        data: {
          email: 'agent@example.com',
          password: hashedPassword,
          role: 'USER',
          type: 'AI_AGENT',
          nickname: 'AI Agent'
        }
      })
      console.log('Created dummy AI agent user')
    }
    brandAgent = await prisma.brandAgent.create({
      data: {
        brandId: brand.id,
        agentId: agent.id,
        role: 'BRAND_DIRECTOR',
        active: true
      }
    })
    console.log('Linked agent to brand:', brandAgent.agentId)
  } else {
    console.log('Agent link already exists:', brandAgent.agentId)
  }

  // Link user to brand as owner
  const link = await prisma.brandOwner.findFirst({
    where: { brandId: brand.id, userId: admin.id }
  })
  if (!link) {
    await prisma.brandOwner.create({
      data: {
        brandId: brand.id,
        userId: admin.id
      }
    })
    console.log('Linked admin user to brand as owner')
  } else {
    console.log('Admin user already linked to brand')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
