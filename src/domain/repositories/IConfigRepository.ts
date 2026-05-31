import type { AppConfig } from '@domain/entities'

export interface IConfigRepository {
  load(): Promise<AppConfig>
  save(config: AppConfig): Promise<void>
}
