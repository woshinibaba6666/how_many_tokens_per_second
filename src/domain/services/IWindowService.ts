export interface IWindowService {
  minimize(): Promise<void>
  maximize(): Promise<boolean>
  close(): Promise<void>
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}
