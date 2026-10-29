# HabitGuard

GitHub repository: `habitgurd`.

HabitGuard is a self-contained, local-only browser app. Open `index.html` in a modern browser. Data is saved in that browser's local storage; it is not synchronized, backed up, or protected by an account. Avoid using a shared device for private journal content.

## Working locally

- Create, edit, pause, archive, restore, and delete positive habits. Schedules support daily, selected weekdays, weekly, and monthly rules, with optional quantitative targets and reminders.
- Complete or undo sessions, record in-progress values, and skip with an optional reason. A quantitative habit is complete only when its target is reached.
- Track unwanted patterns, urge intensity and triggers, resistance, retrospective occurrences, editable occurrence history, and recovery plans. Urges never reset abstinence tracking.
- Browse a monthly calendar, schedule-aware completion insights, personal goals and earned milestones, searchable/editable daily reflections, CSV tracking export, and full JSON export.
- Update profile/theme and reminder preferences. Reminder preferences do not schedule notifications.
- Responsive layout, keyboard focus states, reduced-motion support, and a light/dark theme.

## Backend status and setup

Supabase Auth and live database synchronization are not connected. The local demo uses neither credentials nor simulated sign-in. `supabase/migrations/001_initial_schema.sql` is a starting schema with owner-scoped RLS policies, relational constraints, and profile creation on signup. Review and apply it in a development Supabase project before connecting an application client.

No environment variables are needed to open the local demo. A future client integration would use the public Supabase project URL and anon/publishable key in frontend environment variables. Never put a service-role key in browser code. Production work still includes authenticated CRUD, password reset and account deletion flows, migration review, and RLS/integration tests. This version does not claim that authentication, email, cloud persistence, or notifications work.

## Tracking conventions and limitations

- Positive streaks count consecutive scheduled dates with a completed log. An unfinished habit today does not break the streak. Unscheduled dates are ignored; skipped dates do not count as completed.
- Abstinence is shown as completed local calendar days since the latest confirmed occurrence, or since tracking began. The occurrence date itself counts as day zero. Urges do not reset it. Longest abstinence is derived from the tracking start date and recorded occurrence dates.
- Dates use the browser's local timezone. The timezone profile field is descriptive in this offline version. No background scheduling is performed.
- Browser storage can be cleared by the user or browser. Export JSON to keep a copy. Account deletion and multi-user privacy require the configured backend.
- This workspace has no Node/npm runtime, so automated JavaScript unit, integration, and Supabase RLS tests could not be run here.
