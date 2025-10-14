export interface FigureVideoInfo {
  s3Key?: string;
  youtubeId?: string;
  durationMs?: number;
  updatedAt?: number;
}

export interface FigureAiPlan {
  summary?: string;
  angle?: string;
  hook?: string;
  thumbnailIdea?: string;
  sources?: string[];
  tags?: string[];
}

export interface Figure {
  pk: string;
  name: string;
  status: string;
  youtubeTitle?: string;
  bio?: string;
  notes?: string;
  tags?: string[];
  aiPlan?: FigureAiPlan;
  thumbnailKey?: string;
  portraitKey?: string;
  lockedUntil?: number;
  createdAt?: number;
  updatedAt?: number;
  video?: FigureVideoInfo;
}

export interface AiProposal {
  name: string;
  youtubeTitle: string;
  summary: string;
  hook?: string;
  thumbnailIdea?: string;
  tags?: string[];
  sourceHints?: string[];
  notes?: string;
}
