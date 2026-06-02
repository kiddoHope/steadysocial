# Task Extraction Guide

## Feature Overview

Planning files can now automatically recognize and extract tasks, then add them to your scheduler/calendar with full milestone tracking support.

## Task Syntax

Tasks in your planning files must use Markdown checkbox syntax:

```markdown
- [ ] Task Name
- [x] Completed Task
```

### Extended Format with Metadata

Add optional metadata separated by `|`:

```markdown
- [ ] Task Name | due: 2026-05-30 | priority: HIGH | milestones: Setup,Testing,Deploy | desc: Optional description

- [x] Completed Research | due: 2026-05-15 | priority: MEDIUM | milestones: Research,Analysis | desc: Market research completed

- [ ] Launch Campaign | due: 2026-06-15 | priority: CRITICAL | milestones: Planning,Execution,Monitoring,Reporting
```

### Metadata Fields

| Field | Values | Example | Required |
|-------|--------|---------|----------|
| `due` | YYYY-MM-DD format | `due: 2026-05-30` | Optional |
| `priority` | LOW, MEDIUM, HIGH, CRITICAL | `priority: HIGH` | Optional (defaults to MEDIUM) |
| `milestones` | Comma-separated labels | `milestones: Step1,Step2,Step3` | Optional |
| `desc` | Text description | `desc: This is a task description` | Optional |

## How to Use

### From the UI

1. **Open a planning file** (Markdown, CSV, or HTML format)
2. **Click "EXTRACT_TASKS"** button in the file viewer
3. **Review extracted tasks** in the modal that appears
4. **Select which tasks to create** (all are selected by default)
5. **Click "CREATE X TASKS"** to add them to your scheduler

### From the MCP Server

Use the MCP tools in your AI workflow:

```bash
extract_tasks_from_planning:
  filePath: "Perfume_Business_Strategy.md"

# Returns: taskCount and extracted tasks array

create_tasks_from_planning:
  filePath: "Perfume_Business_Strategy.md"
  autoSchedule: true

# Creates tasks directly in scheduler with milestones
```

## Example Planning File

```markdown
# Project Launch Strategy

## Phase 1: Planning & Design

- [ ] Define project scope | due: 2026-05-25 | priority: HIGH | milestones: Requirements,Design,Review | desc: Clarify all project requirements

- [ ] Create wireframes | due: 2026-05-28 | priority: HIGH | milestones: Sketches,Mockups,Validation

## Phase 2: Development

- [ ] Setup development environment | due: 2026-06-01 | priority: CRITICAL | milestones: Tools,Config,Testing

- [ ] Implement core features | due: 2026-06-15 | priority: HIGH | milestones: Feature1,Feature2,Integration,Testing

- [ ] Code review and refactoring | due: 2026-06-18 | priority: MEDIUM | milestones: Review,Refactor,Testing

## Phase 3: Testing & Deployment

- [ ] Quality assurance testing | due: 2026-06-22 | priority: CRITICAL | milestones: Unit Tests,Integration Tests,UAT | desc: Comprehensive testing of all features

- [ ] Deploy to production | due: 2026-06-25 | priority: CRITICAL | milestones: Staging,Production,Monitoring

- [x] Documentation completed | due: 2026-06-20 | priority: MEDIUM | milestones: API Docs,User Guide,Code Comments | desc: All docs updated
```

## Task Scheduler Integration

When tasks are created:

- **Type**: Automatically set to `TASK`
- **Status**: Set to `SCHEDULED`
- **Milestones**: Tracked with completion status (initially uncompleted)
- **Implementation File**: Linked back to the planning file for reference
- **Completion Percentage**: Calculated based on milestone progress
- **Page**: Set to `PLANNING_MODULE`

## Features

✅ Automatic task detection from planning files  
✅ Full milestone tracking with progress  
✅ Priority levels (LOW, MEDIUM, HIGH, CRITICAL)  
✅ Due date scheduling  
✅ Selective task creation  
✅ Calendar synchronization  
✅ Task descriptions for context  
✅ Multi-format support (Markdown, CSV, HTML)  
✅ MCP integration for AI workflows  

## Tips

1. **Use consistent formatting** - Tasks must have `- [ ]` or `- [x]` at the start
2. **Keep milestones concise** - Shorter names are clearer in the scheduler
3. **Set realistic due dates** - Format must be YYYY-MM-DD
4. **Priority levels** - Use CRITICAL for must-do tasks, LOW for nice-to-haves
5. **Descriptions** - Add context that helps team members understand the task

## Troubleshooting

- **No tasks found?** Check that lines start with `- [ ]` or `- [x]`
- **Metadata not parsing?** Ensure fields are separated by ` | ` (space, pipe, space)
- **Dates not recognized?** Use YYYY-MM-DD format (e.g., 2026-05-30)
- **Milestones not showing?** List them comma-separated: `milestones: Step1,Step2,Step3`

---

Version: 1.0 | Last Updated: May 20, 2026
