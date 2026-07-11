# AMC-Kanban Local Agent Rules

## Concurrency and Test Limits
- **Hard Rule**: Always stop or kill any local command, build, or test execution if it runs for more than 5 minutes (300,000 ms). Never allow tasks to exceed this limit.
