# SteadySocial OS

SteadySocial OS is a powerful, locally-hosted Electron desktop application designed to act as an all-in-one Facebook Page CRM, AI Chat Assistant, Content Management system, and Ads & Market Research console.

It automates customer inquiries using intelligent, context-aware AI (capable of extracting product details, managing order flows, and utilizing a natural Taglish persona), tracks leads through an automated sales funnel, manages content campaigns securely from your local machine, and helps research public ad or market signals from multiple platforms.

## 🚀 Features

- **Automated AI Messenger Assistant:** Handles product inquiries, order processing, and intelligently routes complex queries or payment verifications to human agents via a `[HANDOFF]` system.
- **Smart CRM & Funnel Tracking:** Automatically extracts customer details (Name, Contact, Address) from chat transcripts and updates their sales status (New → Ordering → Paid → Shipped).
- **Facebook Graph & Webhook Integration:** Syncs real-time messages and Facebook Lead Ads directly into your local database.
- **Content Canvases:** Plan, draft, and adapt social media content for various platforms.
- **Ads & Market Research Console:** Scrapes and analyzes public market signals from Meta Ads Library, Google Trends, TikTok Ads Library, and Reddit Search.
- **AI Market Analysis:** Uses the saved AI provider from Settings to identify the likely niche, winning ads/content, creative structures, audience signals, timing patterns, and KPI summaries.
- **MCP Server Included:** Features a built-in Model Context Protocol server, allowing external AI tools to interface with your CRM data and create planning files.

## 🔎 Ads & Market Research

The Ads & Market Research console is designed for competitive research, content planning, and market discovery.

### Supported Sources

| Source | What It Collects |
| :--- | :--- |
| **Meta Ads Library** | Public ad cards, advertiser names, ad copy, creative previews, platform placements, statuses, dates, impression text where visible, and detail URLs. |
| **Google Trends** | Visible table data from `Top queries` and `Rising queries` on the Google Trends Explore page. |
| **TikTok Ads Library** | Public TikTok ad cards and API signals, including advertiser name, ad ID, first shown, last shown, unique users seen, thumbnail, and detail URL. |
| **Reddit Search** | Public search results from `data.children`, extracting each `child.data` post with title, subreddit, author, score, comments, self text, permalink, thumbnails, and media metadata. |

### Main Endpoint

```txt
POST http://localhost:3001/api/market-research
```

Legacy Meta-only endpoint:

```txt
POST http://localhost:3001/api/scrape
```

### Example Research Inputs

The frontend supports:

- Niche or keyword.
- Page URL or page name.
- Country/region.
- Timeframe.
- Number of data points, such as 50 ads or 100 Reddit posts.
- Source toggles for Meta, Google Trends, TikTok, and Reddit.
- Meta status/platform filters.
- Optional headless browser mode.

### Source-Specific Notes

Google Trends uses only the visible Explore page:

```txt
https://trends.google.com/explore?q=claude&date=now%201-d&geo=Worldwide
```

It extracts:

```txt
table[aria-label="Top queries"]
table[aria-label="Rising queries"]
```

Reddit uses the simple public search JSON format:

```txt
https://www.reddit.com/search.json?q=soap&limit=100
```

TikTok Ads Library uses both the public API and the visible ad card page. The visible page may require scrolling and clicking **See more** or **Load more** before all `.ad_card` elements are available.

## 🛠️ Prerequisites

- **Node.js** (v18 or higher recommended)
- **Facebook Developer Account** (with a configured App for Page Access Tokens and Webhooks)
- **API Keys** for your preferred AI provider (OpenAI, Gemini, etc.) or a local model setup (WebLLM/LM Studio)
- **Playwright Chromium** for browser-based scraping of dynamic public research pages

## 💻 Run Locally

1. **Install dependencies for the main app:**
   ```bash
   npm install
   ```

2. **Install dependencies for the MCP server:**
   ```bash
   cd steadysocial-mcp-server
   npm install
   cd ..
   ```

3. **Install Playwright Chromium:**
   ```bash
   npx playwright install chromium
   ```

4. **Environment Setup:**
   Create a `.env` file in the root directory and add your necessary keys:
   ```env
   FACEBOOK_PAGE_ACCESS_TOKEN=your_page_token
   FACEBOOK_PAGE_ID=your_page_id
   APP_ACCESS_TOKEN=your_app_token
   FB_WEBHOOK_VERIFY_TOKEN=steadysocial_verify

   # Optional but recommended for Reddit public search requests
   REDDIT_USER_AGENT=node:steadysocial-market-research:v1.0.0
   ```

5. **Start the Application:**
   Run the development environment (starts Vite + Electron):
   ```bash
   npm run electron:dev
   ```

   *Note: Ensure the local Express backend server is running for API, Webhook, and Market Research capabilities:*
   ```bash
   npm run server
   ```

## 🧪 Market Research Workflow

1. Open the Ads & Market Research page.
2. Enter a niche, product keyword, page URL, or page name.
3. Choose how many records to use as the data basis.
4. Select the sources to scrape:
   - Meta Ads Library.
   - Google Trends.
   - TikTok Ads Library.
   - Reddit Search.
5. Run the research task.
6. Review:
   - KPI cards.
   - Winning ads and content signals.
   - Google Top/Rising queries.
   - TikTok ad cards.
   - Reddit audience discussions.
   - AI-generated market analysis.
7. Use the output for campaign planning, creative testing, offer positioning, and content strategy.

## ⚠️ Scraping and Compliance Notes

This module uses public pages and public endpoints for research. Platform layouts, rate limits, and access rules may change. Use the tool only for lawful, compliant research and avoid collecting private or restricted data.

Chromium may print SSL handshake warnings during scraping. These are usually browser-level warnings from blocked or closed third-party resources. If the page loads and data is returned, they are typically safe to ignore.

## 📚 Documentation

For a deep dive into the AI architecture, features, scraping module, and tutorial workflows, please read the [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) file.
