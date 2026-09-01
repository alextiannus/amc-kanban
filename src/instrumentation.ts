import { installPerformanceLogging } from './lib/performance-log'

export async function register() {
  installPerformanceLogging('amc-kanban')
}
