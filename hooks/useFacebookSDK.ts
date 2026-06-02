import { useState, useCallback } from 'react';

interface FacebookSDKHook {
  isSdkLoaded: boolean;
  isSdkInitialized: boolean;
  fbApi: <T>(
    path: string,
    method?: 'get' | 'post' | 'delete',
    params?: Record<string, any>
  ) => Promise<T>;
  error: string | null;
  FB?: any;
}

const LOCAL_API_BASE_URL = 'http://localhost:3001';

type HttpMethod = 'get' | 'post' | 'delete';

const fileToDataUrl = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file.'));
    };

    reader.readAsDataURL(file);
  });
};

const isFileLike = (value: any): value is File | Blob => {
  return (
    typeof File !== 'undefined' && value instanceof File
  ) || (
    typeof Blob !== 'undefined' && value instanceof Blob
  );
};

const parseGraphPath = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const [cleanPath, queryString = ''] = normalizedPath.split('?');
  const queryParams = new URLSearchParams(queryString);

  return {
    normalizedPath,
    cleanPath,
    queryParams,
  };
};

const mergeParams = (
  queryParams: URLSearchParams,
  params: Record<string, any>
): Record<string, any> => {
  const merged: Record<string, any> = {};

  queryParams.forEach((value, key) => {
    merged[key] = value;
  });

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  });

  return merged;
};

const buildQueryString = (params: Record<string, any>): string => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      key !== 'access_token' &&
      key !== 'accessToken'
    ) {
      query.set(key, String(value));
    }
  });

  return query.toString();
};

const useFacebookSDK = (
  appId?: string,
  sdkUrl?: string,
  accessToken?: string
): FacebookSDKHook => {
  const [error, setError] = useState<string | null>(null);

  const fbApi = useCallback(
    async <T>(
      path: string,
      method: HttpMethod = 'get',
      params: Record<string, any> = {}
    ): Promise<T> => {
      try {
        setError(null);

        const finalMethod = method.toLowerCase() as HttpMethod;
        const { cleanPath, queryParams } = parseGraphPath(path);
        const mergedParams = mergeParams(queryParams, params);

        const finalAccessToken =
          mergedParams.access_token ||
          mergedParams.accessToken ||
          accessToken ||
          '';

        const pageInfoMatch = cleanPath.match(/^\/([^/]+)$/);
        const pageFeedMatch = cleanPath.match(/^\/([^/]+)\/feed$/);
        const pagePostsMatch = cleanPath.match(/^\/([^/]+)\/posts$/);
        const pagePromotablePostsMatch = cleanPath.match(/^\/([^/]+)\/(promotable_posts|scheduled_posts)$/);
        const pagePhotosMatch = cleanPath.match(/^\/([^/]+)\/photos$/);
        const pageUploadsMatch = cleanPath.match(/^\/([^/]+)\/uploads$/);
        const meAccountsMatch = cleanPath === '/me/accounts';
        const pageConversationsMatch = cleanPath.match(/^\/([^/]+)\/conversations$/);
        const conversationMessagesMatch = cleanPath.match(/^\/([^/]+)\/messages$/);
        const pageMessagesMatch = cleanPath.match(/^\/([^/]+)\/messages$/);

        if (pageMessagesMatch && finalMethod === 'post') {
          const pageId = pageMessagesMatch[1];

          const response = await fetch(`${LOCAL_API_BASE_URL}/facebook/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              pageId,
              accessToken: finalAccessToken,
              messaging_type: mergedParams.messaging_type || 'RESPONSE',
              recipient: mergedParams.recipient,
              message: mergedParams.message,
            }),
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Facebook message send failed.';

            console.error('Facebook Messages API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }
        if (pageConversationsMatch && finalMethod === 'get') {
          const pageId = pageConversationsMatch[1];
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/conversations/${pageId}${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook conversations.';

            console.error('Facebook Conversations API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        if (conversationMessagesMatch && finalMethod === 'get') {
          const conversationId = conversationMessagesMatch[1];
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/conversation-messages/${conversationId}${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook messages.';

            console.error('Facebook Messages API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }
        /**
         * GET /me/accounts
         * Used by page connect screens.
         */
        if (meAccountsMatch && finalMethod === 'get') {
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/pages${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook pages.';

            console.error('Facebook Pages API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * GET /{PAGE_ID}
         * Used for page info.
         */
        if (pageInfoMatch && finalMethod === 'get') {
          const pageId = pageInfoMatch[1];
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/page-info/${pageId}${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook page info.';

            console.error('Facebook Page Info API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * GET /{PAGE_ID}/posts
         * Used by dashboard and posts pages.
         */
        if ((pagePostsMatch || pageFeedMatch) && finalMethod === 'get') {
          const pageId = pagePostsMatch?.[1] || pageFeedMatch?.[1];
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/page-posts/${pageId}${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook posts.';

            console.error('Facebook Posts API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * GET /{PAGE_ID}/promotable_posts
         * Fetch scheduled/promotable posts.
         */
        if (pagePromotablePostsMatch && finalMethod === 'get') {
          const pageId = pagePromotablePostsMatch[1];
          const query = buildQueryString(mergedParams);

          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/promotable-posts/${pageId}${query ? `?${query}` : ''}`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Failed to fetch Facebook scheduled posts.';

            console.error('Facebook Promotable Posts API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * POST /{PAGE_ID}/feed
         * Text or link post.
         */
        if (pageFeedMatch && finalMethod === 'post') {
          const pageId = pageFeedMatch[1];

          const response = await fetch(`${LOCAL_API_BASE_URL}/facebook/feed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              pageId,
              accessToken: finalAccessToken,
              message: mergedParams.message || mergedParams.caption || '',
              link: mergedParams.link || '',
              published: mergedParams.published ?? true,
              scheduled_publish_time: mergedParams.scheduled_publish_time || undefined,
            }),
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Facebook feed post failed.';

            console.error('Facebook Feed API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * POST /{PAGE_ID}/photos
         * POST /{PAGE_ID}/uploads
         *
         * /uploads is treated as a photo upload for compatibility with
         * the existing UI.
         */
        if ((pagePhotosMatch || pageUploadsMatch) && finalMethod === 'post') {
          const pageId = pagePhotosMatch?.[1] || pageUploadsMatch?.[1];

          let imageDataUrl =
            mergedParams.imageDataUrl ||
            mergedParams.image ||
            mergedParams.source ||
            mergedParams.file ||
            '';

          if (isFileLike(imageDataUrl)) {
            imageDataUrl = await fileToDataUrl(imageDataUrl);
          }

          const response = await fetch(`${LOCAL_API_BASE_URL}/facebook/photo`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              pageId,
              accessToken: finalAccessToken,
              message: mergedParams.message || mergedParams.caption || '',
              imageDataUrl,
              imageUrl:
                mergedParams.url ||
                mergedParams.imageUrl ||
                '',
              published: mergedParams.published ?? true,
              scheduled_publish_time: mergedParams.scheduled_publish_time || undefined,
            }),
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              data.error?.error_user_msg ||
              'Facebook photo post failed.';

            console.error('Facebook Photo API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        /**
         * DELETE /{POST_ID}
         * Delete scheduled post.
         */
        if (pageInfoMatch && finalMethod === 'delete') {
          const postId = pageInfoMatch[1];
          const response = await fetch(
            `${LOCAL_API_BASE_URL}/facebook/scheduled-posts/${postId}`,
            {
              method: 'DELETE',
              headers: {
                Accept: 'application/json',
                'X-Access-Token': finalAccessToken,
              },
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.error || data.success === false) {
            const apiError =
              data.message ||
              data.error?.message ||
              'Failed to delete Facebook scheduled post.';

            console.error('Facebook Delete API Error:', data);
            setError(apiError);
            throw new Error(apiError);
          }

          return data as T;
        }

        throw new Error(
          `Unsupported Facebook call: ${finalMethod.toUpperCase()} ${cleanPath}. Supported paths are /me/accounts, /{PAGE_ID}, /{PAGE_ID}/posts, /{PAGE_ID}/feed, /{PAGE_ID}/photos, and /{PAGE_ID}/uploads.`
        );
      } catch (err: any) {
        const message = err?.message || 'Facebook Graph API request failed.';
        setError(message);
        throw err;
      }
    },
    [accessToken]
  );

  return {
    isSdkLoaded: true,
    isSdkInitialized: true,
    fbApi,
    error,
    FB: null,
  };
};

export default useFacebookSDK;