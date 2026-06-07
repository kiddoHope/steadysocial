import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { steadysocialClient } from './steadysocialClient.js';
import { RemotionClient } from './remotionClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ROOT_SKILLS_DIR = path.join(ROOT_DIR, 'skills');

function resolveSkillsDir() {
  const candidates = [
    path.join(process.cwd(), 'skills'),
    ROOT_SKILLS_DIR,
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return ROOT_SKILLS_DIR;
}

function listSkillFiles(dir: string, relative = ''): string[] {
  const entries: string[] = [];

  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name);
    const relPath = relative ? path.join(relative, name) : name;
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      entries.push(...listSkillFiles(filePath, relPath));
    } else if (stat.isFile() && ['.md', '.mdx'].includes(path.extname(name).toLowerCase())) {
      entries.push(relPath);
    }
  }

  return entries;
}

const PRESENTATIONS_FILE = path.join(ROOT_DIR, 'data', 'presentations.jsonl');

async function appendPresentation(presentation: any) {
  await fs.promises.mkdir(path.dirname(PRESENTATIONS_FILE), { recursive: true });
  await fs.promises.appendFile(PRESENTATIONS_FILE, JSON.stringify(presentation) + '\n', 'utf-8');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildDefaultSlideMarkup(slide: { title?: string; content: string }, index: number, totalSlides: number, theme: string) {
  const safeTitle = escapeHtml(slide.title || `Slide ${index + 1}`)
  const rawLines = slide.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const bullets = rawLines.filter((line) => /^([0-9]+\.|[-*•])\s+/.test(line)).map((line) => escapeHtml(line.replace(/^([0-9]+\.|[-*•])\s+/, '')))
  const lines = bullets.length > 0 ? bullets : rawLines.map(escapeHtml)
  const firstLine = lines[0] || ''
  const secondLine = lines[1] || ''
  const thirdLine = lines[2] || ''

  const themeClasses = {
    'neo-brutalist': 'from-[#0f172a] via-[#1e293b] to-[#334155] text-white',
    minimal: 'bg-white text-slate-950',
    gradient: 'from-sky-500 via-indigo-500 to-violet-600 text-white',
  }[theme] || 'from-slate-900 via-slate-800 to-slate-700 text-white'

  const listItemsHtml = lines
    .map((line) => `<li class="mb-3 leading-7">${line}</li>`)
    .join('')

  if (index === 0) {
    return `
<div class="w-full h-full relative overflow-hidden bg-gradient-to-br ${themeClasses} p-10">
  <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.24),_transparent_35%)]"></div>
  <div class="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.12),_transparent_30%)]"></div>
  <div class="relative z-10 flex h-full flex-col justify-center gap-10">
    <div class="max-w-4xl space-y-6 animate-fade-in">
      <div class="inline-flex items-center gap-3 rounded-full bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.35em] opacity-80">
        <span>Launch Deck</span>
        <span class="font-black">${index + 1}/${totalSlides}</span>
      </div>
      <h1 class="text-6xl md:text-7xl font-black leading-tight tracking-tight max-w-3xl">${safeTitle}</h1>
      <p class="max-w-3xl text-xl leading-9 opacity-90">${firstLine || 'A bold visual summary with layered UI, narrative cards and strong visual hierarchy.'}</p>
    </div>

    <div class="grid gap-6 md:grid-cols-3 animate-slide-up">
      <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl">
        <div class="text-xs uppercase tracking-[0.35em] opacity-70 mb-3">Market</div>
        <p class="font-black text-2xl leading-tight">${secondLine || 'Deep insights'}</p>
      </div>
      <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl">
        <div class="text-xs uppercase tracking-[0.35em] opacity-70 mb-3">Focus</div>
        <p class="font-black text-2xl leading-tight">${thirdLine || 'Fast execution'}</p>
      </div>
      <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl">
        <div class="text-xs uppercase tracking-[0.35em] opacity-70 mb-3">Impact</div>
        <p class="font-black text-2xl leading-tight">${lines[3] || 'Better outcomes'}</p>
      </div>
    </div>
  </div>
</div>
    `.trim()
  }

  return `
<div class="w-full h-full relative overflow-hidden bg-gradient-to-br ${themeClasses} p-10">
  <div class="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_35%)]"></div>
  <div class="relative z-10 h-full flex flex-col justify-between gap-8">
    <div class="grid gap-8 lg:grid-cols-[1.9fr_1fr]">
      <div class="space-y-6 animate-fade-in">
        <div class="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.35em] opacity-80">
          <span>Slide ${index + 1}</span>
          <span class="font-black">${safeTitle}</span>
        </div>
        <h2 class="text-5xl font-black leading-tight max-w-3xl">${safeTitle}</h2>
        <p class="max-w-3xl text-lg leading-8 opacity-90">${firstLine}</p>
      </div>
      <div class="space-y-6">
        <div class="rounded-[2rem] bg-white/10 p-8 ring-1 ring-white/15 backdrop-blur shadow-xl animate-slide-up">
          <div class="text-sm uppercase tracking-[0.35em] opacity-80 mb-4">Key takeaways</div>
          <ul class="list-disc list-inside space-y-3 text-base leading-7">
            ${listItemsHtml}
          </ul>
        </div>
        <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl grid gap-4 sm:grid-cols-2 animate-fade-in">
          <div class="rounded-3xl bg-black/15 p-4">
            <div class="text-xs uppercase tracking-[0.35em] opacity-80 mb-2">Insight</div>
            <p class="font-black leading-7">${secondLine || 'Clarify the most important outcome.'}</p>
          </div>
          <div class="rounded-3xl bg-black/15 p-4">
            <div class="text-xs uppercase tracking-[0.35em] opacity-80 mb-2">Action</div>
            <p class="font-black leading-7">${thirdLine || 'What we do next.'}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl animate-slide-up">
        <div class="text-xs uppercase tracking-[0.35em] opacity-80 mb-3">Visual design</div>
        <p class="text-base leading-7 opacity-90">This deck uses bold typography, layered cards, and modern UI panels for a presentation-ready look.</p>
      </div>
      <div class="rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur shadow-xl animate-fade-in">
        <div class="text-xs uppercase tracking-[0.35em] opacity-80 mb-3">Structure</div>
        <p class="text-base leading-7 opacity-90">Each slide is designed to show a clear headline, summary, and supporting detail panels.</p>
      </div>
    </div>
  </div>
</div>
  `.trim()
}

const server = new McpServer({
  name: 'steadysocial-mcp-server',
  version: '1.0.0',
});

server.tool(
  'steadysocial_health_check',
  'Check if the SteadySocial local backend is running.',
  {},
  async () => {
    const result = await steadysocialClient.getHealth();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_campaigns',
  'List all SteadySocial campaigns.',
  {},
  async () => {
    const campaigns = await steadysocialClient.getCampaigns();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(campaigns, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_campaign',
  'Create a new SteadySocial campaign.',
  {
    name: z.string().describe('Campaign name'),
    budget: z.string().optional().describe('Campaign budget, for example ₱5000'),
    status: z.enum(['ACTIVE', 'DRAFT', 'COMPLETED']).optional(),
    startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
    endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
  },
  async (input) => {
    const campaign = await steadysocialClient.createCampaign(input);

    return {
      content: [
        {
          type: 'text',
          text: `Campaign created:\n${JSON.stringify(campaign, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'update_campaign',
  'Update an existing SteadySocial campaign.',
  {
    id: z.string().describe('Campaign ID'),
    name: z.string().optional(),
    budget: z.string().optional(),
    status: z.enum(['ACTIVE', 'DRAFT', 'COMPLETED']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  },
  async ({ id, ...updates }) => {
    const campaign = await steadysocialClient.updateCampaign(id, updates);

    return {
      content: [
        {
          type: 'text',
          text: `Campaign updated:\n${JSON.stringify(campaign, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'delete_campaign',
  'Delete a SteadySocial campaign by ID.',
  {
    id: z.string().describe('Campaign ID'),
  },
  async ({ id }) => {
    await steadysocialClient.deleteCampaign(id);

    return {
      content: [
        {
          type: 'text',
          text: `Campaign deleted: ${id}`,
        },
      ],
    };
  }
);

server.tool(
  'get_automations',
  'List all SteadySocial automation rules.',
  {},
  async () => {
    const automations = await steadysocialClient.getAutomations();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(automations, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_automation',
  'Create a SteadySocial automation rule.',
  {
    name: z.string(),
    trigger: z
      .string()
      .optional()
      .describe('Example: NEW_MESSAGE_RECEIVED, NEW_LEAD_ADDED, DAILY_SCHEDULE'),
    action: z
      .string()
      .optional()
      .describe('Example: SEND_AUTO_REPLY, TAG_LEAD_HOT, NOTIFY_TEAM'),
    actionValue: z.string().optional(),
    isEnabled: z.boolean().optional(),
  },
  async (input) => {
    const automation = await steadysocialClient.createAutomation(input);

    return {
      content: [
        {
          type: 'text',
          text: `Automation created:\n${JSON.stringify(automation, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'update_automation',
  'Update a SteadySocial automation rule.',
  {
    id: z.string(),
    name: z.string().optional(),
    trigger: z.string().optional(),
    action: z.string().optional(),
    actionValue: z.string().optional(),
    isEnabled: z.boolean().optional(),
  },
  async ({ id, ...updates }) => {
    const automation = await steadysocialClient.updateAutomation(id, updates);

    return {
      content: [
        {
          type: 'text',
          text: `Automation updated:\n${JSON.stringify(automation, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'delete_automation',
  'Delete a SteadySocial automation rule by ID.',
  {
    id: z.string(),
  },
  async ({ id }) => {
    await steadysocialClient.deleteAutomation(id);

    return {
      content: [
        {
          type: 'text',
          text: `Automation deleted: ${id}`,
        },
      ],
    };
  }
);

server.tool(
  'get_canvases',
  'List saved SteadySocial content canvases.',
  {},
  async () => {
    const canvases = await steadysocialClient.getCanvases();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(canvases, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_facebook_settings',
  'Get saved Facebook connection settings. Tokens may be redacted.',
  {},
  async () => {
    const settings = await steadysocialClient.getFacebookSettings();

    const redacted = {
      ...settings,
      accessToken: settings?.accessToken ? '[REDACTED]' : undefined,
      pageAccessToken: settings?.pageAccessToken ? '[REDACTED]' : undefined,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(redacted, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_scheduler_history',
  'List Facebook scheduler history from SteadySocial.',
  {},
  async () => {
    const history = await steadysocialClient.getSchedulerHistory();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(history, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_scheduler_task',
  'Create a tactical scheduler task in SteadySocial with optional milestones.',
  {
    text: z.string().describe('Task title or summary'),
    description: z.string().optional().describe('Optional task description'),
    dueDate: z.string().optional().describe('Due date in YYYY-MM-DD or ISO format'),
    priority: z
      .enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
      .optional()
      .describe('Task priority'),
    status: z
      .enum(['SCHEDULED', 'COMPLETED', 'IN_PROGRESS', 'PENDING'])
      .optional()
      .describe('Task status'),
    page: z.string().optional().describe('Optional planning page or tactical context'),
    milestones: z
      .array(z.string())
      .optional()
      .describe('List of milestone labels'),
    completionPercentage: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Optional completion percentage for the task'),
    tags: z
      .array(z.string())
      .optional()
      .describe('List of tags for task categorization'),
  },
  async (input) => {
    const due = input.dueDate ? new Date(input.dueDate) : new Date();
    const time = Number.isNaN(due.valueOf()) ? new Date().toISOString() : due.toISOString();
    const milestones = (input.milestones || []).map((label) => ({ label, completed: false }));
 
    const schedulerTask = {
      text: input.text,
      description: input.description || '',
      time,
      page: input.page || 'TACTICAL_SCHEDULER',
      type: 'TASK',
      priority: input.priority || 'MEDIUM',
      status: input.status || 'SCHEDULED',
      milestones,
      completionPercentage:
        input.completionPercentage !== undefined
          ? input.completionPercentage
          : milestones.length > 0
          ? 0
          : undefined,
      tags: input.tags || [],
    };
 
    const created = await steadysocialClient.createSchedulerEntry(schedulerTask);

    return {
      content: [
        {
          type: 'text',
          text: `Scheduler task created successfully:\n${JSON.stringify(created, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'get_planning_files',
  'List files and folders in the Steadysocial planning workspace.',
  {
    path: z.string().optional().describe('Relative path to list, empty for root directory'),
  },
  async ({ path }) => {
    const files = await steadysocialClient.getPlanningFiles(path);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(files, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_planning_file_content',
  'Get the content of a specific planning file from Steadysocial.',
  {
    path: z.string().describe('Relative path to the file to read'),
  },
  async ({ path }) => {
    const content = await steadysocialClient.getPlanningFileContent(path);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_planning_file',
  'Create or write a planning file inside the foldering system. For .md files, use Obsidian-like syntax: [[File Name]] for bidirectional linking to other documents, and #tags (e.g. #strategy) for easy categorization and filtering.',
  {
    path: z.string().describe('Relative path including filename and optional folder hierarchy (e.g. "Q3_Strategy/marketing_plan.md")'),
    type: z.enum(['md', 'docx', 'xlsx', 'csv', 'html', 'pdf']).describe('File format: md, docx, xlsx, csv, html (visualization/slides), pdf'),
    content: z.any().describe('The content of the file. For md/csv/html: a full text or markdown string. For html, this may include the complete <html><head><style>...</style></head><body>...</body></html> page with custom animations and CSS. For xlsx: an object { sheetName?: string, data: any[][] } representing rows. For docx/pdf: either text or html string.'),
    isBase64: z.boolean().optional().describe('Whether the content is a base64-encoded binary string (optional)'),
  },
  async (input) => {
    const result = await steadysocialClient.createPlanningFile(input);

    return {
      content: [
        {
          type: 'text',
          text: `Planning file created successfully:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'edit_planning_file',
  'Edit an existing planning file in the foldering system. Supports either a complete overwrite or finding and replacing a specific text block.',
  {
    path: z.string().describe('Relative path including filename (e.g. "Q3_Strategy/marketing_plan.md")'),
    type: z.enum(['md', 'docx', 'xlsx', 'csv', 'html', 'pdf']).describe('File format'),
    editType: z.enum(['overwrite', 'find_replace']).describe('Type of edit: "overwrite" to completely replace content, "find_replace" for targeted search and replace'),
    content: z.any().optional().describe('New content if editType is "overwrite". For md/csv/html: full text. For xlsx: { sheetName?: string, data: any[][] }'),
    targetContent: z.string().optional().describe('Exact text/block to be replaced (required for "find_replace")'),
    replacementContent: z.string().optional().describe('Text to replace the targetContent with (required for "find_replace")'),
    isBase64: z.boolean().optional().describe('Whether the content is a base64-encoded binary string (optional)'),
  },
  async (input) => {
    if (input.editType === 'overwrite') {
      if (input.content === undefined) {
        throw new Error('content is required when editType is "overwrite"');
      }
      const result = await steadysocialClient.createPlanningFile({
        path: input.path,
        type: input.type,
        content: input.content,
        isBase64: input.isBase64,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Planning file updated successfully via overwrite:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } else {
      if (!input.targetContent || input.replacementContent === undefined) {
        throw new Error('targetContent and replacementContent are required when editType is "find_replace"');
      }
      
      // Get existing content
      const fileData = await steadysocialClient.getPlanningFileContent(input.path);
      if (!fileData) {
        throw new Error(`Failed to load content for planning file at path: ${input.path}`);
      }

      let currentText = '';
      if (input.type === 'md') {
        currentText = fileData.content || '';
      } else if (input.type === 'html') {
        currentText = fileData.html || '';
      } else {
        throw new Error(`find_replace edit type is only supported for text formats (md, html). Got: ${input.type}`);
      }

      if (!currentText.includes(input.targetContent)) {
        throw new Error(`Target content to replace not found in the file: "${input.targetContent}"`);
      }

      const updatedText = currentText.replace(input.targetContent, input.replacementContent);

      const result = await steadysocialClient.createPlanningFile({
        path: input.path,
        type: input.type,
        content: updatedText,
        isBase64: input.isBase64,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Planning file edited successfully via find_replace:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    }
  }
);

server.tool(
  'search_planning_workspace',
  'Search the planning workspace for files containing a specific query, #tag, or [[link]].',
  {
    query: z.string().describe('The keyword, #tag, or [[link]] to search for.'),
  },
  async ({ query }) => {
    const results = await steadysocialClient.searchPlanningWorkspace(query);
    
    return {
      content: [
        {
          type: 'text',
          text: `Search results for "${query}":\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'create_canvas',
  'Create a new SteadySocial content canvas.',
  {
    title: z.string().optional().describe('Title of the canvas'),
    status: z.string().optional().describe('Status (e.g., draft, review, ready)'),
    createdBy: z.string().optional().describe('Author of the canvas'),
    imageFilePath: z.string().optional().describe('Optional absolute path to a local image file to use as the overall canvas preview.'),
    imageUrl: z.string().optional().describe('Optional image URL to use as the overall canvas preview.'),
    overallImagePreview: z.string().optional().describe('Optional data URL or direct preview string for the canvas image.'),
    overallCustomPrompt: z.string().optional().describe('System prompt context / custom instructions for generating captions for this canvas.'),
    overallTone: z.string().optional().describe('Overall tone of voice (e.g. Friendly, Professional, Witty, Playful, Empathy, Inspirational, Urgent).'),
    overallPlatformContext: z.string().optional().describe('Target social media platform (e.g. Facebook, Instagram, X, LinkedIn, TikTok, General).'),
  },
  async (input) => {
    let overallImagePreview = input.overallImagePreview || input.imageUrl || null;
    if (input.imageFilePath) {
      if (!fs.existsSync(input.imageFilePath)) {
        throw new Error(`File not found: ${input.imageFilePath}`);
      }
      const buffer = fs.readFileSync(input.imageFilePath);
      const ext = path.extname(input.imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      overallImagePreview = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const canvas = await steadysocialClient.createCanvas({
      title: input.title,
      status: input.status,
      createdBy: input.createdBy,
      overallImagePreview,
      overallCustomPrompt: input.overallCustomPrompt,
      overallTone: input.overallTone,
      overallPlatformContext: input.overallPlatformContext,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Canvas created successfully:\n${JSON.stringify(canvas, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'update_canvas',
  'Update an existing SteadySocial content canvas.',
  {
    canvasId: z.string().describe('The ID of the canvas'),
    title: z.string().optional().describe('New title for the canvas'),
    status: z.string().optional().describe('New status (e.g., draft, review, ready)'),
    imageFilePath: z.string().optional().describe('Optional absolute path to a local image file to use as the overall canvas preview.'),
    overallImagePreview: z.string().optional().describe('Optional public image URL to use as the overall canvas preview.'),
    overallCustomPrompt: z.string().optional().describe('New custom prompt/instructions for the canvas.'),
    overallTone: z.string().optional().describe('New tone (e.g. Friendly, Professional, Witty, Playful, Empathy, Inspirational, Urgent).'),
    overallPlatformContext: z.string().optional().describe('New target platform.'),
  },
  async ({ canvasId, imageFilePath, ...updates }) => {
    let overallImagePreview = updates.overallImagePreview;
    if (imageFilePath) {
      if (!fs.existsSync(imageFilePath)) {
        throw new Error(`File not found: ${imageFilePath}`);
      }
      const buffer = fs.readFileSync(imageFilePath);
      const ext = path.extname(imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      overallImagePreview = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const canvas = await steadysocialClient.updateCanvas(canvasId, {
      ...updates,
      overallImagePreview,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Canvas updated successfully:\n${JSON.stringify(canvas, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'add_item_to_canvas',
  'Add a generated item/caption to an existing SteadySocial content canvas.',
  {
    canvasId: z.string().describe('The ID of the canvas'),
    itemType: z.string().describe('Type of item, e.g., caption, idea, post'),
    content: z.string().describe('The text content (e.g. caption)'),
    platform: z.string().optional().describe('Platform e.g. facebook, instagram'),
    imageUrl: z.string().optional().describe('Optional image URL to attach to the item'),
    imageFilePath: z.string().optional().describe('Optional absolute path to a local image file. Will be converted and stored in the canvas.'),
  },
  async (input) => {
    let imageDataUrl;
    if (input.imageFilePath) {
      if (!fs.existsSync(input.imageFilePath)) {
        throw new Error(`File not found: ${input.imageFilePath}`);
      }
      const buffer = fs.readFileSync(input.imageFilePath);
      const ext = path.extname(input.imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const canvases = await steadysocialClient.getCanvases();
    const canvas = canvases.find(c => c.id === input.canvasId);
    if (!canvas) throw new Error("Canvas not found");

    let platformContext = 'General Platform';
    if (input.platform) {
      const pLower = input.platform.toLowerCase();
      if (pLower === 'facebook') platformContext = 'Facebook';
      else if (pLower === 'instagram') platformContext = 'Instagram';
      else if (pLower === 'x' || pLower === 'twitter') platformContext = 'X (formerly Twitter)';
      else if (pLower === 'linkedin') platformContext = 'LinkedIn';
      else if (pLower === 'tiktok') platformContext = 'TikTok';
    } else if (canvas.overallPlatformContext) {
      platformContext = canvas.overallPlatformContext;
    }

    const newItem = {
      id: `item_${Date.now()}`,
      originalText: input.content,
      imagePreview: imageDataUrl || input.imageUrl || null,
      adaptations: {},
      baseTone: canvas.overallTone || 'Friendly',
      basePlatformContext: platformContext,
    };

    const updatedItems = [...(canvas.items || []), newItem];

    const updated = await steadysocialClient.updateCanvas(input.canvasId, {
      items: updatedItems,
      ...(imageDataUrl ? { overallImagePreview: imageDataUrl } : {})
    });

    return {
      content: [
        {
          type: 'text',
          text: `Item added to canvas successfully:\n${JSON.stringify(updated, null, 2)}`
        }
      ]
    }
  }
);

server.tool(
  'delete_canvas',
  'Delete a SteadySocial content canvas by ID.',
  {
    canvasId: z.string().describe('The ID of the canvas'),
  },
  async ({ canvasId }) => {
    await steadysocialClient.deleteCanvas(canvasId);

    return {
      content: [
        {
          type: 'text',
          text: `Canvas deleted: ${canvasId}`,
        },
      ],
    };
  }
);

server.tool(
  'create_facebook_post',
  'Publish a post directly to the configured Facebook Page.',
  {
    message: z.string().optional().describe('The text content of the post'),
    link: z.string().optional().describe('Optional URL to link to'),
    imageUrl: z.string().optional().describe('Optional URL of an image to post. If provided, creates a photo post instead of a regular feed post.'),
    imageFilePath: z.string().optional().describe('Optional absolute path to a local image file. Will be uploaded automatically.'),
  },
  async (input) => {
    let imageDataUrl;
    if (input.imageFilePath) {
      if (!fs.existsSync(input.imageFilePath)) {
        throw new Error(`File not found: ${input.imageFilePath}`);
      }
      const buffer = fs.readFileSync(input.imageFilePath);
      const ext = path.extname(input.imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const result = await steadysocialClient.createFacebookPost({
      message: input.message,
      link: input.link,
      imageUrl: input.imageUrl,
      imageDataUrl,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Facebook post created successfully:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
);


server.tool(
  'schedule_facebook_post',
  'Schedule a post to be published on the Facebook Page at a later time.',
  {
    message: z.string().optional().describe('The text content of the post'),
    link: z.string().optional().describe('Optional URL to link to'),
    imageUrl: z.string().optional().describe('Optional URL of an image to post.'),
    imageFilePath: z.string().optional().describe('Optional absolute path to a local image file. Will be uploaded automatically.'),
    scheduledPublishTime: z.number().describe('Unix timestamp (in seconds) for when the post should be published (e.g., 1735689600). Must be between 10 minutes and 75 days from now.'),
  },
  async (input) => {
    let imageDataUrl;
    if (input.imageFilePath) {
      if (!fs.existsSync(input.imageFilePath)) {
        throw new Error(`File not found: ${input.imageFilePath}`);
      }
      const buffer = fs.readFileSync(input.imageFilePath);
      const ext = path.extname(input.imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const result = await steadysocialClient.scheduleFacebookPost({
      message: input.message,
      link: input.link,
      imageUrl: input.imageUrl,
      scheduledPublishTime: input.scheduledPublishTime,
      imageDataUrl,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Facebook post scheduled successfully:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'read_local_image',
  'Read a local image file and return its base64 data URL (useful for AI vision tasks).',
  {
    imageFilePath: z.string().describe('Absolute path to a local image file.'),
  },
  async ({ imageFilePath }) => {
    try {
      if (!fs.existsSync(imageFilePath)) {
        throw new Error(`File not found: ${imageFilePath}`);
      }
      const buffer = fs.readFileSync(imageFilePath);
      const ext = path.extname(imageFilePath).substring(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      return {
        content: [
          { type: 'text', text: imageDataUrl }
        ]
      };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);

server.tool(
  'get_skills',
  'List available skills in the skills directory.',
  {},
  async () => {
    try {
      const skillsDir = resolveSkillsDir();
      if (!fs.existsSync(skillsDir)) {
        return { content: [{ type: 'text', text: JSON.stringify([]) }] };
      }
      const files = listSkillFiles(skillsDir);
      return {
        content: [
          { type: 'text', text: JSON.stringify(files, null, 2) }
        ]
      };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);

server.tool(
  'get_skill_content',
  'Get the content of a specific skill file.',
  {
    filename: z.string().describe('The filename of the skill (e.g., my-skill.md or my-skills/brainstorming/skill.md)'),
  },
  async ({ filename }) => {
    try {
      const skillsDir = resolveSkillsDir();
      const normalizedFilename = path.normalize(filename);
      const filePath = path.resolve(skillsDir, normalizedFilename);
      const resolvedSkillsDir = path.resolve(skillsDir);

      if (!filePath.startsWith(resolvedSkillsDir + path.sep)) {
        throw new Error('Invalid skill filename');
      }
      if (!fs.existsSync(filePath)) {
        throw new Error('Skill not found');
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        content: [{ type: 'text', text: content }]
      };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);


server.tool(
  'extract_tasks_from_planning',
  'Extract tasks from a planning file. Supports markdown checkbox syntax: - [ ] Task Name | due: 2026-05-30 | priority: HIGH | milestones: Step1,Step2',
  {
    filePath: z.string().describe('Relative path to the planning file (e.g., "Perfume_Business_Strategy.md")'),
  },
  async ({ filePath }) => {
    const result = await steadysocialClient.extractTasksFromPlanning(filePath);

    return {
      content: [
        {
          type: 'text',
          text: `Extracted ${result.taskCount} tasks from planning file:
${JSON.stringify(result.tasks, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'create_tasks_from_planning',
  'Extract tasks from a planning file and create them in the SteadySocial scheduler with milestones and priorities.',
  {
    filePath: z.string().describe('Relative path to the planning file'),
    autoSchedule: z.boolean().optional().describe('Whether to automatically schedule tasks based on due dates (default: true)'),
  },
  async ({ filePath, autoSchedule = true }) => {
    const extracted = await steadysocialClient.extractTasksFromPlanning(filePath);
    
    if (extracted.taskCount === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No tasks found in the planning file. Use format: - [ ] Task Name | due: YYYY-MM-DD | priority: HIGH | milestones: Step1,Step2',
          },
        ],
      };
    }

    const createdTasks = [];
    for (const task of extracted.tasks) {
      try {
        const schedulerTask = {
          text: task.text,
          description: task.description,
          time: task.dueDate || new Date().toISOString(),
          page: task.page,
          type: 'TASK',
          priority: task.priority,
          status: 'SCHEDULED',
          milestones: task.milestones,
          implementationFile: filePath,
          completionPercentage: task.completed ? 100 : 0,
        };

        const created = await steadysocialClient.createSchedulerEntry(schedulerTask);
        createdTasks.push(created);
      } catch (error) {
        console.error(`Failed to create task "${task.text}":`, error);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created ${createdTasks.length} tasks from planning file "${filePath}":
${JSON.stringify(createdTasks, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'get_boards',
  'List all boards in the workspace.',
  {},
  async () => {
    const result = await steadysocialClient.getBoards();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.boards || [], null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_board',
  'Get the card, connector, and layout state of a specific board.',
  {
    name: z.string().describe('Board name'),
  },
  async ({ name }) => {
    const state = await steadysocialClient.getBoardState(name);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_board',
  'Create a new board with optional initial cards and connectors.',
  {
    name: z.string().describe('Name of the board to create'),
    cards: z.array(z.any()).optional().describe('Optional list of cards: [{ id: string, type: "sticky"|"image"|"text"|"chart"|"code"|"table"|"shape"|"diagram"|"frame", x: number, y: number, width: number, height: number, content: any, color?: string }]'),
    connectors: z.array(z.any()).optional().describe('Optional list of connectors between cards: [{ id: string, from: string, to: string, label?: string, color?: string, strokeWidth?: number, dashed?: boolean }]'),
  },
  async ({ name, cards = [], connectors = [] }) => {
    const state = {
      cards,
      connectors,
      tool: 'select',
      isFocusMode: false,
      viewport: { x: 240, y: 130, scale: 1 },
    };
    await steadysocialClient.updateBoardState(name, state);
    return {
      content: [
        {
          type: 'text',
          text: `Board "${name}" created successfully with ${cards.length} cards and ${connectors.length} connectors.`,
        },
      ],
    };
  }
);

server.tool(
  'update_board',
  'Update a board\'s card and connector layout.',
  {
    name: z.string().describe('Name of the board to update'),
    cards: z.array(z.any()).optional().describe('Full list of updated cards'),
    connectors: z.array(z.any()).optional().describe('Full list of updated connectors'),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        scale: z.number(),
      })
      .optional()
      .describe('Viewport translation and zoom'),
  },
  async ({ name, cards, connectors, viewport }) => {
    const currentState = await steadysocialClient.getBoardState(name);
    const updatedState = {
      ...currentState,
      cards: cards !== undefined ? cards : currentState.cards,
      connectors: connectors !== undefined ? connectors : currentState.connectors,
      viewport: viewport !== undefined ? viewport : currentState.viewport,
    };
    await steadysocialClient.updateBoardState(name, updatedState);
    return {
      content: [
        {
          type: 'text',
          text: `Board "${name}" updated successfully.`,
        },
      ],
    };
  }
);

server.tool(
  'rename_board',
  'Rename an existing board.',
  {
    name: z.string().describe('Current board name'),
    newName: z.string().describe('New name of the board'),
  },
  async ({ name, newName }) => {
    await steadysocialClient.renameBoard(name, newName);
    return {
      content: [
        {
          type: 'text',
          text: `Board "${name}" renamed to "${newName}" successfully.`,
        },
      ],
    };
  }
);

server.tool(
  'delete_board',
  'Delete a board by name.',
  {
    name: z.string().describe('Name of the board to delete'),
  },
  async ({ name }) => {
    await steadysocialClient.deleteBoard(name);
    return {
      content: [
        {
          type: 'text',
          text: `Board "${name}" deleted successfully.`,
        },
      ],
    };
  }
);

server.tool(
  'import_crm_leads_to_board',
  'Fetch CRM leads and add them as a table card to a board. Optionally filter by status (NEW, CONTACTED, QUALIFIED, WON, LOST).',
  {
    boardName: z.string().describe('Name of the board to add the card to'),
    filterStatus: z
      .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'])
      .optional()
      .describe('Only import leads with this status. Omit to import all leads.'),
    cardX: z.number().optional().describe('X position on board (default: 300)'),
    cardY: z.number().optional().describe('Y position on board (default: 200)'),
  },
  async ({ boardName, filterStatus, cardX = 300, cardY = 200 }) => {
    const allLeads = await steadysocialClient.getLeads();
    const leads = filterStatus
      ? allLeads.filter((l: any) => l.status === filterStatus)
      : allLeads;

    if (leads.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: filterStatus
              ? `No CRM leads found with status "${filterStatus}".`
              : 'No CRM leads found.',
          },
        ],
      };
    }

    const currentState = await steadysocialClient.getBoardState(boardName);

    const newCard = {
      id: `crm-import-${Date.now()}`,
      type: 'table',
      x: cardX,
      y: cardY,
      width: 620,
      height: Math.min(60 + leads.length * 36, 500),
      color: '#ffffff',
      content: {
        view: 'grid',
        columns: ['Full Name', 'Age', 'Gender', 'Email', 'Contact', 'Address'],
        rows: leads.map((l: any) => [
          l.name || '',
          l.age ? String(l.age) : '',
          l.gender || '',
          l.email || '',
          l.phone || '',
          l.address || '',
        ]),
      },
    };

    const updatedState = {
      ...currentState,
      cards: [...(currentState.cards || []), newCard],
    };

    await steadysocialClient.updateBoardState(boardName, updatedState);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added ${leads.length} CRM lead${leads.length === 1 ? '' : 's'} as a table card to board "${boardName}".`,
        },
      ],
    };
  }
);

server.tool(
  'import_planning_file_to_board',
  'Read a planning file and add its content as a sticky note card to a board.',
  {
    boardName: z.string().describe('Name of the board to add the card to'),
    filePath: z.string().describe('Path to the planning file (e.g. "strategy/Q3.md")'),
    cardX: z.number().optional().describe('X position on board (default: 300)'),
    cardY: z.number().optional().describe('Y position on board (default: 200)'),
    maxChars: z
      .number()
      .optional()
      .describe('Maximum characters to include from the file content (default: 600)'),
  },
  async ({ boardName, filePath, cardX = 300, cardY = 200, maxChars = 600 }) => {
    const fileResult = await steadysocialClient.getPlanningFileContent(filePath);

    const rawText =
      fileResult.content ||
      (fileResult.html
        ? fileResult.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
        : '') ||
      '';

    if (!rawText.trim()) {
      return {
        content: [
          {
            type: 'text',
            text: `Planning file "${filePath}" is empty or could not be read.`,
          },
        ],
      };
    }

    const preview = rawText.slice(0, maxChars);
    const fileName = filePath.split('/').pop() || filePath;
    const currentState = await steadysocialClient.getBoardState(boardName);

    const newCard = {
      id: `planning-import-${Date.now()}`,
      type: 'sticky',
      x: cardX,
      y: cardY,
      width: 260,
      height: 240,
      color: '#e0e7ff',
      content: {
        text: `📄 ${fileName}\n\n${preview}`,
        backgroundColor: '#e0e7ff',
        textColor: '#1e1b4b',
        fontSize: 12,
        bold: false,
        italic: false,
        align: 'left',
      },
    };

    const updatedState = {
      ...currentState,
      cards: [...(currentState.cards || []), newCard],
    };

    await steadysocialClient.updateBoardState(boardName, updatedState);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added planning file "${fileName}" as a sticky card to board "${boardName}".`,
        },
      ],
    };
  }
);

server.tool(
  'list_crm_leads',
  'List all CRM leads with their name, status, source, company, and value.',
  {
    filterStatus: z
      .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'])
      .optional()
      .describe('Filter leads by status. Omit to list all.'),
  },
  async ({ filterStatus }) => {
    const allLeads = await steadysocialClient.getLeads();
    const leads = filterStatus
      ? allLeads.filter((l: any) => l.status === filterStatus)
      : allLeads;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(leads, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'list_planning_files',
  'List all planning files available in the workspace.',
  {
    subPath: z.string().optional().describe('Sub-directory to list (default: root)'),
  },
  async ({ subPath = '' }) => {
    const result = await steadysocialClient.getPlanningFiles(subPath);
    const files = result.files || [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(files, null, 2),
        },
      ],
    };
  }
);

/**
 * REMOTION TOOLS
 * Tools for creating and managing video projects with Remotion
 */

server.tool(
  'create_remotion_project',
  'Create a new Remotion video project with a blank or hello template.',
  {
    projectName: z.string().describe('Name of the Remotion project to create'),
    template: z.enum(['blank', 'hello']).optional().default('blank').describe('Template type: blank or hello'),
  },
  async (input) => {
    try {
      const projectPath = RemotionClient.createProject(input.projectName, input.template);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Remotion project "${input.projectName}" created successfully`,
                projectPath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: (error as Error).message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.tool(
  'validate_remotion_project',
  'Validate if a directory is a valid Remotion project.',
  {
    projectPath: z.string().describe('Path to the Remotion project directory'),
  },
  async (input) => {
    const isValid = RemotionClient.validateProject(input.projectPath);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectPath: input.projectPath,
              isValid,
              message: isValid ? 'Valid Remotion project' : 'Not a valid Remotion project',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  'get_remotion_project_info',
  'Get information about a Remotion project.',
  {
    projectPath: z.string().describe('Path to the Remotion project directory'),
  },
  async (input) => {
    try {
      const info = RemotionClient.getProjectInfo(input.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: (error as Error).message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.tool(
  'list_remotion_compositions',
  'List all video compositions in a Remotion project.',
  {
    projectPath: z.string().describe('Path to the Remotion project directory'),
  },
  async (input) => {
    try {
      const compositions = RemotionClient.listCompositions(input.projectPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                projectPath: input.projectPath,
                compositions,
                count: compositions.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: (error as Error).message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.tool(
  'render_remotion_composition',
  'Render a Remotion video composition to an output file.',
  {
    projectPath: z.string().describe('Path to the Remotion project directory'),
    compositionId: z.string().describe('ID of the composition to render'),
    outputPath: z.string().describe('Path where the output video will be saved'),
    fps: z.number().optional().describe('Frames per second (optional)'),
    width: z.number().optional().describe('Video width in pixels (optional)'),
    height: z.number().optional().describe('Video height in pixels (optional)'),
    quality: z.number().optional().describe('Quality setting 0-100 (optional)'),
  },
  async (input) => {
    try {
      const outputPath = await RemotionClient.renderComposition(
        input.projectPath,
        input.compositionId,
        input.outputPath,
        {
          fps: input.fps,
          width: input.width,
          height: input.height,
          quality: input.quality,
        }
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Composition rendered successfully',
                outputPath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: (error as Error).message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.tool(
  'preview_remotion_composition',
  'Start the Remotion preview server to develop and test compositions.',
  {
    projectPath: z.string().describe('Path to the Remotion project directory'),
    compositionId: z.string().optional().describe('Default composition to preview (optional)'),
  },
  async (input) => {
    try {
      RemotionClient.previewComposition(input.projectPath, input.compositionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Preview server started',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: (error as Error).message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.tool(
  'create_presentation',
  'Create a presentation with multiple slides. Returns JSON that can be used with SlideDeck component.',
  {
    title: z.string().describe('Main presentation title'),
    slides: z.array(
      z.object({
        title: z.string().optional().describe('Slide title'),
        content: z.string().describe('Slide content (can be markdown or plain text)'),
        bgColor: z.string().optional().describe('Background color fallback (e.g., bg-neo-secondary, #FFD93D)'),
        customMarkup: z.string().optional().describe('Full HTML markup for the slide, including Tailwind classes'),
      })
    ).describe('Array of slide objects'),
    customMarkup: z.string().optional().describe('Full HTML markup for the entire presentation'),
    theme: z.enum(['neo-brutalist', 'minimal', 'gradient']).optional().describe('Presentation theme'),
    transition: z.enum(['slide-horizontal', 'slide-vertical', 'fade']).optional().describe('Default transition type'),
  },
  async (input) => {
    try {
      // Transform slides into the format expected by SlideDeck component
      const processedSlides = input.slides.map((slide, idx) => ({
        id: idx + 1,
        title: slide.title || `Slide ${idx + 1}`,
        content: slide.content,
        bgColor: slide.bgColor || 'transparent',
        customMarkup: slide.customMarkup || buildDefaultSlideMarkup(slide, idx, input.slides.length, input.theme || 'neo-brutalist'),
      }));

      const presentation = {
        id: `presentation_${Date.now()}`,
        title: input.title,
        createdAt: new Date().toISOString(),
        theme: input.theme || 'neo-brutalist',
        transition: input.transition || 'slide-horizontal',
        slides: processedSlides,
        totalSlides: processedSlides.length,
        customMarkup: input.customMarkup,
        // React component code that can be copied if the agent wants to extend or customize the presentation output.
        componentCode: input.customMarkup
          ? `
import React from 'react'

export default function ${input.title.replace(/\s+/g, '')}() {
  const markup = ${JSON.stringify(input.customMarkup, null, 2)}

  return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: markup }} />
}
          `.trim()
          : `
import SlideDeck from '../components/presentation/SlideDeck'

export default function ${input.title.replace(/\s+/g, '')}() {
  const slides = ${JSON.stringify(processedSlides, null, 2)}

  return <SlideDeck slides={slides} transition="${input.transition || 'slide-horizontal'}" />
}
          `.trim(),
      };

      await appendPresentation(presentation);

      return {
        content: [
          {
            type: 'text',
            text: `Presentation "${input.title}" created successfully and saved to app storage.\n\n${JSON.stringify(presentation, null, 2)}\n\nComponent Code:\n${presentation.componentCode}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating presentation: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  'generate_presentation_from_content',
  'Generate a presentation from campaign or canvas content. Automatically creates slides with smart formatting.',
  {
    sourceType: z.enum(['campaign', 'canvas', 'custom']).describe('Source of content: campaign, canvas, or custom text'),
    sourceId: z.string().optional().describe('Campaign ID or Canvas ID (required if sourceType is campaign or canvas)'),
    customContent: z.string().optional().describe('Custom content to turn into slides (required if sourceType is custom)'),
    slideCount: z.number().optional().describe('Approximate number of slides to generate (default: 5)'),
    title: z.string().optional().describe('Presentation title (auto-generated if not provided)'),
  },
  async (input) => {
    try {
      let contentToProcess = '';
      let title = input.title || 'Auto-Generated Presentation';

      if (input.sourceType === 'campaign' && input.sourceId) {
        const campaigns = await steadysocialClient.getCampaigns();
        const campaign = campaigns.find(c => c.id === input.sourceId);
        if (!campaign) throw new Error(`Campaign ${input.sourceId} not found`);
        contentToProcess = JSON.stringify(campaign, null, 2);
        title = campaign.name || title;
      } else if (input.sourceType === 'canvas' && input.sourceId) {
        const canvases = await steadysocialClient.getCanvases();
        const canvas = canvases.find(c => c.id === input.sourceId);
        if (!canvas) throw new Error(`Canvas ${input.sourceId} not found`);
        contentToProcess = JSON.stringify(canvas, null, 2);
        title = canvas.title || title;
      } else if (input.sourceType === 'custom' && input.customContent) {
        contentToProcess = input.customContent;
      } else {
        throw new Error('Invalid source configuration. Provide sourceId for campaign/canvas or customContent for custom.');
      }

      // Smart slide generation
      const slideCount = Math.min(input.slideCount || 5, 10); // Max 10 slides
      const lines = contentToProcess.split('\n').filter(l => l.trim());
      const linesPerSlide = Math.ceil(lines.length / slideCount);

      const slides = [];
      for (let i = 0; i < slideCount; i++) {
        const start = i * linesPerSlide;
        const end = Math.min(start + linesPerSlide, lines.length);
        const slideContent = lines.slice(start, end).join('\n');

        if (slideContent.trim()) {
          slides.push({
            title: `Section ${i + 1}`,
            content: slideContent,
            bgColor: i % 2 === 0 ? 'transparent' : 'bg-neo-muted',
          });
        }
      }

      const presentation = {
        id: `presentation_${Date.now()}`,
        title,
        createdAt: new Date().toISOString(),
        theme: 'neo-brutalist',
        transition: 'slide-horizontal',
        slides: slides.map((s, idx) => ({ id: idx + 1, ...s })),
        totalSlides: slides.length,
      };

      await appendPresentation(presentation);

      return {
        content: [
          {
            type: 'text',
            text: `✓ Generated presentation "${title}" with ${slides.length} slides and saved it to app storage:\n\n${JSON.stringify(presentation, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);