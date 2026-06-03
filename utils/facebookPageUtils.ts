import { FacebookPage, FacebookSettings } from '../types';

export type FacebookPageConnectionStatus = 'unknown' | 'connected' | 'not_authorized';

export interface ConfiguredFacebookPage extends FacebookPage {
  id: string;
  name: string;
  access_token: string;
  accessToken?: string;
  isDefault?: boolean;
  status?: FacebookPageConnectionStatus;
  lastTestedAt?: string;
  aiAgentContext?: string;
}

export interface MultiPageFacebookSettings extends FacebookSettings {
  pages?: Array<Partial<ConfiguredFacebookPage> & {
    accessToken?: string;
    pageId?: string;
    pageName?: string;
  }>;
  defaultPageId?: string;
  pageName?: string;
  pageContexts?: Record<string, string>;
  pageAiContexts?: Record<string, string>;
  aiAgentContextsByPage?: Record<string, string>;
}

const normalizeId = (value: unknown): string => String(value || '').trim();

export const getFacebookPageAccessToken = (
  page?: Partial<ConfiguredFacebookPage> | null
): string => String(page?.access_token || page?.accessToken || '').trim();

export const getFacebookPageDisplayName = (
  page?: Partial<ConfiguredFacebookPage> | null,
  fallback = 'FACEBOOK PAGE'
): string => String(page?.name || fallback).trim();

export const getPageContextMap = (
  settings?: MultiPageFacebookSettings | null
): Record<string, string> => ({
  ...(settings?.pageContexts || {}),
  ...(settings?.pageAiContexts || {}),
  ...(settings?.aiAgentContextsByPage || {}),
});

export const normalizeFacebookPages = (
  settings?: MultiPageFacebookSettings | null
): ConfiguredFacebookPage[] => {
  if (!settings) return [];

  const contextMap = getPageContextMap(settings);

  const fromPages = Array.isArray(settings.pages)
    ? settings.pages
        .map((page, index) => {
          const id = normalizeId(page.id || page.pageId);
          const accessToken = normalizeId(page.access_token || page.accessToken);

          if (!id || !accessToken) return null;

          return {
            id,
            name: String(page.name || page.pageName || `Facebook Page ${index + 1}`).trim(),
            access_token: accessToken,
            accessToken,
            isDefault:
              Boolean(page.isDefault) ||
              Boolean(settings.defaultPageId && id === settings.defaultPageId) ||
              (!settings.defaultPageId && index === 0),
            status: page.status || 'unknown',
            lastTestedAt: page.lastTestedAt,
            aiAgentContext:
              page.aiAgentContext ||
              contextMap[id] ||
              '',
          } as ConfiguredFacebookPage;
        })
        .filter((page): page is ConfiguredFacebookPage => Boolean(page))
    : [];

  const pages = fromPages.length > 0
    ? fromPages
    : (() => {
        const id = normalizeId(settings.pageId);
        const accessToken = normalizeId(settings.accessToken);

        if (!id || !accessToken) return [];

        return [
          {
            id,
            name: String(settings.pageName || 'Facebook Page').trim(),
            access_token: accessToken,
            accessToken,
            isDefault: true,
            status: 'unknown',
            aiAgentContext: settings.aiAgentContext || contextMap[id] || '',
          } as ConfiguredFacebookPage,
        ];
      })();

  if (pages.length === 0) return [];

  const hasDefault = pages.some(page => page.isDefault);

  return pages.map((page, index) => ({
    ...page,
    access_token: getFacebookPageAccessToken(page),
    accessToken: getFacebookPageAccessToken(page),
    isDefault: hasDefault ? Boolean(page.isDefault) : index === 0,
  }));
};

export const sanitizeFacebookPages = (
  pages: ConfiguredFacebookPage[]
): ConfiguredFacebookPage[] => {
  const cleaned = pages
    .map((page, index) => {
      const id = normalizeId(page.id);
      const accessToken = getFacebookPageAccessToken(page);

      if (!id || !accessToken) return null;

      return {
        ...page,
        id,
        name: String(page.name || `Facebook Page ${index + 1}`).trim(),
        access_token: accessToken,
        accessToken,
        status: page.status || 'unknown',
        aiAgentContext: page.aiAgentContext || '',
      } as ConfiguredFacebookPage;
    })
    .filter((page): page is ConfiguredFacebookPage => Boolean(page));

  if (cleaned.length === 0) return [];

  const defaultIndex = Math.max(0, cleaned.findIndex(page => page.isDefault));

  return cleaned.map((page, index) => ({
    ...page,
    isDefault: index === defaultIndex,
  }));
};

export const getDefaultFacebookPage = (
  pages: ConfiguredFacebookPage[] = [],
  settings?: MultiPageFacebookSettings | null
): ConfiguredFacebookPage | null => {
  if (!pages.length && settings) {
    return normalizeFacebookPages(settings)[0] || null;
  }

  return pages.find(page => page.isDefault) || pages[0] || null;
};

export const getPageAiAgentContext = (
  settings?: MultiPageFacebookSettings | null,
  pageId?: string | null
): string => {
  const normalizedPageId = normalizeId(pageId);
  if (!settings) return '';

  if (normalizedPageId) {
    const contextMap = getPageContextMap(settings);
    const mappedContext = contextMap[normalizedPageId];
    if (mappedContext) return mappedContext;

    const pageContext = normalizeFacebookPages(settings).find(
      page => page.id === normalizedPageId
    )?.aiAgentContext;

    if (pageContext) return pageContext;
  }

  return settings.aiAgentContext || '';
};

export const buildFacebookSettingsPayload = (
  appId: string,
  pages: ConfiguredFacebookPage[],
  fallbackContext = ''
): Partial<MultiPageFacebookSettings> => {
  const cleanedPages = sanitizeFacebookPages(pages);
  const defaultPage = getDefaultFacebookPage(cleanedPages);
  const pageContexts = cleanedPages.reduce<Record<string, string>>((acc, page) => {
    if (page.aiAgentContext?.trim()) {
      acc[page.id] = page.aiAgentContext;
    }
    return acc;
  }, {});

  return {
    appId: appId.trim(),
    accessToken: defaultPage?.access_token || '',
    pageId: defaultPage?.id || '',
    pageName: defaultPage?.name || '',
    defaultPageId: defaultPage?.id || '',
    pages: cleanedPages,
    pageContexts,
    aiAgentContext: defaultPage?.aiAgentContext || fallbackContext,
  };
};

export const getScopedConversationSettingsKey = (
  pageId: string | undefined | null,
  conversationId: string
): string => {
  const cleanPageId = normalizeId(pageId);
  return cleanPageId ? `${cleanPageId}::${conversationId}` : conversationId;
};
