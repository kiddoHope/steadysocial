const baseURL = 'http://localhost:3001';

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  let response: Response

  try {
    response = await fetch(`${baseURL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      ...options,
    })
  } catch (error: any) {
    throw new Error(error.message || 'Network error while connecting to backend')
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown API error' }))
    throw new Error(errorData.message || `HTTP error: ${response.status}`)
  }

  if (response.status === 204 || options.method === 'DELETE') {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
};

export type TransitionType = 'slide-horizontal' | 'slide-vertical' | 'fade';

export interface PresentationSlide {
  id: string | number;
  title?: string;
  content: string;
  bgColor?: string;
  customMarkup?: string;
}

export interface PresentationData {
  id: string;
  title: string;
  createdAt: string;
  theme: string;
  transition: TransitionType;
  slides: PresentationSlide[];
  totalSlides: number;
  componentCode?: string;
  customMarkup?: string;
}

export const getPresentations = async (): Promise<PresentationData[]> => {
  return apiRequest<PresentationData[]>('/presentations');
};

export const createPresentation = async (presentation: PresentationData): Promise<PresentationData> => {
  return apiRequest<PresentationData>('/presentations', {
    method: 'POST',
    body: JSON.stringify(presentation),
  });
};

export const updatePresentation = async (
  id: string,
  updates: Partial<PresentationData>
): Promise<PresentationData> => {
  return apiRequest<PresentationData>(`/presentations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

export const deletePresentation = async (id: string): Promise<void> => {
  return apiRequest<void>(`/presentations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};
