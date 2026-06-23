import fs from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "../../lib/prisma.ts";

async function downloadToBuffer(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    try {
      const res = await fetch(urlOrPath, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
      console.warn(`[Designer Node] Fetch returned status ${res.status} for ${urlOrPath}`);
    } catch (err) {
      console.warn(`[Designer Node] Fetch exception for ${urlOrPath}:`, err);
    }

    // Remote fallback
    console.warn(`[Designer Node] Falling back to default food image due to fetch failure.`);
    try {
      const fallbackRes = await fetch('https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800');
      if (fallbackRes.ok) {
        return Buffer.from(await fallbackRes.arrayBuffer());
      }
    } catch (err) {
      console.error(`[Designer Node] Failed to fetch fallback image:`, err);
    }
    throw new Error(`Failed to download image from ${urlOrPath}`);
  }

  // Case 2: PostFast proxy URL -> redirect to S3 URL
  if (urlOrPath.startsWith("/api/integrations/postfast/file/")) {
    const parts = urlOrPath.split("/");
    const s3Key = parts.slice(6).join("/");
    const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${s3Key}`;
    return downloadToBuffer(s3Url);
  }

  // Case 3: Local relative paths
  if (urlOrPath.startsWith("/uploads/") || urlOrPath.startsWith("/")) {
    let relativePath = urlOrPath;
    if (urlOrPath.startsWith("/")) {
      relativePath = urlOrPath.slice(1);
    }
    const resolvedPath = path.join(process.cwd(), "public", relativePath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`[Designer Node] Local file not found at: ${resolvedPath}. Falling back to default food image.`);
      try {
        const fallbackRes = await fetch('https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800');
        if (fallbackRes.ok) {
          return Buffer.from(await fallbackRes.arrayBuffer());
        }
      } catch (err) {
        console.error(`[Designer Node] Failed to fetch fallback image:`, err);
      }
      throw new Error(`Local file not found at: ${resolvedPath}`);
    }
    return fs.readFileSync(resolvedPath);
  }

  // Case 4: Token fallback
  const s3Url = `https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/${urlOrPath}`;
  return downloadToBuffer(s3Url);
}

export async function designerNode(state: any) {
  console.log("=== DesignerNode Running ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, mediaUrls, platform, watermarkText } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId }
  });

  if (!brand) {
    throw new Error(`Brand ${brandId} not found.`);
  }

  // 1. Check if there are any media assets to design
  if (!mediaUrls || mediaUrls.length === 0) {
    console.log("Designer Node: No media assets found in state. Skipping design.");
    return { mediaUrls: [] };
  }

  const watermarkUrl = brand.watermarkUrl || brand.logoUrl;
  const processedMediaUrls: string[] = [];

  try {
    for (let i = 0; i < mediaUrls.length; i++) {
      const url = mediaUrls[i];
      const isVideo = url.toLowerCase().endsWith(".mp4") || url.includes("/videos/");
      if (isVideo) {
        console.log(`Designer Node: Media at index ${i} is a video. Skipping image design.`);
        processedMediaUrls.push(url);
        continue;
      }

      console.log(`Designer Node: Processing image asset at index ${i}: ${url}`);
      const assetBuffer = await downloadToBuffer(url);

      if (i === 0) {
        // COVER IMAGE DESIGN + OPTIMIZATION + WATERMARK + COVER TAG
        const coverSharpObj = sharp(assetBuffer);
        const coverMetadata = await coverSharpObj.metadata();
        let coverWidth = coverMetadata.width || 1200;
        let coverHeight = coverMetadata.height || 1200;

        // Apply Platform-specific Smart Cropping Specification
        let targetWidth: number | undefined;
        let targetHeight: number | undefined;

        if (platform === "instagram") {
          targetWidth = Math.min(coverWidth, coverHeight);
          targetHeight = targetWidth;
        } else if (platform === "red" || platform === "xiaohongshu") {
          if (coverWidth * 1.25 > coverHeight) {
            targetHeight = coverHeight;
            targetWidth = Math.round(coverHeight * 0.8);
          } else {
            targetWidth = coverWidth;
            targetHeight = Math.round(coverWidth * 1.25);
          }
        } else if (platform === "tiktok") {
          if (coverWidth * (16 / 9) > coverHeight) {
            targetHeight = coverHeight;
            targetWidth = Math.round(coverHeight * (9 / 16));
          } else {
            targetWidth = coverWidth;
            targetHeight = Math.round(coverWidth * (16 / 9));
          }
        }

        let processedCoverSharp = sharp(assetBuffer);

        if (targetWidth && targetHeight) {
          console.log(`Designer Node: Applying smart crop to ${targetWidth}x${targetHeight} for platform: ${platform}`);
          processedCoverSharp = sharp(assetBuffer).resize(targetWidth, targetHeight, {
            fit: 'cover',
            position: 'attention'
          });
          coverWidth = targetWidth;
          coverHeight = targetHeight;
        }

        // Apply AI Optimization (normalize contrast, subtle vibrancy)
        const croppedBuffer = await processedCoverSharp.toBuffer();
        const optimizedCoverBuffer = await sharp(croppedBuffer)
          .normalize()
          .modulate({
            saturation: 1.08,
            brightness: 1.02
          })
          .toBuffer();

        const finalCoverSharp = sharp(optimizedCoverBuffer);

        // Watermark overlay
        const textToRender = watermarkText || brand.watermarkText || (!watermarkUrl ? brand.name : "");

        let watermarkInput: Buffer;
        let wWidth: number;
        let wHeight: number;

        if (textToRender) {
          console.log(`Designer Node: Overlaying text watermark: "${textToRender}"`);
          wWidth = Math.round(coverWidth * 0.45);
          wHeight = Math.round(coverHeight * 0.08);
          const fontSize = Math.max(12, Math.round(wHeight * 0.4));
          const escapedText = textToRender.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const svg = `
            <svg width="${wWidth}" height="${wHeight}">
              <style>
                .text {
                  fill: #ffffff;
                  font-size: ${fontSize}px;
                  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                  font-weight: bold;
                  text-anchor: middle;
                  dominant-baseline: middle;
                }
                .bg {
                  fill: rgba(0, 0, 0, 0.45);
                  rx: 6px;
                  ry: 6px;
                }
              </style>
              <rect x="2" y="2" width="${wWidth - 4}" height="${wHeight - 4}" class="bg" />
              <text x="${wWidth / 2}" y="${wHeight / 2}" class="text">${escapedText}</text>
            </svg>
          `;
          watermarkInput = Buffer.from(svg);
        } else if (watermarkUrl) {
          console.log(`Designer Node: Overlaying image logo watermark: ${watermarkUrl}`);
          const watermarkBuffer = await downloadToBuffer(watermarkUrl);
          const watermarkSharp = sharp(watermarkBuffer);
          const watermarkMetadata = await watermarkSharp.metadata();
          wWidth = Math.round(coverWidth * 0.22);
          wHeight = Math.round(
            (watermarkMetadata.height || 100) * (wWidth / (watermarkMetadata.width || 100))
          );

          const resizedWatermarkBuffer = await watermarkSharp
            .resize(wWidth, wHeight)
            .png()
            .toBuffer();

          const opacity = brand.watermarkOpacity !== undefined ? brand.watermarkOpacity : 0.8;
          watermarkInput = await sharp(resizedWatermarkBuffer)
            .composite([{
              input: Buffer.from([0, 0, 0, Math.round(opacity * 255)]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: 'dest-in'
            }])
            .png()
            .toBuffer();
        } else {
          throw new Error("Unable to determine watermark input.");
        }

        const padding = brand.watermarkPadding !== undefined ? brand.watermarkPadding : 20;
        let left = coverWidth - wWidth - padding;
        let top = coverHeight - wHeight - padding;

        const position = brand.watermarkPosition || "bottom-right";
        if (position === "top-left") {
          left = padding;
          top = padding;
        } else if (position === "top-right") {
          left = coverWidth - wWidth - padding;
          top = padding;
        } else if (position === "bottom-left") {
          left = padding;
          top = coverHeight - wHeight - padding;
        } else if (position === "center") {
          left = Math.round((coverWidth - wWidth) / 2);
          top = Math.round((coverHeight - wHeight) / 2);
        }

        const composites: any[] = [
          {
            input: watermarkInput,
            left,
            top
          }
        ];

        // ADD COVER IMAGE PROMOTIONAL TAG
        const task = await prisma.workUnit.findUnique({
          where: { id: taskId }
        });
        
        let coverTagText = task?.tags && task.tags.length > 0 ? task.tags[0] : "店长推荐";
        // Filter out system tags like platform names to get a nice promotional badge
        const systemTags = ["instagram", "red", "xiaohongshu", "tiktok", "facebook", "google", "google_business"];
        const promoTags = task?.tags?.filter(t => !systemTags.includes(t.toLowerCase())) || [];
        if (promoTags.length > 0) {
          coverTagText = promoTags[0];
        }
        
        // Format tag text with visual emoji for life breathing aesthetics
        let formattedTagText = coverTagText.trim();
        if (!formattedTagText.startsWith("🔥") && !formattedTagText.startsWith("✨") && !formattedTagText.startsWith("🎁") && !formattedTagText.startsWith("⭐")) {
          formattedTagText = `🔥 ${formattedTagText}`;
        }

        console.log(`Designer Node: Overlaying cover tag: "${formattedTagText}"`);

        const tWidth = Math.round(coverWidth * 0.35);
        const tHeight = Math.round(coverHeight * 0.07);
        const tFontSize = Math.max(11, Math.round(tHeight * 0.45));
        const escapedTagText = formattedTagText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const tagSvg = `
          <svg width="${tWidth}" height="${tHeight}">
            <style>
              .badge {
                fill: url(#grad);
                rx: 16px;
                ry: 16px;
              }
              .text {
                fill: #ffffff;
                font-size: ${tFontSize}px;
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                font-weight: 900;
                text-anchor: middle;
                dominant-baseline: middle;
              }
            </style>
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff5e62;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff9966;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="${tWidth - 4}" height="${tHeight - 4}" class="badge" />
            <text x="${tWidth / 2}" y="${tHeight / 2}" class="text">${escapedTagText}</text>
          </svg>
        `;
        const coverTagInput = Buffer.from(tagSvg);
        
        // Place tag at top-left corner by default
        let tLeft = padding;
        let tTop = padding;

        // Prevent collision with watermark if watermark is at top-left
        if (position === "top-left") {
          tLeft = coverWidth - tWidth - padding;
          tTop = padding;
        }

        composites.push({
          input: coverTagInput,
          left: tLeft,
          top: tTop
        });

        // Composite both watermark and cover tag, sharpen, and output
        const outputBuffer = await finalCoverSharp
          .composite(composites)
          .sharpen()
          .jpeg({ quality: 92 })
          .toBuffer();

        // Save cover image locally
        const uploadDir = path.join(process.cwd(), "public", "uploads", "watermarked");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `${taskId}-${Date.now()}.jpg`;
        const outputPath = path.join(uploadDir, filename);
        fs.writeFileSync(outputPath, outputBuffer);

        const publicUrl = `/uploads/watermarked/${filename}`;
        console.log(`Designer Node: Watermarked and tagged cover saved locally at: ${outputPath}`);

        // Register cover image asset in DB
        const newAsset = await prisma.mediaAsset.create({
          data: {
            brandId,
            url: publicUrl,
            filename,
            mimeType: "image/jpeg",
            sizeBytes: outputBuffer.length,
            width: coverWidth,
            height: coverHeight,
            aiReady: true,
            aiCategory: "watermarked_cover",
            sourceType: "designer"
          }
        });
        console.log(`Designer Node: Registered cover asset in DB: ${newAsset.id}`);
        processedMediaUrls.push(publicUrl);

      } else {
        // SECONDARY IMAGE OPTIMIZATION (contrast, saturation, sharpen)
        const secondarySharp = sharp(assetBuffer);
        const metadata = await secondarySharp.metadata();
        const width = metadata.width || 1200;
        const height = metadata.height || 1200;

        const optimizedBuffer = await sharp(assetBuffer)
          .normalize()
          .modulate({
            saturation: 1.08,
            brightness: 1.02
          })
          .sharpen()
          .jpeg({ quality: 92 })
          .toBuffer();

        // Save optimized image locally
        const uploadDir = path.join(process.cwd(), "public", "uploads", "optimized");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `opt-${taskId}-${i}-${Date.now()}.jpg`;
        const outputPath = path.join(uploadDir, filename);
        fs.writeFileSync(outputPath, optimizedBuffer);

        const publicUrl = `/uploads/optimized/${filename}`;
        console.log(`Designer Node: Optimized secondary image saved locally at: ${outputPath}`);

        // Register optimized asset in DB
        const newAsset = await prisma.mediaAsset.create({
          data: {
            brandId,
            url: publicUrl,
            filename,
            mimeType: "image/jpeg",
            sizeBytes: optimizedBuffer.length,
            width,
            height,
            aiReady: true,
            aiCategory: "optimized_media",
            sourceType: "designer"
          }
        });
        console.log(`Designer Node: Registered optimized asset in DB: ${newAsset.id}`);
        processedMediaUrls.push(publicUrl);
      }
    }

    return {
      mediaUrls: processedMediaUrls
    };

  } catch (e: any) {
    console.error("Designer Node: Image processing error:", e);
    return {
      mediaUrls,
      error: `DesignerNode error: ${e.message}`
    };
  }
}
