# Multi-Platform Integration Product Requirements Document (PRD)

**Version:** 1.1
**Date:** 2026-07-31
**Status:** Approved / In Development  
**Target Audience:** AMC Kanban AI Employee, Developers, AMC Operator  

---

## 1. Executive Summary

AI Marketing Crew (AMC) provides a unified business dashboard and operational protocol for local brands to automate and monitor their multi-platform digital footprint. To fulfill subscription plan commitments (e.g. Starer, Essential, Advanced plans), the system must support three core operations across multiple platforms:
1. **Content Publishing (自动发布内容)**: Post text/media immediately or with schedules.
2. **Review & Comment Replies (回复评论)**: Retrieve incoming reviews/comments and reply publicly.
3. **Data Analytics & Insights (抓取数据分析)**: Track follower counts, post engagement (likes, comments, views), and category benchmarks.

This PRD consolidates the design, execution, and integration routes for each platform to guide both AI Agent execution and system development.

---

## 2. Platform Capability Matrix

| Platform | Content Publishing (自动发布) | Review/Comment Reply (评论回复) | Analytics Collection (数据分析) |
| :--- | :--- | :--- | :--- |
| **Google Maps (GBP)** | Direct GBP API / PostFast | Direct GBP API (OAuth) / PostFast | GBP API (OAuth) / Places API / Apify |
| **Yelp** | PostFast Integration | PostFast Integration | Apify Scraper |
| **Instagram** | PostFast Integration | Extension Bridge (Automation) | Apify Instagram Scraper |
| **TikTok** | PostFast Integration | Extension Bridge (Automation) | Apify TikTok Scraper |
| **Xiaohongshu (RED)** | PostFast Integration | Extension Bridge (Automation) | Apify Xiaohongshu Scraper |
| **Dianping & Meituan**| N/A (Manual/Extension) | Extension Bridge (Automation) | Extension Bridge / Manual |

---

## 3. Platform Architecture & Implementation

### 3.1 Google Business Profile (GBP / Google Maps)
*   **Content Publishing**: 
    *   *Implementation*: Handled by `createGoogleGBPLocalPost` in `google.ts` utilizing direct OAuth2 tokens, or fallback to PostFast's S3-signed media upload + publish endpoints.
*   **Review Replies**: 
    *   *Implementation*: Direct POST to Google GBP Location review reply resource using the merchant's Access Token, falling back to PostFast.
*   **Analytics**: 
    *   *Implementation*: Fetching business profile rating score, total reviews count, and follower deltas from Google Places API or direct OAuth account listings.

### 3.2 Yelp
*   **Content Publishing & replies**:
    *   *Implementation*: Integrated fully via **PostFast**. Media files are uploaded to PostFast's signed S3 URLs, followed by scheduling the post. Review replies utilize `postfastReplyReview`.
*   **Analytics**:
    *   *Implementation*: Yelp-specific reviews are scraped using Apify's Google/Yelp aggregator actors.

### 3.3 Instagram, TikTok & Xiaohongshu (RED)
*   **Content Publishing**:
    *   *Implementation*: Unified under **PostFast**. The Agent calls `postfastPublish` with a specific account ID (`accountId`) and target platform. Captions, hashtags, and media storage keys (uploaded via PostFast's pre-signed URLs) are compiled and sent to PostFast.
    *   *Post identity contract*: A successful `POST /social-posts` response is `{ postIds: string[] }`. AMC persists `postIds[0]` as `ContentDraft.platformPostId`; a success response without an ID is treated as an integration failure.
    *   *Scheduled status reconciliation*: The Scheduled view triggers a bounded provider reconciliation before loading. `GET /social-posts` pagination starts at request `page=0`; exact stored IDs are preferred. Legacy rows without an ID are updated only after a unique account + caption + scheduled-time match.
*   **Review/Comment Replies**:
    *   *Implementation*: **Extension Bridge (浏览器插件中转技术)**.
        *   Since official APIs for comments on TikTok/Xiaohongshu are heavily restricted or require manual commercial reviews, the system utilizes a Chrome extension (`AI Marketing Crew Assistant`) installed on the merchant's browser.
        *   When the Agent executes a reply command via MCP `board_reply_review` or POST `/api/brands/[id]/reviews/reply`, the backend routes the command down to the connected Chrome Extension via Server-Sent Events (SSE).
        *   The extension identifies the merchant dashboard page tab (Instagram, TikTok Creator Center, or Xiaohongshu Creator Platform), runs content script scripts to DOM-inject the reply text, and clicks submit.
*   **Analytics**:
    *   *Implementation*: **Apify Cloud Actors**.
        *   *Instagram*: `apify/instagram-scraper` scrapes post details (postId, caption, url, likes, comments, videoViewCount) and profile stats (followers, following, bio).
        *   *TikTok*: `clockworks/free-tiktok-scraper` parses profiles and fetches video engagement (diggCount, commentCount, playCount, shareCount).
        *   *Xiaohongshu*: `easyapi/all-in-one-rednote-xiaohongshu-scraper` queries keywords or profile lists to retrieve note title, description, publishTime, likes, comments, and cover images.

### 3.4 Dianping & Meituan (国内本地生活)
*   **Content Publishing**: Manual or assisted via Chrome Extension.
*   **Review Replies**: Handled entirely via the **Extension Bridge** Chrome Extension running on `dianping.com` or `meituan.com` merchant dashboards.
*   **Analytics**: Manual entry or pulled via browser extension DOM extraction.

---

## 4. Unified Interface Mappings

### 4.1 MCP Tools for AI Agent
*   `board_list_social_accounts`: Lists connected handles and `accountId`s across all platforms (Instagram, TikTok, Xiaohongshu, Google Maps, Yelp).
*   `board_publish_content` (or `publish`): Publishes content using PostFast/Direct-GBP, accepting captions, scheduled dates, and media.
*   `board_reply_review`: Unified review reply tool.
    *   If platform is `google` or `yelp`: Backend uses direct OAuth or PostFast API.
    *   If platform is `instagram`, `tiktok`, `xiaohongshu`, `dianping`, or `meituan`: Backend delegates the request to the `ExtensionBridge` SSE stream to let the browser extension execute it.
*   `google_get_reviews`: Fetches Google Maps reviews.
*   `get_social_insights`: Returns scraped post performance data.

### 4.2 REST APIs
*   `GET /api/brands/[id]/drafts?status=:status` — Fetch server-filtered drafts plus full per-status counts.
*   `POST /api/brands/[id]/drafts/sync-statuses` — Reconcile PostFast scheduled posts to `published` or `failed` before refreshing the Scheduled view.
*   `GET /api/brands/[id]/reviews` — Fetch reviews from all active sources.
*   `POST /api/brands/[id]/reviews/reply` — Post a reply. Automatically routes domestic and social platforms to the browser extension bridge, and international directories to APIs.

---

## 5. Development Deliverables

1.  **Browser Extension Updates (`chrome-extension/`)**:
    *   Update `manifest.json` to request host permissions for `*.instagram.com`, `*.tiktok.com`, `*.xiaohongshu.com`, and content script matches for `*.immedi.ai`.
    *   Update `background.js` to look up active tabs for Instagram, TikTok, and Xiaohongshu, and execute DOM-replies.
2.  **Backend MCP & API Router Updates (`src/`)**:
    *   Update `/api/brands/[id]/reviews/route.ts` to support routing replies for `instagram`, `tiktok`, `xiaohongshu`, `dianping`, and `meituan` through the Extension Bridge.
    *   Update `src/lib/partner/mcp/server.ts` (`board_reply_review`) to support the extended platforms.
