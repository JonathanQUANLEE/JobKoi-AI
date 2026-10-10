import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { UploadCloud, CheckCircle2, FileText, X } from "lucide-react";
import "./HaloDropzone.css";

export interface QueuedFile {
  id: string;
  file: File;
  progress: number;
  done: boolean;
}

export function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

interface HaloDropzoneProps {
  accept?: string;
  formatHint?: string;
  multiple?: boolean;
  translucent?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}

export function HaloDropzone({
  accept = ".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp",
  formatHint = "支持 PDF、Word (.docx/.doc)、纯文本及证书图片",
  multiple = false,
  onFiles,
  className = "",
}: HaloDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFiles(multiple ? files : [files[0]]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFiles(multiple ? files : [files[0]]);
      e.target.value = "";
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`halo-dropzone ${isDragging ? "is-dragging" : ""} ${className}`}
    >
      <div className="halo-dropzone__halo" />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-1.5 pointer-events-none relative z-10">
        <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-sm">
          <UploadCloud className="size-4.5" />
        </div>
        <p className="text-xs font-bold text-stone-200">
          点击或拖拽简历文件到此处
        </p>
        <p className="text-[10px] text-stone-400">
          {formatHint}
        </p>
      </div>
    </div>
  );
}

interface DropzoneUploadFileListProps {
  items: QueuedFile[];
  onRemove: (id: string) => void;
  className?: string;
}

export function DropzoneUploadFileList({
  items,
  onRemove,
  className = "",
}: DropzoneUploadFileListProps) {
  if (items.length === 0) return null;

  return (
    <div className={`halo-upload-list ${className}`}>
      {items.map((item) => (
        <div
          key={item.id}
          className={`halo-upload-item ${item.done ? "is-done" : ""}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="size-3.5 text-amber-400 shrink-0" />
            <span className="font-mono text-stone-200 truncate">
              {item.file.name}
            </span>
            <span className="text-[10px] text-stone-500 shrink-0">
              ({(item.file.size / 1024).toFixed(1)} KB)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.done ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                <CheckCircle2 className="size-3.5" />
                <span>已解析</span>
              </span>
            ) : (
              <div className="w-16 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="text-stone-400 hover:text-stone-200 transition-colors p-0.5"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
