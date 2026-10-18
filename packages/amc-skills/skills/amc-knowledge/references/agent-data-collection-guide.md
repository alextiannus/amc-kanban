# AI Agent Data Collection & Upload Guidelines

This document provides detailed instructions for AI Agents on how to discover, gather, structure, and upload merchant brand growth intelligence into the `amc-growth` repository.

---

## 1. How to Collect Data (如何搜集资料)

AI Agents should utilize a combination of search, social intelligence, and public reviews to construct a complete picture of the merchant and its market surroundings:
1. **competitor Social Accounts**: Crawl or search Instagram, TikTok, Xiaohongshu (小红书), and Facebook profiles of local F&B brands in the same category and trade area. Look for top-performing posts, visual patterns, and customer engagement.
2. **Public Review Portals**: Scan Google Maps Places reviews, Yelp, and local food blogs (e.g. SethLui, Ladyironchef) to discover customer complaints, signature dish mentions, service highlights, and common dining occasions.
3. **Physical & Trade Area Audits**: Map nearby competitors (coordinates, category, rating) using Google Places API or trade area indexes.
4. **Merchant Onboarding Notes**: Extract facts from merchant intake interviews, photos, menus, and owner messages.

---

## 2. What Data to Collect (收集哪些资料)

Collect data across four core intelligence pillars:

### A. Brand Positioning & Core Story (品牌定位与故事)
*   **Founder Narrative**: Why the restaurant was started, traditional roots, chef history, culinary philosophy.
*   **Target Demographics**: Dining personas (e.g., "young group suppers", "family weekend gatherings", "CBD office lunch").
*   **Brand Voice**: Tone keywords (e.g., "homely", "authentic", "bold", "high-energy").

### B. Outlets & Outpost Distribution (门店信息与分布)
*   **Physical Details**: Absolute street address, landmarks, nearest MRT stations, coordinates (latitude, longitude).
*   **Operational Hours**: Opening times, closing times, supper extensions (e.g., "open until 3:00 AM").
*   **Facilities**: Seating capacity, booking hotline numbers, special amenities (e.g., KTV rooms, private rooms, outdoor seating).

### C. Selected Speciality Menu (招牌菜品推荐)
*   **Specialty Name**: Exact dish name in both Chinese and English (if applicable).
*   **Description**: Ingredients, flavor profile (e.g., "authentic Sichuan spicy numb", "slow-braised for 4 hours"), portion size, serving method (e.g., "served in a hot claypot").

### D. Dining & Reservation Rules (用餐攻略与预约须知)
*   **Booking Requirements**: Minimum advance notice (e.g., "must book 1 day in advance for signature goose"), minimum spend, reservation channels.
*   **Dining Limits**: Peak hour time limits (e.g., "90-minute dining limit during weekends").

---

## 3. How to Organize & Upload (如何组织与上传)

Follow these strict structural steps to ingest collected facts into `amc-growth`:

### Step 1: Log Raw Intake Notes
Create a raw text intake log under `inbox/intake-{merchantId}-{date}.md`. This acts as the raw source of truth for audit trails:
```markdown
# Intake Note: [Merchant Name] - [Date]
* **Source**: Google Maps + Scraped Instagram
* **Collected By**: Agent [Name]

[Raw facts and unstructured notes go here...]
```

### Step 2: Crate Structured Merchant Files
Extract and write facts into the merchant directory `merchants/{merchantId}/`:
1.  **`profile.md`**: Store basic metadata block.
2.  **`brand-story.md`**: Organize into five mandatory markdown headers:
    *   `# 品牌故事`
    *   `# 门店信息` (Format outlets as bullet list: `- **Branch Name**：Address, phone, hours`)
    *   `# 品牌定位`
    *   `# 招牌菜` (Format dishes as bullet list: `- **Dish Name**：Flavors, ingredients, details`)
    *   `# 用餐攻略` (Format tips as bullet list: `- **Tip Title**：Context and requirements`)
3.  **`online-presence.md`**: Record the SEO/GEO/Google Maps audit results.

### Step 3: Run Build & Verification Scripts
Run the local compilation flow to validate schema compliance and export JSON outputs:
```bash
# 1. Rebuild index and run validation
npm run build:index
npm run validate

# 2. Compile merchant data and generate H5 page
npm run export:merchant {merchantId}
npm run build:merchant-page {merchantId}
```

### Step 4: Git Push to Trigger Deployment
Push the branch to `origin/main` to trigger the Render production deployment. Make sure global LFS filters are bypassed if `git-lfs` is missing on your host shell.

---

## 4. Online Presence Audit: SEO, GEO & Google Maps (网络表现审计)

AI Agents MUST perform a thorough multi-dimensional audit of the merchant's online presence and document it under `merchants/{merchantId}/online-presence.md`. The audit must evaluate:

### A. SEO (Search Engine Optimization - 搜索引擎表现)
*   **Search Visibility**: Check if the brand appears on page 1 of Google Search when searching for its name, signature dish category (e.g., "Singapore Iron Pot Stew"), and location (e.g., "Jalan Besar supper").
*   **Organic Backlinks**: Identify major F&B directories and food blogs (such as SethLui, Eatbook, DanielFoodDiary, OpenRice, Tripadvisor) featuring the merchant.
*   **Keyword Gaps**: List key terms where competitor brands outrank the merchant.

### B. GEO (Generative Engine Optimization - 生成式 AI 搜索表现)
*   **AI Recommendations**: Query LLMs (Gemini, ChatGPT, Claude) with prompts like *"Recommend authentic Dongbei restaurants in Singapore"* or *"Where can I eat late-night BBQ near Jalan Besar?"*.
*   **Citation Audit**: Analyze if the merchant is cited by AI answers, which sources the LLMs cite, and what reasons they give for their recommendations.
*   **Optimization Strategy**: Document what key descriptions or platform listings (e.g., Xiaohongshu, Instagram) the merchant needs to strengthen so AI models retrieve its facts.

### C. Google Maps (Local SEO - 谷歌地图表现)
*   **Profile Verification**: Audit if the Google Business Profile is claimed and verified.
*   **Information Consistency**: Confirm absolute match of phone numbers, opening hours, official website, and menus across Google Maps and social profiles.
*   **Review Sentiment**: Analyze overall rating, review volume, keywords in positive/negative feedback, and whether the owner replies to customer reviews.
