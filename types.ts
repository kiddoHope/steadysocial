export enum UserRole {
  ADMIN = 'admin',
  CREATIVE = 'creative',
}

export enum Endpoint {
  USERS = '/users',
  CANVASES = '/canvases',
  FACEBOOK = '/facebook',
  ANALYTICS = '/analytics',
  SETTINGS = '/settings',
  GENERATION = '/generation',
  HR = '/hr',
  WIP = '/wip', // Work-in-progress endpoint for Generation Page
}



export interface User {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  email: string;
  password?: string; // Optional: In-memory DB might store it, but API responses shouldn't include it.
  profilePictureUrl?: string; // Base64 string for the profile picture
  theme?: Theme; // User's preferred theme
}

export enum CanvasStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  NEEDS_REVISION = 'needs_revision',
  APPROVED = 'approved',
}

export enum SocialPlatform {
  General = "General Platform",
  Facebook = "Facebook",
  Instagram = "Instagram",
  X = "X (formerly Twitter)",
  Twitter = "Twitter (Legacy - use X)",
  LinkedIn = "LinkedIn",
  TikTok = "TikTok"
}

export enum CaptionTone {
  Friendly = "Friendly",
  Professional = "Professional",
  Witty = "Witty",
  Empathetic = "Empathetic",
  Urgent = "Urgent",
  Playful = "Playful",
  Inspirational = "Inspirational"
}

// User state interface
export interface ResetPasswordPayload {
  email: string;
  code: string;
  password: string;
}

// Define payload for verifying reset code
export interface VerifyResetCodePayload {
    email: string;
    code: string;
}

// Define payload for the new verify function
export interface VerifyCodePayload {
    email: string;
    verificationCode: string;
}

// Work-in-progress state for the Generation Page
export interface WIPState {
  canvasTitle: string;
  customPrompt: string;
  platformContext: SocialPlatform;
  tone: CaptionTone;
  numberOfIdeas: number;
  overallImagePreview: string | null; 
  overallImageFile: File | null; // Transient, not "stored" in DB
  overallTextFileContent: string | null;
  overallTextFile: File | null; // Transient, not "stored" in DB
  parsedRawItems: string[] | null; // Raw AI suggestions not yet turned into cards
  activeCanvasIdForWIP: string | null; 
}

export interface CanvasItem {
  id: string;
  originalText: string;
  imagePreview?: string | null; 
  textFileContent?: string | null;
  adaptations: Partial<Record<SocialPlatform, { text: string }>>;
  notesForAdmin?: string;
  baseTone: CaptionTone;
  basePlatformContext: SocialPlatform;
}

export interface ContentCanvas {
  id: string; 
  title?: string; 
  items: CanvasItem[];
  status: CanvasStatus;
  
  overallCustomPrompt: string;
  overallTone: CaptionTone;
  overallPlatformContext: SocialPlatform; 
  overallImagePreview?: string | null; 
  overallTextFileContent?: string | null; 

  // For simulation, WIP associated with this canvas when fetched/saved
  // When saving, the current WIPState (excluding File objects) can be stored here.
  // When loading, this can re-populate the GenerationWIPContext.
  wipStateSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>;


  createdBy: string; 
  createdAt: number; 
  submittedAt?: number; 
  reviewedBy?: string; 
  reviewedAt?: number; 
  adminFeedback?: string; 
}


export interface InitialIdea { 
  id: string;
  text: string;
}

export interface FacebookSettings {
  sdkUrl: string; 
  appId: string;  
  pageId: string; 
  messagingAppId?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string; 
}

export type Theme = 'light' | 'dark';

/**
 * @deprecated Use ContentCanvas and CanvasItem instead.
 */
export interface Post {
  id: string;
  imagePreview?: string | null;
  caption: string;
  status: string; 
  generatedBy: string; 
  approvedBy?: string | null; 
  timestamp: number;
  platform?: SocialPlatform; 
  tone?: CaptionTone;
  customPrompt?: string;
  originalTextFileContent?: string;
  notesForAdmin?: string; 
  targetPlatform?: SocialPlatform; 
}

/**
 * @deprecated Use CanvasStatus instead.
 */
export enum PostStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  POSTED_TO_FACEBOOK = 'posted_to_facebook',
}

export interface FacebookParticipantData {
  name: string;
  email?: string; 
  id: string; 
}

export interface FacebookParticipant {
  data: FacebookParticipantData[];
}

export interface FacebookMessageData {
  id: string; 
  created_time: string;
  message?: string; 
  from: FacebookParticipantData;
}

export interface FacebookMessage {
  id: string; 
  created_time: string;
  message?: string;
  from: FacebookParticipantData;
}

export interface FacebookConversation {
  id: string; 
  updated_time: string;
  snippet?: string; 
  unread_count: number;
  participants: FacebookParticipant;
  messages?: { 
    data: FacebookMessageData[];
  };
}

// Types for Facebook Analytics (moved from AnalyticsContext)
export interface FBPageInfo {
  name?: string;
  fan_count?: number;
  picture?: { data: { url: string } };
}

export interface FBInsightValue {
  value: number | Record<string, number>;
  end_time: string;
}

export interface FBInsightsData {
  name: string;
  period: string;
  values: FBInsightValue[];
  title: string;
  description: string;
  id: string;
}

export interface FBInsightsResponse {
  data: FBInsightsData[];
}

export interface FBPostAttachmentMediaImage {
  height: number;
  src: string;
  width: number;
}

export interface FBPostAttachmentMedia {
  image: FBPostAttachmentMediaImage;
}

export interface FBPostAttachmentSubattachment {
    media: FBPostAttachmentMedia;
    type: string;
}

export interface FBPostAttachmentData {
  media?: FBPostAttachmentMedia;
  subattachments?: { data: FBPostAttachmentSubattachment[] };
  type: string;
  url?: string;
}

export interface FBPostAttachments {
  data: FBPostAttachmentData[];
}

export interface FBPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  insights?: {
    data: Array<{
      name: string;
      period: string;
      values: Array<{value: number}>;
    }>;
  };
  attachments?: FBPostAttachments;
}

export interface FBPostsResponse {
  data: FBPost[];
  paging?: any;
}

export interface FBManagedPagesResponse {
  data: FacebookPage[];
}
