import { toast } from 'sonner';
import { logger } from './logger';

/** The caller supplies translated feedback; technical details stay in the log. */
export function reportUiError(message: string, error: unknown): void {
  logger.warn('ui.operation_failed', { message, error: error instanceof Error ? error.message : String(error) });
  toast.error(message);
}
