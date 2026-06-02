export interface AiSkill {
  id: string;
  name: string;
  path: string;
  description?: string;
}

export const AI_SKILLS: AiSkill[] = [
  {
    id: 'ab-test-setup',
    name: 'A/B Test Setup',
    path: '/skills/my-skills/ab-test-setup/SKILL.md',
  },
  {
    id: 'ad-creative',
    name: 'Ad Creative',
    path: '/skills/my-skills/ad-creative/SKILL.md',
  },
  {
    id: 'analytics-tracking',
    name: 'Analytics Tracking',
    path: '/skills/my-skills/analytics-tracking/SKILL.md',
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming',
    path: '/skills/my-skills/brainstorming/SKILL.md',
  },
  {
    id: 'canvas-design',
    name: 'Canvas Design',
    path: '/skills/my-skills/canvas-design/SKILL.md',
  },
  {
    id: 'competitor-alternatives',
    name: 'Competitor Alternatives',
    path: '/skills/my-skills/competitor-alternatives/SKILL.md',
  },
  {
    id: 'content-strategy',
    name: 'Content Strategy',
    path: '/skills/my-skills/content-strategy/SKILL.md',
  },
  {
    id: 'copywriting',
    name: 'Copywriting',
    path: '/skills/my-skills/copywriting/SKILL.md',
  },
  {
    id: 'docx',
    name: 'DOCX',
    path: '/skills/my-skills/docx/SKILL.md',
  },
  {
    id: 'executing-plans',
    name: 'Executing Plans',
    path: '/skills/my-skills/executing-plans/SKILL.md',
  },
  {
    id: 'launch-strategy',
    name: 'Launch Strategy',
    path: '/skills/my-skills/launch-strategy/SKILL.md',
  },
  {
    id: 'marketing-ideas',
    name: 'Marketing Ideas',
    path: '/skills/my-skills/marketing-ideas/SKILL.md',
  },
  {
    id: 'pdf',
    name: 'PDF',
    path: '/skills/my-skills/pdf/SKILL.md',
  },
  {
    id: 'pptx',
    name: 'PPTX',
    path: '/skills/my-skills/pptx/SKILL.md',
  },
  {
    id: 'product-marketing-context',
    name: 'Product Marketing Context',
    path: '/skills/my-skills/product-marketing-context/SKILL.md',
  },
  {
    id: 'programmatic-seo',
    name: 'Programmatic SEO',
    path: '/skills/my-skills/programmatic-seo/SKILL.md',
  },
  {
    id: 'skillshare',
    name: 'Skillshare',
    path: '/skills/my-skills/skillshare/SKILL.md',
  },
  {
    id: 'social-content',
    name: 'Social Content',
    path: '/skills/my-skills/social-content/SKILL.md',
  },
  {
    id: 'writing-plans',
    name: 'Writing Plans',
    path: '/skills/my-skills/writing-plans/SKILL.md',
  },
  {
    id: 'writing-skills',
    name: 'Writing Skills',
    path: '/skills/my-skills/writing-skills/SKILL.md',
  },
  {
    id: 'xlsx',
    name: 'XLSX',
    path: '/skills/my-skills/xlsx/SKILL.md',
  },
];

export const loadSkillInstruction = async (
  skillId: string
): Promise<string> => {
  const skill = AI_SKILLS.find(item => item.id === skillId);

  if (!skill) {
    return '';
  }

  try {
    const response = await fetch(skill.path);

    if (!response.ok) {
      console.warn(`Skill file not found: ${skill.path}`);
      return '';
    }

    return await response.text();
  } catch (error) {
    console.error('Failed to load skill:', error);
    return '';
  }
};