# SteadySocial OS

SteadySocial OS is a powerful, locally-hosted Electron desktop application designed to act as an all-in-one Facebook Page CRM, AI Chat Assistant, and Content Management system. 

It automates customer inquiries using intelligent, context-aware AI (capable of extracting product details, managing order flows, and utilizing a natural Taglish persona), tracks leads through an automated sales funnel, and manages content campaigns securely from your local machine.

## 🚀 Features

- **Automated AI Messenger Assistant:** Handles product inquiries, order processing, and intelligently routes complex queries or payment verifications to human agents via a `[HANDOFF]` system.
- **Smart CRM & Funnel Tracking:** Automatically extracts customer details (Name, Contact, Address) from chat transcripts and updates their sales status (New → Ordering → Paid → Shipped).
- **Facebook Graph & Webhook Integration:** Syncs real-time messages and Facebook Lead Ads directly into your local database.
- **Content Canvases:** Plan, draft, and adapt social media content for various platforms.
- **MCP Server Included:** Features a built-in Model Context Protocol server, allowing external AI tools to interface with your CRM data and create planning files.

## 🛠️ Prerequisites

- **Node.js** (v18 or higher recommended)
- **Facebook Developer Account** (with a configured App for Page Access Tokens and Webhooks)
- **API Keys** for your preferred AI provider (OpenAI, Gemini, etc.) or a local model setup (WebLLM/LM Studio).

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

3. **Environment Setup:**
   Create a `.env` file in the root directory and add your necessary keys (e.g., `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `APP_ACCESS_TOKEN`, `FB_WEBHOOK_VERIFY_TOKEN`).

4. **Start the Application:**
   Run the development environment (starts Vite + Electron):
   ```bash
   npm run electron:dev
   ```

   *Note: Ensure the local Express backend server is running for API and Webhook capabilities:*
   ```bash
   npm run server
   ```

## 📚 Documentation

For a deep dive into the AI architecture, features, and a tutorial on how the automated chat pipeline works, please read the [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) file.
