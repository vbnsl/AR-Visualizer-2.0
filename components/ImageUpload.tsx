"use client";

import { useRef } from "react";

interface ImageUploadProps {
  onImageLoad: (url: string) => void;
  disabled?: boolean;
}

export default function ImageUpload({ onImageLoad, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    onImageLoad(url);
  };

  const handleSampleRoom = () => {
    onImageLoad("/sample-room.jpg");
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
      >
        Upload room photo
      </button>
      <button
        type="button"
        onClick={handleSampleRoom}
        disabled={disabled}
        className="rounded-lg border border-slate-500 bg-transparent px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
      >
        Use sample room
      </button>
    </div>
  );
}
