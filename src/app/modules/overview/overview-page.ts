import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BillingApi, type DispatchNote } from '../billing';
import { QuotesApi, type Quote } from '../quotes';
import { AuthService } from '../../core/auth.service';
import { requestMessage } from '../../core/api-problem';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { formatUsd, formatDate } from '../../shared/amount';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-overview-page',
  imports: [RouterLink, Icon, Status],
  templateUrl: './overview-page.html',
})
export class OverviewPage {
  readonly auth = inject(AuthService);
  private readonly billing = inject(BillingApi);
  private readonly quotesApi = inject(QuotesApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly notes = signal<DispatchNote[]>([]);
  readonly quotes = signal<Quote[]>([]);
  readonly notesLoading = signal(false);
  readonly quotesLoading = signal(false);
  readonly notesError = signal('');
  readonly quotesError = signal('');
  readonly money = formatUsd;
  readonly date = formatDate;
  constructor() {
    this.loadNotes();
    this.loadQuotes();
  }
  loadNotes() {
    if (this.notesLoading()) return;
    this.notesLoading.set(true);
    this.notesError.set('');
    this.billing
      .list({ limit: 5 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (notes) => {
          this.notes.set(notes);
          this.notesLoading.set(false);
        },
        error: (error: unknown) => {
          this.notesError.set(requestMessage(error));
          this.notesLoading.set(false);
        },
      });
  }
  loadQuotes() {
    if (this.quotesLoading()) return;
    this.quotesLoading.set(true);
    this.quotesError.set('');
    this.quotesApi
      .list({ limit: 5 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quotes) => {
          this.quotes.set(quotes);
          this.quotesLoading.set(false);
        },
        error: (error: unknown) => {
          this.quotesError.set(requestMessage(error));
          this.quotesLoading.set(false);
        },
      });
  }
}
