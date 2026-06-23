import fs from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "../../lib/prisma.ts";

async function downloadToBuffer(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to download image from ${urlOrPath} (HTTP ${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  } else {
    // Treat as local file path. If it starts with "/", resolve relative to "public" directory.
    let resolvedPath = urlOrPath;
    if (urlOrPath.startsWith("/")) {
      resolvedPath = path.join(process.cwd(), "public", urlOrPath);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Local file not found at: ${resolvedPath}`);
    }
    return fs.readFileSync(resolvedPath);
  }
}

export async function designerNode(state: any) {
  console.log("=== DesignerNode Running ===");
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

  const coverUrl = mediaUrls[0];
  const watermarkUrl = brand.watermarkUrl || brand.logoUrl;

  console.log(`Designer Node: Processing cover image: ${coverUrl}`);

  try {
    // 2. Download original cover image
    const coverBuffer = await downloadToBuffer(coverUrl);

    // 3. Get cover image metadata for size calculations
    const coverSharpObj = sharp(coverBuffer);
    const coverMetadata = await coverSharpObj.metadata();
    let coverWidth = coverMetadata.width || 1200;
    let coverHeight = coverMetadata.height || 1200;

    // 4. Apply Platform-specific Smart Cropping Specification
    let targetWidth: number | undefined;
    let targetHeight: number | undefined;

    if (platform === "instagram") {
      // Instagram post: 1:1 square
      targetWidth = Math.min(coverWidth, coverHeight);
      targetHeight = targetWidth;
    } else if (platform === "red") {
      // Xiaohongshu (RED): 4:5 vertical
      if (coverWidth * 1.25 > coverHeight) {
        targetHeight = coverHeight;
        targetWidth = Math.round(coverHeight * 0.8);
      } else {
        targetWidth = coverWidth;
        targetHeight = Math.round(coverWidth * 1.25);
      }
    } else if (platform === "tiktok") {
      // TikTok / Stories: 9:16 vertical
      if (coverWidth * (16 / 9) > coverHeight) {
        targetHeight = coverHeight;
        targetWidth = Math.round(coverHeight * (9 / 16));
      } else {
        targetWidth = coverWidth;
        targetHeight = Math.round(coverWidth * (16 / 9));
      }
    }

    let processedCoverSharp = sharp(coverBuffer);

    if (targetWidth && targetHeight) {
      console.log(`Designer Node: Applying smart crop to ${targetWidth}x${targetHeight} for platform: ${platform}`);
      // Use attention-based smart cropping to focus on faces / salient features
      processedCoverSharp = sharp(coverBuffer).resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'attention'
      });
      // Update local width & height
      coverWidth = targetWidth;
      coverHeight = targetHeight;
    }

    // 5. Watermark Determination: Text watermark vs Image watermark
    // We prioritize state.watermarkText (confirmed by manager), then brand.watermarkText,
    // and if no logo/watermarkUrl is present, fallback to brand.name.
    const textToRender = watermarkText || brand.watermarkText || (!watermarkUrl ? brand.name : "");

    let watermarkInput: Buffer;
    let wWidth: number;
    let wHeight: number;

    if (textToRender) {
      console.log(`Designer Node: Overlaying text watermark: "${textToRender}"`);
      // Generate SVG text overlay pill
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

      // Process opacity (alpha multiplier)
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

    // 6. Calculate placement coordinates
    const padding = brand.watermarkPadding !== undefined ? brand.watermarkPadding : 20;
    let left = coverWidth - wWidth - padding;
    let top = coverHeight - wHeight - padding; // Default: bottom-right

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

    // 7. Composite watermark onto cropped cover image & sharpen details
    const outputBuffer = await processedCoverSharp
      .composite([{
        input: watermarkInput,
        left,
        top
      }])
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer();

    // 8. Save locally to public/uploads/watermarked
    const uploadDir = path.join(process.cwd(), "public", "uploads", "watermarked");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${taskId}-${Date.now()}.jpg`;
    const outputPath = path.join(uploadDir, filename);
    fs.writeFileSync(outputPath, outputBuffer);

    // Form local public URL
    const publicUrl = `/uploads/watermarked/${filename}`;
    console.log(`Designer Node: Watermarked image saved locally at: ${outputPath}`);
    console.log(`Designer Node: Public URL: ${publicUrl}`);

    // 9. Register the new watermarked asset in the database
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
    console.log(`Designer Node: Registered asset in DB: ${newAsset.id}`);

    // Update mediaUrls in state, placing the watermarked cover image at index 0
    const updatedMediaUrls = [...mediaUrls];
    updatedMediaUrls[0] = publicUrl;

    return {
      mediaUrls: updatedMediaUrls
    };

  } catch (e: any) {
    console.error("Designer Node: Image processing error:", e);
    // On failure, log and fall back to original mediaUrls
    return {
      mediaUrls,
      error: `DesignerNode error: ${e.message}`
    };
  }
}
