import { prisma } from "../../lib/prisma.ts";
import { postfastGetAnalytics } from "../../lib/integrations/postfast.ts";
import path from "path";
import fs from "fs";

function getBrandSlug(brand: { name: string; id: string }): string {
  return brand.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || brand.id;
}

async function loadBrandFiles(brand: { name: string; id: string }): Promise<string> {
  const brandSlug = getBrandSlug(brand);
  let contextText = "";

  // 1. Load brand documents
  const docsDir = path.join(process.cwd(), "documents", brandSlug);
  if (fs.existsSync(docsDir)) {
    try {
      const readDirRecursive = (dir: string): string[] => {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            results = results.concat(readDirRecursive(filePath));
          } else {
            results.push(filePath);
          }
        });
        return results;
      };

      const docFiles = readDirRecursive(docsDir);
      if (docFiles.length > 0) {
        contextText += "\n--- BRAND DOCUMENTS & GUIDELINES ---\n";
        for (const file of docFiles) {
          const content = fs.readFileSync(file, "utf8");
          const relativeName = path.relative(docsDir, file);
          contextText += `[Document: ${relativeName}]\n${content}\n\n`;
        }
      }
    } catch (err) {
      console.error("Failed to load brand documents in researcherNode:", err);
    }
  }

  // 2. Load brand memory
  const memoryDir = path.join(process.cwd(), "memory", brandSlug);
  if (fs.existsSync(memoryDir)) {
    try {
      const files = fs.readdirSync(memoryDir).filter(f => f.endsWith(".md"));
      if (files.length > 0) {
        contextText += "\n--- BRAND MEMORY & HISTORICAL FEEDBACK ---\n";
        files.sort().reverse();
        for (const file of files.slice(0, 5)) {
          const content = fs.readFileSync(path.join(memoryDir, file), "utf8");
          contextText += `[Memory Date: ${file.replace(".md", "")}]\n${content}\n\n`;
        }
      }
    } catch (err) {
      console.error("Failed to load brand memory in researcherNode:", err);
    }
  }

  return contextText;
}

export async function researcherNode(state: any) {
  console.log("=== ResearcherNode Running ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId }
  });

  const task = await prisma.workUnit.findUnique({
    where: { id: taskId }
  });

  if (!brand || !task) {
    throw new Error("Brand or Task not found in database.");
  }

  console.log(`Researcher analyzing Brand: ${brand.name}, Task: ${task.title}`);

  // 1. Gather brand metadata
  const website = brand.website ? `Website: ${brand.website}` : "";
  const phone = brand.phone ? `Phone: ${brand.phone}` : "";
  const address = brand.address ? `Address: ${brand.address}` : "";
  const location = brand.location ? `Location/Target region: ${brand.location}` : "";
  const brandMetadata = [website, phone, address, location].filter(Boolean).join("\n");

  // 2. Gather documents and memory files context
  const brandFilesContext = await loadBrandFiles(brand);

  // 3. Gather historical analytics/performance data
  let examplesText = "";
  let topPosts: { content: string; impressions: number; likes: number }[] = [];

  if (brand.postfastApiKey) {
    try {
      console.log(`Fetching PostFast analytics for Brand: ${brand.name}`);
      const analyticsRes = await postfastGetAnalytics(brand.postfastApiKey);
      if (analyticsRes.success && analyticsRes.posts && analyticsRes.posts.length > 0) {
        const parsedPosts = analyticsRes.posts.map(p => {
          const impressions = parseInt(p.latestMetric?.impressions || "0", 10);
          const likes = parseInt(p.latestMetric?.likes || "0", 10);
          return {
            content: p.content,
            impressions,
            likes
          };
        });
        parsedPosts.sort((a, b) => b.impressions - a.impressions || b.likes - a.likes);
        topPosts = parsedPosts.slice(0, 3);
      }
    } catch (err) {
      console.error("Failed to fetch PostFast analytics in researcherNode:", err);
    }
  }

  if (topPosts.length > 0) {
    examplesText = "\nHere are the top-performing historical posts for this brand on this platform to guide you:\n" +
      topPosts.map((p, idx) => `[Example ${idx + 1}]\nMetrics: Impressions: ${p.impressions}, Likes: ${p.likes}\nContent: "${p.content}"\n`).join("\n");
  } else {
    try {
      const historicalDrafts = await prisma.contentDraft.findMany({
        where: {
          brandId,
          status: "published"
        },
        orderBy: { publishedAt: "desc" },
        take: 5
      });
      if (historicalDrafts.length > 0) {
        examplesText = "\nHere are some of the brand's previously published posts to guide your style:\n" +
          historicalDrafts.map((d, idx) => `[Example ${idx + 1}]\nContent: "${d.caption}"\n`).join("\n");
      }
    } catch (err) {
      console.error("Failed to fetch historical ContentDrafts in researcherNode:", err);
    }
  }

  // 4. Compile all researched facts into a unified context block
  const researchNotes = `
[Brand Metadata]:
${brandMetadata || "No specific brand metadata registered."}

[Brand Visual & Historical Context]:
${examplesText || "No historical post metrics available."}
${brandFilesContext}
  `.trim();

  console.log(`Researcher successfully compiled brand context (${researchNotes.length} chars).`);

  return {
    researchNotes
  };
}
