import type { TestConfig } from '@domain/entities'

export interface IConfigRepository {
  load(): Promise<TestConfig[]>
  save(configs: TestConfig[]): Promise<void>
}
