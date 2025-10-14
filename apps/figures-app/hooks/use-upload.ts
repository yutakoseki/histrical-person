'use client';

import { useMutation } from '@tanstack/react-query';

interface PresignResponse {
  url: string;
  bucket: string;
  key: string;
  expiresIn: number;
}

interface PresignInput {
  type: 'thumbnail' | 'portrait';
  filename: string;
  contentType: string;
  file: File;
}

async function requestPresignedUrl(
  input: Omit<PresignInput, 'file'>,
): Promise<PresignResponse> {
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to create upload URL');
  }
  return (await response.json()) as PresignResponse;
}

async function uploadFile(url: string, file: File, contentType: string) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.statusText}`);
  }
}

export function useUploadMutation() {
  return useMutation({
    mutationFn: async (input: PresignInput) => {
      const { file, ...rest } = input;
      const presigned = await requestPresignedUrl(rest);
      await uploadFile(presigned.url, file, rest.contentType);
      return presigned;
    },
  });
}
