# Changelog

## [1.1.0] - 2025-05-22

### Added
- Introduced Projects feature for global organization of schedules and watchers.
- Data migration for existing workspace-local schedules/watchers into the new Projects system.
- Ability to create, edit, delete, and select active projects.
- Schedules and Watchers are now managed within the context of the active project.
- Added 'Add Schedule' and 'Add Watcher' shortcuts to Project Cards for quick navigation.

## [1.0.0] - 2025-05-16

### Added
- Added file watcher functionality to monitor directories for changes
- Implemented MCP server integration for AI assistant control
- Created tabbed interface for different schedule types (one-time, interval, cron)
- Added support for file type filtering in watchers
- Added MCP tools for schedule management (list, create, update, delete, toggle, run)

### Fixed
- Resolved issues with MCP server SDK integration
- Updated all tool schemas to be compatible with the latest MCP SDK

### Changed
- Complete UI overhaul with separate tabs for Schedules and Watchers
- Updated documentation to reflect new capabilities
- Improved project structure for better maintainability

## [0.0.10] - 2025-04-25

### Fixed
- Resolved an issue where `startDate` was set by default.

### Changed
- Updated scheduling logic for interval-based tasks:
  - **If a start date/time is specified:** Intervals are now calculated from the original start time. For example, for an hourly task with a start time of 10:00am, if execution is delayed (e.g., due to inactivity or the computer being off/in deep sleep) and the task runs at 10:15am, the next execution is scheduled for 11:00am.
  - **If no start time is specified:** The interval is calculated from the last execution time. For example, if the last execution was at 10:15am, the next execution will be at 11:15am.
- Updated "Usage Tips" in the README
