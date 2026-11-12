import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from './runtime-config';

export interface DownloadLink {
  url: string;
  expires_at: string;
}
export interface DocumentResponse {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);

  upload(file: File) {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<DocumentResponse>(`${this.config.value.apiBaseUrl}/documents`, data);
  }

  download(id: string) {
    return this.http.get<DownloadLink>(
      `${this.config.value.apiBaseUrl}/documents/${encodeURIComponent(id)}/download`,
    );
  }
}
