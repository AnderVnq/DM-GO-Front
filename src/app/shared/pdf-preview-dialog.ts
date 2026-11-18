import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  untracked,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { requestMessage } from '../core/api-problem';
import { PdfPreviewService, type PdfPreviewRequest } from './pdf-preview.service';
import { Icon } from './icon';

@Component({
  selector: 'app-pdf-preview-dialog',
  imports: [Icon],
  templateUrl: './pdf-preview-dialog.html',
  styleUrl: './pdf-preview-dialog.scss',
})
export class PdfPreviewDialog {
  readonly preview = inject(PdfPreviewService);
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly zoom = signal(1);
  readonly text = signal('');
  readonly image = signal('');
  private readonly blob = signal<Blob | null>(null);
  private doc: PDFDocumentProxy | null = null;
  private task: PDFDocumentLoadingTask | null = null;
  private renderTask: RenderTask | null = null;
  private subscription?: Subscription;
  private generation = 0;
  constructor() {
    afterRenderEffect(() => {
      const request = this.preview.request();
      untracked(() => {
        if (request) this.start(request);
        else {
          this.dispose();
          this.dialog().nativeElement.close();
        }
      });
    });
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.preview.close();
      });
    inject(DestroyRef).onDestroy(() => this.dispose());
  }
  close(event?: Event) {
    event?.preventDefault();
    this.preview.close();
  }
  retry() {
    const request = this.preview.request();
    if (request) this.start(request);
  }
  private start(request: PdfPreviewRequest) {
    this.dispose();
    const generation = this.generation;
    this.page.set(1);
    this.total.set(0);
    this.zoom.set(1);
    this.text.set('');
    this.error.set('');
    this.loading.set(true);
    if (!this.dialog().nativeElement.open) this.dialog().nativeElement.showModal();
    try {
      this.subscription = request.source().subscribe({
        next: (blob) => {
          void this.load(blob, generation);
        },
        error: (error: unknown) => this.fail(error, generation),
      });
    } catch (error) {
      this.fail(error, generation);
    }
  }
  private async load(blob: Blob, generation: number) {
    try {
      if (!blob.size) throw new Error('El documento está vacío.');
      if (generation !== this.generation) return;
      if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
        this.blob.set(blob);
        this.image.set(URL.createObjectURL(blob));
        this.loading.set(false);
        return;
      }
      if (!blob.type.includes('pdf')) throw new Error('La respuesta recibida no es un PDF.');
      this.blob.set(blob);
      const data = new Uint8Array(await blob.arrayBuffer());
      const pdf = await import('pdfjs-dist');
      if (generation !== this.generation) return;
      pdf.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      this.task = pdf.getDocument({
        data,
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/',
      });
      const document = await this.task.promise;
      if (generation !== this.generation) {
        return;
      }
      this.doc = document;
      this.total.set(document.numPages);
      await this.render(generation);
    } catch (error) {
      this.fail(error, generation);
    }
  }
  async turn(direction: number) {
    const next = this.page() + direction;
    if (this.loading() || next < 1 || next > this.total()) return;
    this.page.set(next);
    await this.render(this.generation);
  }
  async resizeZoom(direction: number) {
    if (this.loading()) return;
    this.zoom.set(Math.max(0.5, Math.min(2, this.zoom() + direction * 0.25)));
    await this.render(this.generation);
  }
  private async render(generation: number) {
    if (!this.doc) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.doc.getPage(this.page());
      if (generation !== this.generation) return;
      const width = Math.max(240, this.content().nativeElement.clientWidth - 32);
      const viewport = page.getViewport({
        scale: Math.min(width / page.getViewport({ scale: 1 }).width, 1.5) * this.zoom(),
      });
      const canvas = this.canvas().nativeElement;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo mostrar el documento en este navegador.');
      this.renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await this.renderTask.promise;
      const text = await page.getTextContent();
      if (generation !== this.generation) return;
      this.text.set(text.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      this.loading.set(false);
    } catch (error) {
      this.fail(error, generation);
    }
  }
  download() {
    const request = this.preview.request();
    const blob = this.blob();
    if (!request || !blob) return;
    try {
      this.preview.save(blob, request.filename);
    } catch (error) {
      this.error.set(requestMessage(error));
    }
  }
  get downloadable() {
    return !!this.blob();
  }
  private async fail(error: unknown, generation: number) {
    if (generation !== this.generation) return;
    if (
      error instanceof HttpErrorResponse &&
      error.error instanceof Blob &&
      error.error.type.includes('json')
    ) {
      try {
        const problem: unknown = JSON.parse(await error.error.text());
        if (problem && typeof problem === 'object')
          error = { status: error.status, error: problem };
      } catch {
        /* Conservar el mensaje HTTP si la respuesta no es JSON válido. */
      }
    }
    if (generation !== this.generation) return;
    this.loading.set(false);
    const name = error instanceof Error ? error.name : '';
    this.error.set(
      name === 'PasswordException'
        ? 'El PDF está protegido con contraseña. Descárgalo para abrirlo.'
        : name === 'InvalidPDFException'
          ? 'El archivo recibido es un PDF inválido o incompleto. Solicita una copia válida del documento original para corregir el adjunto.'
          : requestMessage(error),
    );
  }
  private dispose() {
    this.generation++;
    this.subscription?.unsubscribe();
    this.renderTask?.cancel();
    this.renderTask = null;
    if (this.task) void this.task.destroy().catch(() => {});
    this.task = null;
    this.doc = null;
    this.blob.set(null);
    if (this.image()) URL.revokeObjectURL(this.image());
    this.image.set('');
  }
}
