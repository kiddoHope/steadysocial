# SteadySocial OS - System Overview Index

Welcome to the **SteadySocial OS** system documentation. SteadySocial OS is an all-in-one, desktop-based (Electron) Facebook Page CRM, AI Chat Assistant, and Content Management platform. 

This platform is specifically designed to empower social commerce businesses to automate customer support, process orders, manage leads, and plan social media content directly from a unified local environment.

---

## 🎯 Purpose of the System

By combining direct Facebook Graph API integrations, a local backend server, and advanced AI prompting strategies, SteadySocial OS significantly reduces the manual effort required to manage a busy Facebook page. 

It provides:
1. **Intelligent Automation:** An autonomous AI chat assistant (KIRA) running locally or via cloud APIs.
2. **Privacy & Control:** Local databases using JSONL files and IndexedDB to ensure data never leaves the user's control unless explicitly sent to Facebook.
3. **Streamlined Workflows:** Seamless handoffs between AI and human agents, combined with content planning canvases and campaign managers.

---

## 📚 Detailed Documentation Modules

The system's features and technical details have been divided into specialized, detailed documentation files:

| Document / Module | Description | Key Contents |
| :--- | :--- | :--- |
| 🏗️ [**Technical Architecture**](docs/architecture.md) | The system's underlying layout. | Electron, React, Express, IndexedDB Schema, and Local JSONL databases. |
| 🤖 [**KIRA Chat Assistant**](docs/messenger_ai_kira.md) | How the AI messaging assistant operates. | Safety rules (promos/payments), Prompt routing, Persona details, Handoff system. |
| 📊 [**CRM & Funnel Tracking**](docs/crm_funnel.md) | Managing customer pipelines and leads. | Sales statuses, Anti-downgrade safeguards, Lead Ads integration, Webhooks. |
| 🎨 [**Content & Campaigns**](docs/content_and_campaigns.md) | Campaign planning and social media scheduler. | Content canvases, AI platform adaptations, Campaigns, Post scheduling rules. |
| 🔌 [**MCP Server Integration**](docs/mcp_server.md) | Connecting external AI agents to the CRM. | Stdio transport architecture, Tool registers, and IDE configuration settings. |

---

## 🛠️ Quick Start Guide

### Prerequisites
1. **Node.js** (v18 or higher recommended).
2. **Facebook Developer Account** (with Page access and configured webhooks).
3. **LLM Provider API Key** (or a running local model on WebLLM / LM Studio).

### Setup Steps
1. **Install Dependencies:**
   ```bash
   npm install
   cd steadysocial-mcp-server
   npm install
   cd ..
   ```
2. **Environment Configuration:**
   Create a `.env` file in the root directory:
   ```env
   FACEBOOK_PAGE_ACCESS_TOKEN=your_page_token
   FACEBOOK_PAGE_ID=your_page_id
   APP_ACCESS_TOKEN=your_app_token
   FB_WEBHOOK_VERIFY_TOKEN=steadysocial_verify
   ```
3. **Run the Services:**
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
