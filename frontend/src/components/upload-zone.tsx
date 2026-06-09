'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { UploadCloud, File, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UploadZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setError(null);
    if (fileRejections.length > 0) {
      setError(fileRejections[0].errors[0].message);
    }
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxSize: 25 * 1024 * 1024, // 25MB
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadMutation = useMutation({
    mutationFn: async (uploadFiles: File[]) => {
      const formData = new FormData();
      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });
      return apiClient('/documents/upload', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during upload.');
      }
    },
  });

  const handleUpload = () => {
    if (files.length === 0) return;
    uploadMutation.mutate(files);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto h-12 w-12 text-zinc-400 mb-4" />
        {isDragActive ? (
          <p className="text-zinc-600 dark:text-zinc-300">Drop the PDFs here ...</p>
        ) : (
          <div>
            <p className="text-zinc-600 dark:text-zinc-300 font-medium">
              Drag & drop some PDFs here, or click to select files
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Max 25MB per file. Only .pdf allowed.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-100 dark:bg-red-900/30 rounded-md">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h4 className="text-sm font-medium mb-3">Selected Files ({files.length})</h4>
          <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2">
            {files.map((file, idx) => (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between text-sm p-2 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-100 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2 truncate pr-4">
                  <File className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-zinc-500 flex-shrink-0 text-xs">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-zinc-400 hover:text-red-500 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="gap-2"
            >
              {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
