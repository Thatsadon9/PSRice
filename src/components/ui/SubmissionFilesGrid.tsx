'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Video, XCircle } from 'lucide-react';
import { downloadFileFromUrl } from '@/lib/storage';
import type { FileType } from '@/lib/types';

export interface PreviewFile {
  id: string;
  file_url: string;
  file_type: FileType;
  label?: string;
}

interface SubmissionFilesGridProps {
  files: PreviewFile[];
  emptyLabel?: string;
  className?: string;
  onRemove?: (id: string) => void;
  allowDownload?: boolean;
}

export default function SubmissionFilesGrid({
  files,
  emptyLabel = 'ไม่มีไฟล์แนบ',
  className = '',
  onRemove,
  allowDownload = false,
}: SubmissionFilesGridProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');

  const handleDownload = async (file: PreviewFile) => {
    setDownloadError('');
    setDownloadingId(file.id);

    try {
      await downloadFileFromUrl(file.file_url, file.label);
    } catch (error) {
      console.error('Failed to download submission file:', error);
      setDownloadError('ไม่สามารถดาวน์โหลดไฟล์แนบได้ ลองใหม่อีกครั้ง');
    } finally {
      setDownloadingId((current) => (current === file.id ? null : current));
    }
  };

  if (files.length === 0) {
    return (
      <div className={`col-span-full py-8 bg-slate-50 rounded-lg flex flex-col items-center justify-center text-slate-400 ${className}`}>
        <FileText className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-xs">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
      {files.map((file) => {
        const isVideo = file.file_type === 'video';
        const isDownloading = downloadingId === file.id;

        return (
          <div key={file.id} className="group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video">
            {isVideo ? (
              <video
                src={file.file_url}
                controls
                preload="metadata"
                className="w-full h-full object-cover bg-black"
              />
            ) : (
              <img src={file.file_url} alt={file.label || 'Proof'} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            )}

            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              {allowDownload && (
                <button
                  type="button"
                  onClick={() => void handleDownload(file)}
                  disabled={isDownloading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 disabled:cursor-wait disabled:opacity-80"
                  aria-label={isVideo ? 'ดาวน์โหลดวิดีโอหลักฐาน' : 'ดาวน์โหลดรูปหลักฐาน'}
                  title={isVideo ? 'ดาวน์โหลดวิดีโอหลักฐาน' : 'ดาวน์โหลดรูปหลักฐาน'}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
              )}

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
                  aria-label="ลบไฟล์แนบ"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {!isVideo && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                <div className="p-2 bg-white rounded-full text-slate-900 shadow-lg">
                  <Download className="w-5 h-5" />
                </div>
              </div>
            )}

            <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
              {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
              {isVideo ? 'VIDEO' : 'IMAGE'}
            </div>
          </div>
        );
      })}

      {downloadError && (
        <p className="col-span-full text-xs font-medium text-red-600">{downloadError}</p>
      )}
    </div>
  );
}
