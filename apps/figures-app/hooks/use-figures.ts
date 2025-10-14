'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Figure, AiProposal } from '@/types/figures';

interface FiguresResponse {
  figures: Figure[];
}

interface CreateFigureInput {
  name: string;
  youtubeTitle: string;
  status?: string;
  bio?: string;
  notes?: string;
  tags?: string[];
  aiPlan?: Record<string, unknown>;
  thumbnailKey?: string;
  portraitKey?: string;
}

interface UpdateFigureInput extends Partial<CreateFigureInput> {
  pk: string;
}

interface GenerateInput {
  theme?: string;
  era?: string;
  focus?: string;
}

async function fetchFigures(): Promise<Figure[]> {
  const response = await fetch('/api/figures', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load figures');
  }
  const data = (await response.json()) as FiguresResponse;
  return data.figures;
}

async function createFigure(payload: CreateFigureInput): Promise<Figure> {
  const response = await fetch('/api/figures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to create figure');
  }
  return (await response.json()) as Figure;
}

async function updateFigure(payload: UpdateFigureInput): Promise<void> {
  const { pk, ...body } = payload;
  const response = await fetch(`/api/figures/${encodeURIComponent(pk)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to update figure');
  }
}

async function generateProposal(
  payload: GenerateInput,
): Promise<AiProposal> {
  const response = await fetch('/api/figures/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'AI生成に失敗しました');
  }
  const data = (await response.json()) as { proposal: AiProposal };
  return data.proposal;
}

export function useFigures() {
  return useQuery({
    queryKey: ['figures'],
    queryFn: fetchFigures,
  });
}

export function useCreateFigureMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createFigure,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['figures'] });
    },
  });
}

export function useUpdateFigureMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateFigure,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['figures'] });
    },
  });
}

export function useGenerateProposalMutation() {
  return useMutation({
    mutationFn: generateProposal,
  });
}
