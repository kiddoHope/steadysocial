# SteadySocial OS - Technical Architecture & Local Infrastructure

SteadySocial OS is built as a hybrid desktop-and-server application. It runs locally on the user's computer, prioritizing data privacy, low-latency performance, and offline-first state management, while integrating directly with Facebook APIs and local/cloud LLMs.

---

## 🏗️ Core Components Diagram

```mermaid
graph TD
    subgraph Client [Desktop client (Electron)]
        UI[React/Vite Frontend]
        IDB[(IndexedDB)]
        UI <--> IDB
    end

    subgraph Local Server [Node.js Express Backend]
        EX[Express App]
        ENV[.env Configuration]
        JSONL[(JSONL Files)]
        EX <--> JSONL
        EX <--> ENV
    end

    subgraph External [External Interfaces]
        FB[Facebook Graph API]
        LLM[LLM API Providers]
        MCP[External AI Agents via MCP]
    end

    UI <-->|HTTP / Web Sockets| EX
    EX <-->|REST / Graph API| FB
    UI <-->|REST API| LLM
    EX <-->|MCP Protocol| MCP
```

---

## 1. Frontend (Electron + React + Vite)

The frontend interface acts as the control center where agents monitor chats, view the CRM lead pipelines, manage content canvases, and configure automation settings.

- **Vite & React:** Powers a fast, responsive Single Page Application (SPA).
- **Electron:** Wraps the Vite application in a desktop container, enabling access to system resources and providing the foundation for a portable executable.
- **IndexedDB State Management (`steady-social-chat-db`):** 
  To ensure instant UI response times and offline reliability, SteadySocial OS utilizes IndexedDB for local chat metadata, conversation configurations, and product/business settings.
  
  ### IndexedDB Schema Detail
  The database uses three main object stores:
  
  #### A. `conversation_statuses` (Key: `conversationId`)
  Tracks metadata, autopilot settings, and AI state for each conversation.
  - `status`: `'none' | 'unread' | 'read'`
  - `isAiDisabled`: `'enabled' | 'disabled'` (Controls whether the KIRA autopilot replies automatically to incoming webhooks)
  - `isImportant`: `boolean` (Flags high-priority conversations)
  - `remarks`: `string` (Custom agent notes passed directly into LLM context)
  - `customerStatus`: `'New' | 'Inquiry' | 'Ordering' | 'Paid' | 'Shipped' | 'Completed'` (CRM funnel position)
  - `orderHistory`: `any[]` (Record of customer checkout history)
  - `customerDetails`: `{ fullName?, contactNumber?, address?, email? }` (Extracted CRM properties)
  - `tags`: `string[]` (Custom organizational tags, e.g., `VIP`, `hot_lead`)
  - `sentiment`: `'positive' | 'neutral' | 'negative' | undefined` (Calculated final sentiment state)
  - `autopilotMode`: `'continuous' | 'single_shot' | 'follow_up'`
  - `followUpTone`: `string` (Tone context used when drafting follow-ups, defaults to `warm`)

  #### B. `business_data` (Key: `id` = `'current'`)
  Caches business profile parameters, specifically:
  - Business Name
  - Shipping Policies & Shipping Methods
  - Payment Details & Payment Methods

  #### C. `product_data` (Key: `id` = `'current'`)
  Caches the product catalog structure containing:
  - Product Categories
  - Products list (with SKU, size, brand, and pricing details)

---

## 2. Local Backend (Express Node.js Server)

The local backend runs in the background on port `3001`. It handles local file operations, manages raw file databases, processes incoming webhooks, and wraps Facebook Graph API calls to bypass CORS restrictions.

- **Storage Location:** 
  - In production (Electron build), data files are stored in the application's secure user-data directory (`userData/data`).
  - In development, files fall back to the root `data/` directory.
- **JSONL (JSON Lines) File System:**
  Local data persistence uses simple, highly performant line-by-line JSON files:
  - `users.jsonl`: User profiles, credentials, and settings (e.g., UI theme preferences).
  - `settings.jsonl`: Redacted API credentials, Page IDs, and system integrations.
  - `leads.jsonl`: Flat-file registry of CRM leads (including Facebook Lead Ads metadata).
  - `campaigns.jsonl` & `automations.jsonl`: Campaign schedules and automation rules.
  - `canvases.jsonl`: Content canvas blueprints and draft posts.

---

## 3. External API & Integration Layer

### Facebook Graph API
The system targets version `v21.0` of the Facebook Graph API to manage:
- Messenger pages, threads, and sending replies.
- Retrieving page subscriber insights, fans, and analytics.
- Publishing feed posts (including attachments/images).
- Retrieving and listing forms (`leadgen_forms`) and their respective submissions.

### Multi-LLM Orchestration
SteadySocial OS offers configuration options to route prompts based on preference and privacy:
- **Cloud Providers:** OpenAI (GPT models) and Google Gemini (Gemini models) via standard HTTP REST APIs.
- **Local Providers:** Privacy-first offline execution via WebLLM or LM Studio (interacting via a local port).
