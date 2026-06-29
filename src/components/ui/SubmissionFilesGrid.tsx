'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Video, XCircle, ZoomIn } from 'lucide-react';
import { downloadFileFromUrl } from '@/lib/storage';
import type { FileType } from '@/lib/types';
import Modal from '@/components/ui/Modal';

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
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

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
      <div className={`col-span-full flex flex-col items-center justify-center rounded-xl bg-slate-50 py-8 text-slate-400 ${className}`}>
        <FileText className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-xs">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
        {files.map((file) => {
          const isVideo = file.file_type === 'video';
        const isDownloading = downloadingId === file.id;

        return (
          <div key={file.id} className="group relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {isVideo ? (
              <video
                src={file.file_url}
                controls
                preload="metadata"
                className="h-full w-full bg-black object-cover"
              />
            ) : (
              <img src={file.file_url} alt={file.label || 'Proof'} className="h-full w-full object-cover" />
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
              <div 
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                onClick={() => setZoomedImage(file.file_url)}
              >
                <div className="p-2 bg-white rounded-full text-slate-900 shadow-lg transition-transform hover:scale-110">
                  <ZoomIn className="w-5 h-5" />
                </div>
              </div>
            )}

            <div className="absolute top-2 left-2 pointer-events-none z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
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

      <Modal isOpen={!!zoomedImage} onClose={() => setZoomedImage(null)} size="full" title="รูปภาพขนาดเต็ม">
        {zoomedImage && (
          <div className="flex items-center justify-center bg-black/5 rounded-xl overflow-hidden min-h-[50vh] p-4">
            <img 
              src={zoomedImage} 
              alt="Zoomed preview" 
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-md" 
            />
          </div>
        )}
      </Modal>
    </>
  );
}
