'use client';

import { useMemo, useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import clsx from 'clsx';
import { SparklesIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  useCreateFigureMutation,
  useFigures,
  useGenerateProposalMutation,
  useUpdateFigureMutation,
} from '@/hooks/use-figures';
import { useUploadMutation } from '@/hooks/use-upload';
import type { AiProposal, Figure } from '@/types/figures';

const STATUS_OPTIONS = ['ready', 'available', 'locked', 'completed'] as const;

export function FiguresDashboard() {
  const { data: figures, isLoading, error } = useFigures();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedPk, setSelectedPk] = useState<string | null>(null);

  const derivedStatuses = useMemo(() => {
    if (!figures?.length) {
      return STATUS_OPTIONS;
    }
    const unique = Array.from(new Set(figures.map((item) => item.status)));
    return STATUS_OPTIONS.concat(unique.filter((item) => !STATUS_OPTIONS.includes(item as (typeof STATUS_OPTIONS)[number])));
  }, [figures]);

  useEffect(() => {
    if (!selectedPk && figures && figures.length > 0) {
      setSelectedPk(figures[0].pk);
    }
  }, [figures, selectedPk]);


  const filteredFigures = useMemo(() => {
    if (!figures) return [];
    return figures.filter((figure) => {
      const matchesStatus =
        statusFilter === 'all' || figure.status === statusFilter;
      const matchesSearch =
        !searchKeyword ||
        figure.name.includes(searchKeyword) ||
        figure.youtubeTitle?.includes(searchKeyword) ||
        figure.pk.includes(searchKeyword);
      return matchesStatus && matchesSearch;
    });
  }, [figures, statusFilter, searchKeyword]);

  useEffect(() => {
    if (!filteredFigures.length) {
      setSelectedPk(null);
      return;
    }
    if (!filteredFigures.some((item) => item.pk === selectedPk)) {
      setSelectedPk(filteredFigures[0].pk);
    }
  }, [filteredFigures, selectedPk]);

  const selectedFigure = filteredFigures.find((item) => item.pk === selectedPk)
    ?? figures?.find((item) => item.pk === selectedPk)
    ?? null;

  const statusCounters = useMemo(() => {
    const counters = new Map<string, number>();
    figures?.forEach((item) => {
      counters.set(item.status, (counters.get(item.status) ?? 0) + 1);
    });
    return counters;
  }, [figures]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-white">Figures Admin Console</h1>
        <p className="text-sm text-slate-300">
          DynamoDBの <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">figures</code> テーブルとS3アセットを管理します。
        </p>
        <div className="flex flex-wrap gap-3">
          <StatusSummary label="合計" value={figures?.length ?? 0} />
          {derivedStatuses.map((status) => (
            <StatusSummary
              key={status}
              label={status}
              value={statusCounters.get(status) ?? 0}
              highlight={status === statusFilter}
              onClick={() => setStatusFilter((prev) => (prev === status ? 'all' : status))}
            />
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          データの読み込みに失敗しました: {(error as Error).message}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <CreateFigureCard />
        <UploadAssetsCard figures={figures ?? []} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <Input
                label="キーワード"
                placeholder="人物名 / YouTubeタイトル / pk"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                className="min-w-[220px]"
              />
              <Select
                label="ステータス"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">すべて</option>
                {derivedStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setSearchKeyword('');
              }}
            >
              フィルターをクリア
            </Button>
          </div>

          <div className="relative max-h-[480px] overflow-hidden rounded-b-xl border-t border-slate-800">
            <div className="custom-scrollbar max-h-[480px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left">人物名</th>
                    <th className="px-4 py-3 text-left">ステータス</th>
                    <th className="px-4 py-3 text-left">YouTubeタイトル</th>
                    <th className="px-4 py-3 text-left">更新日時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {isLoading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                        読み込み中...
                      </td>
                    </tr>
                  )}
                  {!isLoading && filteredFigures.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                        一致するデータがありません。
                      </td>
                    </tr>
                  )}
                  {filteredFigures.map((figure) => (
                    <tr
                      key={figure.pk}
                      className={clsx(
                        'cursor-pointer bg-slate-900/40 transition hover:bg-slate-800/60',
                        figure.pk === selectedPk && 'bg-brand-500/10',
                      )}
                      onClick={() => setSelectedPk(figure.pk)}
                    >
                      <td className="px-4 py-3 text-sm text-white">
                        <div className="flex flex-col">
                          <span className="font-medium">{figure.name}</span>
                          <span className="text-xs text-slate-400">{figure.pk}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        <StatusBadge status={figure.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {figure.youtubeTitle ? (
                          <span>{figure.youtubeTitle}</span>
                        ) : (
                          <span className="text-slate-500">未設定</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {figure.updatedAt
                          ? format(new Date(figure.updatedAt), 'yyyy/MM/dd HH:mm', { locale: ja })
                          : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <FigureDetailCard figure={selectedFigure} />
      </section>
    </div>
  );
}

function StatusSummary({
  label,
  value,
  highlight = false,
  onClick,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60',
        highlight
          ? 'border-brand-500 bg-brand-500/20 text-brand-100'
          : 'border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700',
      )}
    >
      <span className="font-medium capitalize">{label}</span>
      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
        {value}
      </span>
    </button>
  );
}

function CreateFigureCard() {
  const createMutation = useCreateFigureMutation();
  const generateMutation = useGenerateProposalMutation();
  const [form, setForm] = useState({
    name: '',
    youtubeTitle: '',
    summary: '',
    notes: '',
    tags: '',
  });
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const updateForm = (field: keyof typeof form) => (value: string) => {
    setFeedback(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const applyProposal = (proposal: AiProposal) => {
    setForm({
      name: proposal.name,
      youtubeTitle: proposal.youtubeTitle,
      summary: proposal.summary,
      notes: proposal.notes ?? '',
      tags: (proposal.tags ?? []).join(', '),
    });
    setProposal(proposal);
  };

  const handleGenerate = async () => {
    try {
      const proposal = await generateMutation.mutateAsync({
        theme: form.summary || undefined,
        focus: form.notes || undefined,
      });
      applyProposal(proposal);
      setFeedback('AI提案を読み込みました。必要に応じて項目を調整してください。');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AIによる提案生成に失敗しました';
      setFeedback(message);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name || !form.youtubeTitle) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      youtubeTitle: form.youtubeTitle.trim(),
      status: 'ready',
      bio: form.summary.trim() || undefined,
      notes: form.notes.trim() || undefined,
      tags: form.tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      aiPlan: proposal
        ? {
            summary: proposal.summary,
            hook: proposal.hook,
            thumbnailIdea: proposal.thumbnailIdea,
            sources: proposal.sourceHints,
            tags: proposal.tags,
          }
        : undefined,
    };

    try {
      await createMutation.mutateAsync(payload);
      setForm({
        name: '',
        youtubeTitle: '',
        summary: '',
        notes: '',
        tags: '',
      });
      setProposal(null);
      setFeedback('新しいレコードをreadyで登録しました。');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '登録に失敗しました';
      setFeedback(message);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-5 w-5 text-brand-300" />
        <div>
          <h2 className="text-lg font-semibold text-white">AIで候補を生成</h2>
          <p className="text-xs text-slate-400">
            偉人候補とYouTubeタイトルを自動生成し、ステータス{' '}
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5">ready</code>
            {' '}で登録します。サムネイルと肖像画をアップロードすると自動的に{' '}
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5">available</code>
            {' '}へ昇格します。
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-3 text-sm" onSubmit={handleSubmit}>
        <Input
          label="人物名"
          value={form.name}
          onChange={(event) => updateForm('name')(event.target.value)}
          placeholder="例: 徳川家康"
          required
        />
        <Input
          label="YouTubeタイトル"
          value={form.youtubeTitle}
          onChange={(event) => updateForm('youtubeTitle')(event.target.value)}
          placeholder="【徳川家康の名言】天下泰平の知略 #shorts"
          required
        />
        <Textarea
          label="概要 / Summary"
          value={form.summary}
          onChange={(event) => updateForm('summary')(event.target.value)}
          rows={3}
          placeholder="人物の魅力や動画の切り口"
        />
        <Textarea
          label="補足ノート"
          value={form.notes}
          onChange={(event) => updateForm('notes')(event.target.value)}
          rows={2}
          placeholder="運用メモ、注意点など"
        />
        <Input
          label="タグ (カンマ区切り)"
          value={form.tags}
          onChange={(event) => updateForm('tags')(event.target.value)}
          placeholder="戦国時代, 統治, 知略"
        />
        {proposal && (
          <div className="rounded-md border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs text-brand-100">
            <p className="font-semibold text-brand-100">AIからの提案</p>
            <ul className="mt-1 space-y-1">
              <li>・{proposal.summary}</li>
              {proposal.hook && <li>・Hook: {proposal.hook}</li>}
              {proposal.thumbnailIdea && (
                <li>・Thumbnail: {proposal.thumbnailIdea}</li>
              )}
              {proposal.sourceHints?.length && (
                <li>・Sources: {proposal.sourceHints.join(', ')}</li>
              )}
            </ul>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={generateMutation.isPending}
            onClick={handleGenerate}
          >
            {generateMutation.isPending ? '生成中…' : 'AIで提案'}
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? '登録中…' : 'readyで登録'}
          </Button>
        </div>
        {feedback && (
          <p className="text-xs text-slate-200">{feedback}</p>
        )}
      </form>
    </div>
  );
}

function UploadAssetsCard({ figures }: { figures: Figure[] }) {
  const uploadMutation = useUploadMutation();
  const updateMutation = useUpdateFigureMutation();
  const [selectedPk, setSelectedPk] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFigure = useMemo(
    () => figures.find((item) => item.pk === selectedPk) ?? null,
    [figures, selectedPk],
  );

  useEffect(() => {
    if (figures.length === 0) {
      setSelectedPk('');
      return;
    }
    const exists = figures.some((item) => item.pk === selectedPk);
    if (!exists) {
      const preferred = figures.find((item) => item.status === 'ready') ?? figures[0];
      setSelectedPk(preferred.pk);
    }
  }, [figures, selectedPk]);

  const handleUpload = async (type: 'thumbnail' | 'portrait') => {
    setMessage(null);
    const targetFile = type === 'thumbnail' ? thumbnailFile : portraitFile;
    if (!selectedFigure || !targetFile) {
      setMessage('人物とファイルを選択してください。');
      return;
    }

    const { name } = selectedFigure;
    const extension = targetFile.name.split('.').pop()?.toLowerCase() ?? 'png';
    const filename =
      type === 'thumbnail'
        ? `${name}_サムネ.${extension}`
        : `${name}.${extension}`;

    try {
      const result = await uploadMutation.mutateAsync({
        type,
        filename,
        contentType: targetFile.type || inferContentType(extension),
        file: targetFile,
      });
      const payload: { pk: string; thumbnailKey?: string; portraitKey?: string; status?: string } = {
        pk: selectedFigure.pk,
      };
      const nextThumbnailKey =
        type === 'thumbnail' ? result.key : selectedFigure.thumbnailKey || undefined;
      const nextPortraitKey =
        type === 'portrait' ? result.key : selectedFigure.portraitKey || undefined;

      if (nextThumbnailKey) {
        payload.thumbnailKey = nextThumbnailKey;
      }
      if (nextPortraitKey) {
        payload.portraitKey = nextPortraitKey;
      }
      if (nextThumbnailKey && nextPortraitKey && selectedFigure.status !== 'available') {
        payload.status = 'available';
      }

      await updateMutation.mutateAsync(payload);

      setMessage(
        `${type === 'thumbnail' ? 'サムネイル' : '肖像画'}をアップロードしました: s3://${result.bucket}/${result.key}` +
          (payload.status === 'available' ? '（ステータスをavailableに更新）' : ''),
      );
      if (type === 'thumbnail') {
        setThumbnailFile(null);
      } else {
        setPortraitFile(null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'アップロードに失敗しました';
      setMessage(message);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-center gap-2">
        <DocumentDuplicateIcon className="h-5 w-5 text-slate-200" />
        <div>
          <h2 className="text-lg font-semibold text-white">S3アセットをアップロード</h2>
          <p className="text-xs text-slate-400">
            サムネイルは <code>histrical-person-thumbnails</code>、肖像画は{' '}
            <code>{'artifacts > portraits/'}</code> にPUTします。
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Select
          label="人物を選択"
          value={selectedPk}
          onChange={(event) => setSelectedPk(event.target.value)}
        >
          <option value="">{figures.length === 0 ? '登録済みの人物がありません' : '人物を選択してください'}</option>
          {figures.map((figure) => (
            <option key={figure.pk} value={figure.pk}>
              {figure.name}（{figure.status}）
            </option>
          ))}
        </Select>
        {selectedFigure && (
          <div className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span>現在の状態:</span>
              <StatusBadge status={selectedFigure.status} />
            </div>
            <p className="mt-1">サムネイル: {selectedFigure.thumbnailKey ? '登録済み' : '未登録'}</p>
            <p>肖像画: {selectedFigure.portraitKey ? '登録済み' : '未登録'}</p>
          </div>
        )}
        <label className="flex flex-col gap-2 text-xs font-medium text-slate-200">
          サムネイル (推奨: PNG 1280x720)
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setThumbnailFile(file);
            }}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={(uploadMutation.isPending && uploadMutation.variables?.type === 'thumbnail') || updateMutation.isPending}
            onClick={() => handleUpload('thumbnail')}
          >
            アップロード
          </Button>
        </label>

        <label className="flex flex-col gap-2 text-xs font-medium text-slate-200">
          肖像画 (jpg/png/webp)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setPortraitFile(file);
            }}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={(uploadMutation.isPending && uploadMutation.variables?.type === 'portrait') || updateMutation.isPending}
            onClick={() => handleUpload('portrait')}
          >
            アップロード
          </Button>
        </label>
        {message && (
          <p className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function inferContentType(extension: string): string {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function FigureDetailCard({ figure }: { figure: Figure | null }) {
  const updateMutation = useUpdateFigureMutation();
  const [local, setLocal] = useState({
    youtubeTitle: '',
    status: 'ready',
    notes: '',
    bio: '',
    tags: '',
  });
  const [info, setInfo] = useState<string | null>(null);

  const updateField = (field: keyof typeof local) => (value: string) => {
    setInfo(null);
    setLocal((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!figure) return;
    setLocal({
      youtubeTitle: figure.youtubeTitle ?? '',
      status: figure.status,
      notes: figure.notes ?? '',
      bio: figure.bio ?? '',
      tags: (figure.tags ?? []).join(', '),
    });
    setInfo(null);
  }, [figure]);

  if (!figure) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
        左側のリストから人物を選択すると詳細を編集できます。
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        pk: figure.pk,
        youtubeTitle: local.youtubeTitle.trim() || undefined,
        status: local.status,
        notes: local.notes.trim() || undefined,
        bio: local.bio.trim() || undefined,
        tags: local.tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setInfo('更新しました。');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '更新に失敗しました';
      setInfo(message);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{figure.name}</h2>
          <p className="text-xs text-slate-400">pk: {figure.pk}</p>
        </div>
        <StatusBadge status={figure.status} />
      </div>

      <dl className="grid grid-cols-1 gap-2 text-xs text-slate-400">
        <DetailRow term="登録">
          {figure.createdAt
            ? format(new Date(figure.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })
            : '---'}
        </DetailRow>
        <DetailRow term="更新">
          {figure.updatedAt
            ? `${format(new Date(figure.updatedAt), 'yyyy/MM/dd HH:mm', { locale: ja })}（${formatDistanceToNow(
                new Date(figure.updatedAt),
                { addSuffix: true, locale: ja },
              )}）`
            : '---'}
        </DetailRow>
        {figure.video?.youtubeId && (
          <DetailRow term="YouTube ID">{figure.video.youtubeId}</DetailRow>
        )}
        {figure.video?.s3Key && (
          <DetailRow term="Video S3 Key">{figure.video.s3Key}</DetailRow>
        )}
        {figure.lockedUntil && (
          <DetailRow term="Locked Until">
            {format(new Date(figure.lockedUntil), 'yyyy/MM/dd HH:mm', { locale: ja })}
          </DetailRow>
        )}
      </dl>

      <form className="flex flex-col gap-3 text-sm" onSubmit={handleSubmit}>
        <Input
          label="YouTubeタイトル"
          value={local.youtubeTitle}
          onChange={(event) => updateField('youtubeTitle')(event.target.value)}
          placeholder="【◯◯の名言】..."
        />
        <Select
          label="ステータス"
          value={local.status}
          onChange={(event) => updateField('status')(event.target.value)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <Textarea
          label="概要 / Bio"
          value={local.bio}
          onChange={(event) => updateField('bio')(event.target.value)}
          rows={3}
        />
        <Textarea
          label="備考 / Notes"
          value={local.notes}
          onChange={(event) => updateField('notes')(event.target.value)}
          rows={3}
        />
        <Input
          label="タグ (カンマ区切り)"
          value={local.tags}
          onChange={(event) => updateField('tags')(event.target.value)}
        />
        {figure.aiPlan && (
          <div className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
            <p className="font-semibold text-slate-200">AIプラン</p>
            <ul className="mt-1 space-y-1">
              {figure.aiPlan.summary && <li>・{figure.aiPlan.summary}</li>}
              {figure.aiPlan.hook && <li>・Hook: {figure.aiPlan.hook}</li>}
              {figure.aiPlan.thumbnailIdea && (
                <li>・Thumbnail: {figure.aiPlan.thumbnailIdea}</li>
              )}
              {figure.aiPlan.sources && figure.aiPlan.sources.length > 0 && (
                <li>・Sources: {figure.aiPlan.sources.join(', ')}</li>
              )}
              {figure.aiPlan.tags && figure.aiPlan.tags.length > 0 && (
                <li>・Tags: {figure.aiPlan.tags.join(', ')}</li>
              )}
            </ul>
          </div>
        )}
        <Button
          type="submit"
          size="sm"
          loading={updateMutation.isPending}
        >
          {updateMutation.isPending ? '保存中…' : '変更を保存'}
        </Button>
        {info && (
          <p className="text-xs text-slate-300">
            {info}
          </p>
        )}
      </form>
    </div>
  );
}

function DetailRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{term}</dt>
      <dd className="flex-1 text-slate-200">{children}</dd>
    </div>
  );
}
