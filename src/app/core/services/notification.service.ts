import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Non-blocking feedback messages (no modals). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 2500, panelClass: 'sf-snack-success' });
  }

  error(message: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: 5000,
      panelClass: 'sf-snack-error',
      politeness: 'assertive',
    });
  }

  /** Shows a message with an action (e.g. "Desfazer"), calling `onAction` when chosen. */
  withAction(message: string, action: string, onAction: () => void): void {
    this.snackBar
      .open(message, action, { duration: 6000 })
      .onAction()
      .subscribe(() => onAction());
  }
}
