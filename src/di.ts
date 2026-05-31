import { ConfigStorage } from '@infrastructure/storage'
import { OpenAIAdapter } from '@infrastructure/api'
import type { IApiRepository } from '@domain/repositories'

export const configStorage = new ConfigStorage()
export const apiRepository: IApiRepository = new OpenAIAdapter()
