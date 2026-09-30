// Resumable/versioned uploads via Uppy. The prototype has no server, so a local uploader simulates progress;
// flip MOCK_UPLOAD to false (and set VITE_UPLOAD_URL, or swap @uppy/tus) to use real XHR uploads — callers don't change.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import XHRUpload from '@uppy/xhr-upload';
import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';

const MOCK_UPLOAD = true;
export interface UploaderApi { upload: () => Promise<string[]>; count: () => number }

export default function UppyUploader({ apiRef, onChange }: { apiRef: Ref<UploaderApi>; onChange: (names: string[]) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const uppyRef = useRef<Uppy | null>(null);
  useEffect(() => {
    const uppy = new Uppy({ autoProceed: false, restrictions: { maxFileSize: 200 * 1024 * 1024, maxNumberOfFiles: 8 } });
    uppy.use(Dashboard, { inline: true, target: host.current!, height: 250, width: '100%', hideUploadButton: true, proudlyDisplayPoweredByUppy: false, note: 'PDF, images, zip or video · up to 200 MB each · uploads resume if the connection drops' });
    if (MOCK_UPLOAD) {
      uppy.addUploader(async (ids: string[]) => {
        for (const id of ids) {
          const file = uppy.getFile(id);
          const total = file.size ?? 1;
          uppy.emit('upload-start', [file]);
          for (let i = 1; i <= 5; i++) {
            await new Promise((r) => setTimeout(r, 90));
            uppy.emit('upload-progress', uppy.getFile(id), { uploadStarted: Date.now(), bytesUploaded: Math.round((total * i) / 5), bytesTotal: total } as never);
          }
          uppy.emit('upload-success', uppy.getFile(id), { status: 200, body: {}, uploadURL: `mock://${file.name}` } as never);
        }
      });
    } else {
      uppy.use(XHRUpload, { endpoint: import.meta.env.VITE_UPLOAD_URL ?? '/upload' });
    }
    const sync = () => onChange(uppy.getFiles().map((f) => f.name));
    uppy.on('file-added', sync); uppy.on('file-removed', sync);
    uppyRef.current = uppy;
    return () => { uppy.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(apiRef, () => ({
    count: () => uppyRef.current?.getFiles().length ?? 0,
    upload: async () => {
      const u = uppyRef.current!;
      await u.upload();
      return u.getFiles().map((f) => f.name);
    },
  }));
  return <div ref={host} aria-label="File upload" />;
}
