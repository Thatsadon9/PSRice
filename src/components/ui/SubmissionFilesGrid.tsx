'use client';
/* eslint-disable @next/next/no-img-element */

import { Download, FileText, Image as ImageIcon, Video, XCircle } from 'lucide-react';
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
}

export default function SubmissionFilesGrid({
  files,
  emptyLabel = 'ไม่มีไฟล์แนบ',
  className = '',
  onRemove,
}: SubmissionFilesGridProps) {
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

            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white shadow-sm"
                aria-label="ลบไฟล์แนบ"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}

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
    </div>
  );
}
