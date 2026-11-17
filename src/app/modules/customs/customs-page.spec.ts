import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { PdfPreviewService } from '../../shared/pdf-preview.service';
import { CustomsApi } from './customs-api';
import { CustomsPage } from './customs-page';
import type { CustomsLine } from './customs.model';
const line: CustomsLine = {
  id: '44444444-4444-4444-8444-444444444444',
  package_id: 'p1',
  customer_id: 'c1',
  guide: 'H-42',
  customs_manifest: 'MAN-42',
  declaration: 'DAM-42',
  tax_cents: 100,
  currency: 'PEN',
  channel: 'red',
  status: 'proof_sent',
  proof_submitted: true,
  assessment_document_id: '',
  proof_document_id: 'doc1',
  released_at: null,
};
function setup() {
  const api = {
    importReport: vi.fn(() => throwError(() => ({ status: 500 }))),
    pending: vi.fn(() => of([line])),
    get: vi.fn(() => of<CustomsLine>(line)),
    release: vi.fn(() => of<CustomsLine>({ ...line, status: 'released' })),
    attach: vi.fn(() => of<CustomsLine>(line)),
  };
  const docs = { upload: vi.fn(() => of({ id: 'uploaded-document' })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { manager: () => true } },
      { provide: CustomsApi, useValue: api },
      { provide: DocumentsApi, useValue: docs },
      { provide: PdfPreviewService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(CustomsPage);
  fixture.detectChanges();
  fixture.nativeElement
    .querySelectorAll('dialog')
    .forEach((dialog: HTMLDialogElement) =>
      Object.assign(dialog, { showModal: vi.fn(), close: vi.fn() }),
    );
  const page = fixture.componentInstance;
  page.selected.set(line);
  return { page, api, docs };
}
afterEach(() => TestBed.resetTestingModule());
it('exige confirmar y evita doble liberación y cancelación mientras guarda', () => {
  const { page, api } = setup();
  page.release();
  expect(api.release).not.toHaveBeenCalled();
  const pending = new Subject<CustomsLine>();
  api.release.mockReturnValue(pending);
  page.prepareRelease();
  page.release();
  page.release();
  page.cancelRelease();
  expect(api.release).toHaveBeenCalledTimes(1);
  expect(page.releasing()).toBe(true);
  pending.next({ ...line, status: 'released' });
  expect(page.releasing()).toBe(false);
  expect(page.selected()?.status).toBe('released');
});
it('un conflicto recarga el estado canónico sin anunciar éxito', () => {
  const { page, api } = setup();
  api.release.mockReturnValue(throwError(() => ({ status: 409 })));
  api.get.mockReturnValue(of({ ...line, status: 'released' }));
  page.prepareRelease();
  page.release();
  expect(page.selected()?.status).toBe('released');
  expect(page.notice()).toBe('');
  expect(page.canReleaseSelected).toBe(false);
});
it('bloquea acciones si falla la recarga tras un resultado incierto', () => {
  const { page, api } = setup();
  api.release.mockReturnValue(throwError(() => ({ status: 200 })));
  api.get.mockReturnValue(throwError(() => ({ status: 503 })));
  page.prepareRelease();
  page.release();
  expect(page.stale()).toBe(true);
  expect(page.canReleaseSelected).toBe(false);
  page.release();
  expect(api.release).toHaveBeenCalledTimes(1);
});
it('conserva el documento ya subido al reintentar una asociación rechazada', () => {
  const { page, api, docs } = setup();
  page.startDocument('assessment');
  page.chooseDocument({
    target: { files: [new File(['%PDF-test'], 'liquidacion.pdf', { type: 'application/pdf' })] },
  } as unknown as Event);
  api.attach.mockReturnValue(throwError(() => ({ status: 422 })));
  page.saveDocument();
  expect(docs.upload).toHaveBeenCalledTimes(1);
  expect(page.attaching()).toBe(true);
  expect(page.documentFile()?.name).toBe('liquidacion.pdf');
  api.attach.mockReturnValue(of(line));
  page.saveDocument();
  expect(docs.upload).toHaveBeenCalledTimes(1);
  expect(api.attach).toHaveBeenLastCalledWith(line.id, 'assessment', 'uploaded-document');
  expect(page.attaching()).toBe(false);
});

it('una importación incierta invalida la ficha hasta recuperar el detalle actual', () => {
  const { page, api } = setup();
  page.startImport();
  page.report.controls.customs_manifest.setValue('MAN-42');
  page.reportFile.set(
    new File(['guia,declaracion,tributo,canal'], 'agente.csv', { type: 'text/csv' }),
  );
  api.get.mockReturnValue(throwError(() => ({ status: 503 })));
  page.importReport();
  page.cancelImport();
  expect(page.reportUncertain()).toBe(true);
  expect(page.stale()).toBe(true);
  expect(page.canReleaseSelected).toBe(false);
  expect(api.get).toHaveBeenCalledWith(line.id);
  api.get.mockReturnValue(
    of({ ...line, status: 'pending_tax', tax_cents: 5000, proof_document_id: '' }),
  );
  page.reloadDetail();
  expect(page.selected()?.tax_cents).toBe(5000);
  expect(page.canReleaseSelected).toBe(false);
});
