import { HttpBackend, HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
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
  private readonly storage = new HttpClient(inject(HttpBackend));
  private readonly config = inject(RuntimeConfig);

  upload(file: File) {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<DocumentResponse>(`${this.config.value.apiBaseUrl}/documents`, data);
  }

  uploadDirect(file: File) {
    const base = `${this.config.value.apiBaseUrl}/documents/uploads`;
    return this.http
      .post<{
        upload_id: string;
        method: string;
        url: string;
        headers: Record<string, string>;
        expires_at: string;
      }>(base, {
        name: file.name,
        mime_type: file.type,
        size: file.size,
      })
      .pipe(
        switchMap((ticket) => {
          const url = new URL(ticket.url, location.origin);
          if (ticket.method !== 'PUT' || !['http:', 'https:'].includes(url.protocol)) {
            throw new Error('No se recibió un enlace de subida válido.');
          }
          // La URL ya está firmada: el almacenamiento no recibe el Bearer de la API.
          return this.storage
            .put(url.href, file, { headers: ticket.headers, responseType: 'text' })
            .pipe(
              switchMap(() =>
                this.http.post<DocumentResponse>(
                  `${base}/${encodeURIComponent(ticket.upload_id)}/complete`,
                  {},
                ),
              ),
            );
        }),
      );
  }

  download(id: string) {
    return this.http.get<DownloadLink>(
      `${this.config.value.apiBaseUrl}/documents/${encodeURIComponent(id)}/download`,
    );
  }
}
