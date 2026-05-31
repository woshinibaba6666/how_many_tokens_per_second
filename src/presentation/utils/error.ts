import { ElMessageBox } from 'element-plus'

export function parseHttpError(error: unknown): { statusCode: string; message: string } {
  const err = error instanceof Error ? error : new Error(String(error))
  const match = err.message.match(/HTTP\s+(\d+):\s*(.*)/)
  return {
    statusCode: match ? match[1] : 'Unknown',
    message: match ? match[2] : err.message,
  }
}

export function showErrorDialog(
  error: unknown,
  title: string,
  confirmText: string,
  formatMessage: (code: string, msg: string) => string
): void {
  const { statusCode, message } = parseHttpError(error)
  ElMessageBox.alert(formatMessage(statusCode, message), title, {
    confirmButtonText: confirmText,
    type: 'error',
  })
}
