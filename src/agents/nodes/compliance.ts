import { prisma } from "../../lib/prisma.ts";

export async function complianceNode(state: any) {
  console.log("=== ComplianceNode Running ===");
  const { brandId, caption } = state;

  if (!brandId) {
    throw new Error("Missing brandId in state.");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId }
  });

  if (!brand) {
    throw new Error(`Brand ${brandId} not found.`);
  }

  let compliancePassed = true;
  let complianceReason = "";

  // 1. ASAS Superlative Check (新加坡广告法极限词检查)
  const asasKeywords = ["全网最低", "最便宜", "绝对第一", "全岛第一", "best in the world", "cheapest"];
  const captionLower = caption.toLowerCase();

  for (const keyword of asasKeywords) {
    if (captionLower.includes(keyword)) {
      compliancePassed = false;
      complianceReason = `ASAS Violation: Non-justifiable superlative claim "${keyword}" found in copy.`;
      break;
    }
  }

  // 2. Halal Compliance Check (清真合规检查)
  // If brand is designated Halal (indicated in brand description or website)
  const isHalalBrand = 
    (brand.description && brand.description.toLowerCase().includes("halal")) || 
    (brand.address && brand.address.toLowerCase().includes("halal")) ||
    brand.name.toLowerCase().includes("halal");

  if (isHalalBrand && compliancePassed) {
    const forbiddenKeywords = ["pork", "lard", "bacon", "猪肉", "猪油", "酒精", "wine", "beer", "mirin"];
    for (const keyword of forbiddenKeywords) {
      if (captionLower.includes(keyword)) {
        compliancePassed = false;
        complianceReason = `Halal Violation: Pork/alcohol-related keyword "${keyword}" detected in a Halal-certified brand copy.`;
        break;
      }
    }
  }

  if (compliancePassed) {
    console.log("Compliance Node: Content passed all compliance audits.");
  } else {
    console.log("Compliance Node: AUDIT FAILED -", complianceReason);
  }

  return {
    compliancePassed,
    complianceReason
  };
}
