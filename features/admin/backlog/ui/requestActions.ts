import {
  createRequest,
  createRequestImageUpload,
  deleteRequest,
  deleteRequestImage,
  finalizeRequestImage,
  updateRequest,
} from '@/features/admin/backlog/server';

import type { PutFile, RequestActions } from '../types';

/** PUT the file body to a signed upload URL with progress (XHR: fetch has no upload progress). */
export const defaultPutFile: PutFile = (url, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });

/** The real request actions; components add `navigate` from the router. */
export const SERVER_REQUEST_ACTIONS = {
  createRequest,
  updateRequest,
  deleteRequest,
  createRequestImageUpload,
  finalizeRequestImage,
  deleteRequestImage,
  putFile: defaultPutFile,
} satisfies Omit<RequestActions, 'navigate'>;
