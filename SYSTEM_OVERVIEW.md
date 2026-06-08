# SteadySocial OS - System Overview Index

Welcome to the **SteadySocial OS** system documentation. SteadySocial OS is an all-in-one, desktop-based (Electron) Facebook Page CRM, AI Chat Assistant, Content Management platform, and Ads & Market Research console.

This platform is specifically designed to empower social commerce businesses to automate customer support, process orders, manage leads, plan social media content, and research winning ads or market signals directly from a unified local environment.

---

## 🎯 Purpose of the System

By combining direct Facebook Graph API integrations, a local backend server, market research scrapers, and advanced AI prompting strategies, SteadySocial OS significantly reduces the manual effort required to manage and grow a busy social commerce operation.

It provides:

1. **Intelligent Automation:** An autonomous AI chat assistant (KIRA) running locally or via cloud APIs.
2. **Privacy & Control:** Local databases using JSONL files and IndexedDB to ensure data never leaves the user's control unless explicitly sent to Facebook, external AI APIs, or selected public research sources.
3. **Streamlined Workflows:** Seamless handoffs between AI and human agents, combined with content planning canvases and campaign managers.
4. **Ads & Market Intelligence:** A research console that collects public ad and market signals from Meta Ads Library, Google Trends, TikTok Ads Library, and Reddit Search.
5. **AI-Assisted Competitive Analysis:** AI can automatically infer the likely niche of a page or keyword, identify winning ad/content patterns, summarize audience signals, and generate KPI-oriented market insights.

---

## 📚 Detailed Documentation Modules

The system's features and technical details have been divided into specialized, detailed documentation files:

| Document / Module | Description | Key Contents |
| :--- | :--- | :--- |
| 🏗️ [**Technical Architecture**](docs/architecture.md) | The system's underlying layout. | Electron, React, Express, IndexedDB Schema, and Local JSONL databases. |
| 🤖 [**KIRA Chat Assistant**](docs/messenger_ai_kira.md) | How the AI messaging assistant operates. | Safety rules (promos/payments), Prompt routing, Persona details, Handoff system. |
| 📊 [**CRM & Funnel Tracking**](docs/crm_funnel.md) | Managing customer pipelines and leads. | Sales statuses, Anti-downgrade safeguards, Lead Ads integration, Webhooks. |
| 🎨 [**Content & Campaigns**](docs/content_and_campaigns.md) | Campaign planning and social media scheduler. | Content canvases, AI platform adaptations, Campaigns, Post scheduling rules. |
| 🔎 [**Ads & Market Research**](docs/ads_market_research.md) | Scraping and analyzing public ad/market signals. | Meta Ads Library, Google Trends tables, TikTok Ads Library cards/API, Reddit Search, KPI extraction, AI market analysis. |
| 🔌 [**MCP Server Integration**](docs/mcp_server.md) | Connecting external AI agents to the CRM. | Stdio transport architecture, Tool registers, and IDE configuration settings. |

---

## 🔎 Ads & Market Research Module

The Ads & Market Research module extends SteadySocial OS beyond CRM and content planning. It helps a social commerce operator study competitors, market demand, content angles, and audience discussions from public web sources.

### Supported Sources

| Source | Collection Method | Main Data Extracted |
| :--- | :--- | :--- |
| **Meta Ads Library** | Playwright browser scraping from public Meta Ads Library pages. | Advertiser/page name, ad copy, creative preview, platform placement, status, first shown date, impression text where visible, and ad detail URL. |
| **Google Trends** | Playwright scraping of the visible Explore page only. | `Top queries` and `Rising queries` table rows from `table[aria-label="Top queries"]` and `table[aria-label="Rising queries"]`. |
| **TikTok Ads Library** | Direct TikTok public search API plus visual `.ad_card` page scraping. | Advertiser name, ad ID, first shown, last shown, unique users seen, creative thumbnail, detail URL, and available API metadata. |
| **Reddit Search** | Simple public JSON endpoint. | Posts from `data.children`, using each `child.data` object for title, subreddit, author, score, comments, upvote ratio, permalink, self text, thumbnail, and media metadata. |

### Backend Endpoints

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/market-research` | Main ads and market research endpoint. Collects selected sources, normalizes data, computes KPIs, and generates AI analysis when configured. |
| `POST /api/scrape` | Legacy Meta-only scrape endpoint retained for older frontend compatibility. |

### Research Controls

The frontend research console supports configurable data collection, including:

- Niche or keyword.
- Optional page URL or page name context.
- Country or region.
- Timeframe.
- Number of data points, such as 50 ads or 100 Reddit posts.
- Source toggles for Meta, Google Trends, TikTok, and Reddit.
- Meta status and platform filters.
- Headless browser mode for local scraping.

### AI Market Analysis

The research module uses the AI configuration from the Settings page. Depending on the saved AI provider, analysis can run through:

- Local model endpoint.
- Gemini.
- OpenAI.
- Fallback local computed analysis when AI is not available.

The AI analysis is designed to identify:

1. Likely niche or market category.
2. Winning ads or high-signal content.
3. Common content structures and creative angles.
4. Audience pain points and buying intent signals.
5. Demographic clues based on copy, platforms, and discussion context.
6. Time-based signals, such as first shown, last shown, and rising query movement.
7. KPI summaries, including ads found, estimated impressions or reach ranges, Reddit engagement, search interest, and source coverage.

### Scraping Notes

Some sources use dynamic pages and public endpoints that can change without notice. The scraper uses best-effort extraction and should be treated as a research assistant, not a guaranteed data provider.

Common implementation details:

- Google Trends must be scraped from the rendered Explore page, not as JSON.
- Reddit should use the simple URL pattern: `https://www.reddit.com/search.json?q=keyword&limit=100`.
- TikTok Ads Library may require both scrolling and clicking **See more** or **Load more** before extracting `.ad_card` elements.
- Chromium SSL handshake messages may appear in the console. They are usually browser-level warnings from blocked or closed third-party resources. If the page loads and data is returned, they are usually safe to ignore.

---

## 🛠️ Quick Start Guide

### Prerequisites

1. **Node.js** (v18 or higher recommended).
2. **Facebook Developer Account** (with Page access and configured webhooks).
3. **LLM Provider API Key** (or a running local model on WebLLM / LM Studio).
4. **Playwright Chromium** for browser-based research scraping.
5. **Internet access** for public research sources such as Meta Ads Library, Google Trends, TikTok Ads Library, and Reddit Search.

### Setup Steps

1. **Install Dependencies:**
   ```bash
   npm install
   cd steadysocial-mcp-server
   npm install
   cd ..
   ```

2. **Install Playwright Chromium:**
   ```bash
   npx playwright install chromium
   ```

3. **Environment Configuration:**
   Create a `.env` file in the root directory:
   ```env
   FACEBOOK_PAGE_ACCESS_TOKEN=your_page_token
   FACEBOOK_PAGE_ID=your_page_id
   APP_ACCESS_TOKEN=your_app_token
   FB_WEBHOOK_VERIFY_TOKEN=steadysocial_verify

   # Optional but recommended for Reddit public search requests
   REDDIT_USER_AGENT=node:steadysocial-market-research:v1.0.0
   ```

4. **Run the Services:**
   - Start the Express server: `npm run server`
   - Start the desktop interface: `npm run electron:dev`

---

## 📖 Quick Tutorial: Managing Chats with AI

1. **Setup Business Data:** Go to **Settings** and ensure your Business Name, Shipping options, Payment options, and Product Catalog are populated. KIRA depends on this data to formulate replies.
2. **Enable AI on a Conversation:** By default, AI autopilot is disabled for safety on new chats. Toggle the AI to **Enabled** for a specific chat thread to activate KIRA.
3. **Autopilot Interaction:**
   - **Catalog inquiries:** When a customer asks about a product (e.g., *"How much is the niacinamide serum?"*), KIRA extracts the keyword, performs a lookup, and replies with the correct price and size.
   - **Order intent:** If the customer says *"I want to order"*, KIRA automatically sends the blank order form template.
4. **Human Handoff Trigger:**
   - If the customer says *"I have paid, here is the receipt"*, KIRA thanks them, reminds them to upload the proof of payment, and triggers a `[HANDOFF]`.
   - This pauses autopilot, flagging the conversation for a human agent to review the payment and advance the CRM status.
5. **Contextual Follow-Ups:** If a customer goes silent, click **Follow Up**. KIRA analyzes the chat history and drafts a gentle, personalized re-engagement message.

---

## 📖 Quick Tutorial: Running Ads & Market Research

1. Open the **Ads & Market Research** page.
2. Enter a niche, product category, keyword, page URL, or page name.
3. Choose the data basis, such as 50 ads or 100 Reddit posts.
4. Select the country/region and timeframe.
5. Enable the sources you want to inspect:
   - Meta Ads Library.
   - Google Trends.
   - TikTok Ads Library.
   - Reddit Search.
6. Start the research run.
7. Review the KPI cards, winning ad/content cards, Google query tables, TikTok ad cards, Reddit discussions, and AI-generated market analysis.
8. Use the findings to plan content angles, offers, posting structures, creative testing, and campaign strategy.
