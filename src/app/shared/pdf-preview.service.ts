import { RuntimeConfig } from '../core/runtime-config';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { type Observable, map } from 'rxjs';
import { savePdf } from './download';

export type PdfSource = () => Observable<Blob>;
export interface PdfPreviewRequest {
  title: string;
  filename: string;
  source: PdfSource;
}

@Injectable({ providedIn: 'root' })
export class PdfPreviewService {
  private readonly injector = inject(Injector);
  readonly request = signal<PdfPreviewRequest | null>(null);
  open(title: string, filename: string, source: PdfSource) {
    this.request.set({ title, filename, source });
  }
  close() {
    this.request.set(null);
  }
  fetch(url: string): Observable<Blob> {
    const target = new URL(url, location.origin);
    if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password)
      throw new Error('El enlace del documento no es válido.');
    // El enlace firmado no debe recibir el Bearer ni los interceptores de la API.
    const origin = this.injector.get(RuntimeConfig).value.documentProxyOrigin;
    const href =
      origin === target.origin
        ? `/document-storage${target.pathname}${target.search}`
        : target.href;
    return new HttpClient(this.injector.get(HttpBackend)).get(href, {
      responseType: 'blob',
    });
  }
  download(filename: string, source: PdfSource): Observable<void> {
    return source().pipe(map((blob) => this.save(blob, filename)));
  }
  save(blob: Blob, filename: string) {
    if (blob.type.includes('pdf')) return savePdf(blob, filename);
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensions[blob.type];
    if (!extension || !blob.size) throw new Error('El archivo recibido no se puede previsualizar.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/\.[^.]+$/, '') + '.' + extension;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
