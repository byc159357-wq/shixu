import type { WorkdeckApi } from '../../../shared/types'

declare global {
  interface Window {
    workdeck: WorkdeckApi
  }
}

export {}
