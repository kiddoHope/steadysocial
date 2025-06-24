
export enum UserRole {
  ADMIN = 'admin',
  CREATIVE = 'creative',
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  password?: string; // Only for creation/storage, not for client state
  profilePictureUrl?: string; // Base64 string for the profile picture
}

export enum CanvasStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  NEEDS_REVISION = 'needs_revision',
  APPROVED = 'approved',
  // Consider if individual items get a 'POSTED' status later
}

export enum SocialPlatform {
  General = "General Platform",
  Facebook = "Facebook",
  Instagram = "Instagram",
  X = "X (formerly Twitter)", // Updated
  Twitter = "Twitter (Legacy - use X)", // Kept for compatibility if needed, prefer X
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

// Represents one core creative idea and its adaptations within a Canvas
export interface CanvasItem {
  id: string; // Unique within the canvas, e.g., item-timestamp-random
  originalText: string;
  imagePreview?: string | null; // Context image used for this item if specific
  textFileContent?: string | null; // Context text file used if specific
  adaptations: Partial<Record<SocialPlatform, { text: string }>>; // platform -> adapted text
  notesForAdmin?: string; // Creative's notes for this specific item
  // Optional: Storing base tone/platform could be useful for re-adaptation if needed
  baseTone: CaptionTone;
  basePlatformContext: SocialPlatform; // The general platform context used to generate this item
}

// The main Content Canvas
export interface ContentCanvas {
  id: string; // Globally unique ID for the canvas
  title?: string; // Optional title for the canvas (e.g., from prompt or user input)
  items: CanvasItem[];
  status: CanvasStatus;
  
  // Context for the entire canvas generation session
  overallCustomPrompt: string;
  overallTone: CaptionTone;
  overallPlatformContext: SocialPlatform; // General platform context for initial ideas
  overallImagePreview?: string | null; // Primary image associated with the canvas
  overallTextFileContent?: string | null; // Primary text file associated with the canvas

  createdBy: string; // User ID of the Creative
  createdAt: number; // Timestamp
  submittedAt?: number; // Timestamp when moved to PENDING_REVIEW
  reviewedBy?: string; // User ID of the Admin
  reviewedAt?: number; // Timestamp of last review action
  adminFeedback?: string; // General feedback from Admin for the whole canvas if revision is needed
}


// This type might be used internally by useWebLLM before structuring into CanvasItem
export interface InitialIdea { 
  id: string;
  text: string;
}

export interface FacebookSettings {
  sdkUrl: string;
  pageId: string;
  appId: string; // Added appId for Facebook SDK initialization
}

export type Theme = 'light' | 'dark';

/**
 * @deprecated Use ContentCanvas and CanvasItem instead.
 */
export interface Post {
  id: string;
  imagePreview?: string | null;
  caption: string;
  status: string; // Was PostStatus, now string for compatibility during transition if needed
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
