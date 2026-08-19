const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER || 'khushi897920-lang';
const REPO_NAME = process.env.REPO_NAME || 'hercycle-ai';

const ecsocFooter = `
---

# 🚀 ECSOC Contribution Guidelines

This issue is officially available for **ECSOC** contributors.

### Before starting:
- Comment on this issue requesting assignment.
- Wait until a maintainer assigns the issue.
- Do not start working before assignment.
- Work on only one issue at a time.
- Mention **Fixes #<issue_number>** in your Pull Request.
- Ensure all GitHub Actions checks pass.
- Ensure the project builds successfully.
- Follow the project's coding standards.
- Update documentation if necessary.

## 📌 ECSOC Pull Request Requirements

When submitting your Pull Request for this issue:

- Add \`Fixes #<issue_number>\` in the PR description.
- Add the **ECSoc26** label to your Pull Request.
- Ensure all GitHub Actions checks pass.
- Ensure the project builds successfully.

> ⚠️ **Important**
>
> Pull Requests without the **ECSoc26** label will **NOT** be processed by the ECSOC Sentinel system and will **not** be scored.

Failure to follow these guidelines may result in the Pull Request being closed.

Happy Coding! ❤️
`;

const issues = [
  // ─── 1. Backend & API Optimization ───
  {
    title: '[OPT] Implement pagination and cursor-based fetching for /api/cycles and /api/log-day',
    labels: ['ECSoC26', 'optimization', 'backend', 'api', 'intermediate'],
    body: `## 📌 Description
Currently, \`/api/cycles\` and \`/api/log-day\` retrieve all historical records without pagination limits. As active users accumulate months or years of cycle and daily symptom logs, this leads to large JSON payloads, high database memory consumption, and slower response times.

## 🎯 Expected Outcome / Requirements
- Add optional \`limit\` and \`cursor\` (or \`offset\` / \`page\`) query parameters to \`GET /api/cycles\` and \`GET /api/log-day\`.
- Default to fetching the latest 50 records if no limit is specified.
- Return pagination metadata (\`hasMore\`, \`nextCursor\`, \`totalCount\`) alongside the data array.
- Maintain backwards compatibility for existing frontend and offline sync callers.

## 🔍 Context & Relevant Files
- \`app/api/cycles/route.js\`
- \`app/api/log-day/route.js\`
- \`lib/api-helpers.js\`

## 💻 Scope
* Backend API & Database query optimization` + ecsocFooter
  },
  {
    title: '[API] Add request body schema validation using Zod across core API routes',
    labels: ['ECSoC26', 'api', 'backend', 'security', 'intermediate'],
    body: `## 📌 Description
Several API route handlers (such as \`/api/profile\`, \`/api/cycles\`, and \`/api/feedback\`) perform manual ad-hoc type checks and conditional field parsing on incoming JSON payloads. This can leave edge cases where invalid types, unexpected structures, or missing required fields cause 500 runtime errors instead of clean 400 Bad Request responses.

## 🎯 Expected Outcome / Requirements
- Implement Zod schema validation for POST/PUT request bodies in \`/api/profile\`, \`/api/cycles\`, and \`/api/feedback\`.
- Return standardized validation error responses (e.g. status 400 with descriptive issue paths and messages).
- Prevent unexpected payload shapes from reaching database queries.

## 🔍 Context & Relevant Files
- \`app/api/profile/route.js\`
- \`app/api/cycles/route.js\`
- \`app/api/feedback/route.js\`
- \`lib/date-schemas.js\`

## 💻 Scope
* Backend API validation & error resilience` + ecsocFooter
  },
  {
    title: '[PERF] Introduce server-side Cache-Control headers and SWR caching for /api/pcod-risk calculation',
    labels: ['ECSoC26', 'performance', 'optimization', 'backend', 'intermediate'],
    body: `## 📌 Description
The PCOD risk evaluation endpoint (\`/api/pcod-risk\`) evaluates multi-factor cycle metrics and symptom history on every request. Since cycle data changes infrequently (typically once a day or during active logging), repeated queries within a short window result in redundant compute cycles.

## 🎯 Expected Outcome / Requirements
- Implement short-lived caching or conditional ETag / \`Cache-Control: private, max-age=120, stale-while-revalidate=300\` for \`GET /api/pcod-risk\`.
- Invalidate or bypass cache immediately when new daily logs or cycle updates are submitted.
- Reduce latency on dashboard load and repeated navigation.

## 🔍 Context & Relevant Files
- \`app/api/pcod-risk/route.js\`
- \`lib/pcod-risk-result.js\`
- \`lib/cache.js\`

## 💻 Scope
* Performance optimization & caching strategy` + ecsocFooter
  },
  {
    title: '[BACKEND] Gracefully handle database connection timeouts and pooling errors in getSupabaseAdmin',
    labels: ['ECSoC26', 'backend', 'reliability', 'database', 'intermediate'],
    body: `## 📌 Description
When database traffic surges or Supabase experiences transient latency, \`getSupabaseAdmin()\` calls can throw unhandled connection timeout exceptions that cascade into generic 500 errors across API endpoints without retry or helpful diagnostic logging.

## 🎯 Expected Outcome / Requirements
- Wrap Supabase client initialization and execution calls with robust timeout handling and retry logic for transient network failures.
- Provide clear structured error logs using \`lib/logger.js\` indicating timeout vs authentication vs schema failures.
- Return user-friendly error responses rather than leaking raw error stacks.

## 🔍 Context & Relevant Files
- \`lib/supabase-admin.js\`
- \`lib/logger.js\`
- \`lib/db.js\`

## 💻 Scope
* Backend reliability & error handling` + ecsocFooter
  },
  {
    title: '[API] Standardize JSON error and success envelope across all API routes',
    labels: ['ECSoC26', 'api', 'backend', 'code quality', 'beginner'],
    body: `## 📌 Description
Currently, different API endpoints return disparate response shapes (some return \`{ success: true, data: ... }\`, others return \`{ profile: ... }\`, and errors range from \`{ error: 'message' }\` to \`{ message: 'error', code: ... }\`). This makes client-side handling and API typing inconsistent.

## 🎯 Expected Outcome / Requirements
- Standardize all API route responses to follow a consistent envelope structure:
  - Success: \`{ success: true, data: T, message?: string }\`
  - Error: \`{ success: false, error: string, code?: string, details?: any }\`
- Update utility helper in \`lib/api-helpers.js\` to provide uniform helper functions (\`jsonSuccess(data)\`, \`jsonError(message, status, code)\`).

## 🔍 Context & Relevant Files
- \`lib/api-helpers.js\`
- \`app/api/profile/route.js\`
- \`app/api/cycles/route.js\`
- \`app/api/feedback/route.js\`
- \`app/api/export-data/route.js\`

## 💻 Scope
* Backend consistency & clean code standards` + ecsocFooter
  },
  {
    title: '[SEC] Sanitize and validate custom symptom and custom tag inputs in /api/log-day',
    labels: ['ECSoC26', 'security', 'backend', 'api', 'beginner'],
    body: `## 📌 Description
Users can input custom symptoms and text entries when logging their day. While the frontend sets \`maxLength\`, the backend API in \`/api/log-day\` should strictly sanitize strings, trim whitespace, limit custom symptom array length, and strip HTML/script tags before storing in the database to prevent stored XSS or injection vulnerabilities.

## 🎯 Expected Outcome / Requirements
- Add server-side sanitization on \`symptoms\`, \`notes\`, and custom string fields in \`app/api/log-day/route.js\`.
- Enforce length constraints (e.g. max 50 chars per custom symptom, max 20 custom items per log).
- Ensure sanitized strings are returned safely in JSON responses.

## 🔍 Context & Relevant Files
- \`app/api/log-day/route.js\`
- \`components/dashboard/DailyLogPanel.jsx\`
- \`lib/api-helpers.js\`

## 💻 Scope
* Security hardening & input sanitation` + ecsocFooter
  },
  {
    title: '[BACKEND] Implement sliding-window rate limiting on AI Chat endpoints (/api/chat & /api/partner-coach)',
    labels: ['ECSoC26', 'backend', 'security', 'optimization', 'intermediate'],
    body: `## 📌 Description
AI inference endpoints such as \`/api/chat\` and \`/api/partner-coach\` consume external LLM tokens and compute resources. Without robust per-user sliding window rate limiting, malicious or runaway clients could exhaust quota limits.

## 🎯 Expected Outcome / Requirements
- Integrate \`enforce_rate_limit\` or memory/redis-backed sliding window rate limiting on \`/api/chat\` and \`/api/partner-coach\`.
- Set sensible limits per user (e.g. 20 messages per 5-minute window for standard accounts).
- Return HTTP 429 Too Many Requests with \`Retry-After\` header and localized friendly message when limit is exceeded.

## 🔍 Context & Relevant Files
- \`app/api/chat/route.js\`
- \`app/api/partner-coach/route.js\`
- \`lib/rate-limiter.js\`
- \`lib/rateLimiter.js\`

## 💻 Scope
* Security & resource optimization` + ecsocFooter
  },
  {
    title: '[API] Implement atomic batch deletion endpoint for GDPR user data purge in /api/delete-account',
    labels: ['ECSoC26', 'backend', 'database', 'security', 'intermediate'],
    body: `## 📌 Description
When a user exercises their right to data deletion / account deletion via \`/api/delete-account\`, records across multiple tables (\`cycles\`, \`daily_logs\`, \`user_profiles\`, \`weight_entries\`, \`partner_links\`, etc.) must be deleted completely and atomically. If one query fails partway, orphaned records could remain.

## 🎯 Expected Outcome / Requirements
- Ensure all user-associated tables are wiped in a single database transaction or cascading stored procedure.
- Clean up any associated session storage, offline sync records, and encryption keys.
- Verify comprehensive purge logging for compliance audit records without retaining PII.

## 🔍 Context & Relevant Files
- \`app/api/delete-account/route.js\`
- \`lib/supabase-admin.js\`
- \`supabase_migration.sql\`

## 💻 Scope
* GDPR compliance & database atomicity` + ecsocFooter
  },

  // ─── 2. Database & Data Integrity ───
  {
    title: '[DB] Add composite indexes on (user_id, date) and (user_id, start_date) in Supabase schema',
    labels: ['ECSoC26', 'database', 'optimization', 'backend', 'beginner'],
    body: `## 📌 Description
Queries for dashboard metrics, cycle history, and daily logs consistently filter by \`user_id\` and sort by date (\`start_date\` descending or \`date\` descending). Adding composite B-tree indexes will improve query execution times as database record volume scales.

## 🎯 Expected Outcome / Requirements
- Add composite index migration in SQL:
  - \`CREATE INDEX IF NOT EXISTS idx_cycles_user_start_date ON cycles(user_id, start_date DESC);\`
  - \`CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);\`
  - \`CREATE INDEX IF NOT EXISTS idx_weight_user_recorded ON weight_entries(user_id, recorded_date DESC);\`
- Update \`supabase_migration.sql\` with the recommended index statements.

## 🔍 Context & Relevant Files
- \`supabase_migration.sql\`
- \`lib/supabase-admin.js\`

## 💻 Scope
* Database performance & indexing` + ecsocFooter
  },
  {
    title: '[DB] Enforce database constraint checks for cycle start_date <= end_date and cycle length bounds',
    labels: ['ECSoC26', 'database', 'reliability', 'beginner'],
    body: `## 📌 Description
Currently, cycle records can theoretically store inconsistent date sequences (such as an \`end_date\` preceding \`start_date\` or extreme \`cycle_length\` anomalies like negative numbers) if bad input is submitted.

## 🎯 Expected Outcome / Requirements
- Add SQL check constraints on the \`cycles\` table:
  - \`CHECK (end_date IS NULL OR end_date >= start_date)\`
  - \`CHECK (cycle_length IS NULL OR (cycle_length >= 10 AND cycle_length <= 120))\`
- Ensure API returns a clean validation error when constraint checks are triggered.

## 🔍 Context & Relevant Files
- \`supabase_migration.sql\`
- \`app/api/cycles/route.js\`
- \`lib/date-utils.js\`

## 💻 Scope
* Database schema & data integrity` + ecsocFooter
  },
  {
    title: '[DB] Implement automated retention cleanup for read notifications older than 24 hours',
    labels: ['ECSoC26', 'database', 'optimization', 'backend', 'beginner'],
    body: `## 📌 Description
The notification system is designed to auto-delete read notifications after 24 hours. While client-side filtering currently hides them, old notifications accumulate in database storage without an automated periodic purge.

## 🎯 Expected Outcome / Requirements
- Create a PostgreSQL function / cron job or scheduled API task to delete notifications where \`read = true\` and \`created_at < NOW() - INTERVAL '24 hours'\`.
- Keep database tables compact and prevent unbounded growth over time.

## 🔍 Context & Relevant Files
- \`components/layout/NotificationSettings.jsx\`
- \`supabase_migration.sql\`
- \`lib/actions/partner.js\`

## 💻 Scope
* Database maintenance & storage optimization` + ecsocFooter
  },
  {
    title: '[DB] Enforce foreign key CASCADE rules between user records and dependent health tables',
    labels: ['ECSoC26', 'database', 'backend', 'beginner'],
    body: `## 📌 Description
In the Supabase migration script, dependent tables such as \`user_profiles\`, \`cycles\`, \`daily_logs\`, and \`weight_entries\` reference \`user_id\` (Clerk ID). Adding explicit foreign key references and CASCADE policies will ensure referential integrity.

## 🎯 Expected Outcome / Requirements
- Audit foreign key constraints across all migration SQL files.
- Document and enforce cascade rules to ensure no dangling records remain if parent records are modified or removed.

## 🔍 Context & Relevant Files
- \`supabase_migration.sql\`
- \`docs/database/HealthReport.md\`

## 💻 Scope
* Database architecture & referential integrity` + ecsocFooter
  },

  // ─── 3. Frontend UI/UX & Section Cards ───
  {
    title: '[UI/UX] Standardize SectionCard header padding, typography, and responsive container bounds',
    labels: ['ECSoC26', 'ui', 'ux', 'frontend', 'beginner'],
    body: `## 📌 Description
Multiple sections across Dashboard, Insights, and Self-Care pages use slightly varying inline styles and padding for section cards (e.g. some use \`p-4 sm:p-6\`, others use \`padding: 1.5rem\`, and font sizes vary between \`1.05rem\` and \`1.4rem\`).

## 🎯 Expected Outcome / Requirements
- Create a reusable, standardized \`SectionCard\` / \`DashboardCard\` component with consistent border radius (\`rounded-2xl\` / \`16px\`), glassmorphism styles, header action slots, and uniform responsive padding.
- Replace ad-hoc section containers in \`app/[locale]/insights/page.js\` and \`app/[locale]/page.js\` with this unified component.

## 🔍 Context & Relevant Files
- \`app/[locale]/insights/page.js\`
- \`app/[locale]/page.js\`
- \`components/ui/\`

## 💻 Scope
* Frontend component modularity & design consistency` + ecsocFooter
  },
  {
    title: '[FEAT] Add empty-state illustrations and actionable CTAs to CyclePhaseCard and PartnerLoveBanner',
    labels: ['ECSoC26', 'enhancement', 'frontend', 'ui', 'ux', 'beginner'],
    body: `## 📌 Description
When a new user logs in for the first time with zero logged cycle data, \`CyclePhaseCard\` and \`PartnerLoveBanner\` display bare placeholder text or default fallback values. Adding friendly empty-state illustrations with direct "Log Your First Period" or "Invite Partner" CTA buttons significantly improves first-time user onboarding.

## 🎯 Expected Outcome / Requirements
- Design and render engaging empty states with icons and descriptive helper text when no cycle data exists.
- Add direct action button triggers to open the Log Day drawer or Partner modal.
- Ensure all text is localized using \`next-intl\`.

## 🔍 Context & Relevant Files
- \`components/dashboard/CyclePhaseCard.jsx\`
- \`components/dashboard/PartnerLoveBanner.jsx\`
- \`messages/en.json\`
- \`messages/hi.json\`

## 💻 Scope
* Frontend user experience & empty-state handling` + ecsocFooter
  },
  {
    title: '[A11Y] Add keyboard accessibility (Tab + Enter/Space) and ARIA attributes to Mood & Flow selectors',
    labels: ['ECSoC26', 'accessibility', 'frontend', 'ui', 'beginner'],
    body: `## 📌 Description
In \`DailyLogPanel.jsx\`, mood selection buttons and flow level dots use custom styled buttons that lack explicit \`aria-pressed\` or \`role="radiogroup"\` states. Screen reader users and keyboard-only navigators cannot easily determine the currently selected state.

## 🎯 Expected Outcome / Requirements
- Add \`role="radiogroup"\` with \`aria-label\` to mood and flow containers.
- Add \`aria-checked={selected}\` or \`aria-pressed={selected}\` to individual mood and flow buttons.
- Ensure full keyboard focus ring visibility on \`:focus-visible\`.

## 🔍 Context & Relevant Files
- \`components/dashboard/DailyLogPanel.jsx\`
- \`components/dashboard/DayLogDrawer.jsx\`
- \`app/globals.css\`

## 💻 Scope
* Accessibility (a11y) & WCAG 2.1 compliance` + ecsocFooter
  },
  {
    title: '[UI/UX] Implement skeleton loading state for CycleCalendar and PCOS Assessment cards',
    labels: ['ECSoC26', 'ui', 'ux', 'frontend', 'beginner'],
    body: `## 📌 Description
During initial data fetch on the dashboard, the page can experience layout shift (CLS) as \`CycleCalendar\` and \`PCODRiskCard\` switch from null/loading to fully populated states.

## 🎯 Expected Outcome / Requirements
- Implement animated pulse skeleton placeholders matching the exact card dimensions and aspect ratios for \`CycleCalendar\` and \`PcosQuizCard\`.
- Smoothly transition from skeleton to rendered component without layout shifting.

## 🔍 Context & Relevant Files
- \`components/dashboard/CycleCalendar.jsx\`
- \`components/dashboard/PCODRiskCard.jsx\`
- \`app/[locale]/page.js\`

## 💻 Scope
* UI/UX polish & Cumulative Layout Shift (CLS) reduction` + ecsocFooter
  },
  {
    title: '[FEAT] Add confirmation dialog modal before clearing all notifications in NotificationSettings',
    labels: ['ECSoC26', 'enhancement', 'frontend', 'ui', 'beginner'],
    body: `## 📌 Description
In \`NotificationSettings.jsx\`, clicking the "Clear All" button immediately purges all notifications without confirmation. If clicked accidentally on a mobile touchscreen, unread alerts and partner love notes are irrevocably lost.

## 🎯 Expected Outcome / Requirements
- Show an accessible confirmation dialog (e.g. using ConfirmationModal or Radix AlertDialog) before executing \`handleClearAllNotifications\`.
- Allow the user to confirm or cancel the action.
- Provide undo toast feedback where applicable.

## 🔍 Context & Relevant Files
- \`components/layout/NotificationSettings.jsx\`
- \`lib/ConfirmationModal.test.mjs\`

## 💻 Scope
* Frontend UX safety & interaction design` + ecsocFooter
  },
  {
    title: '[UI/UX] Enhance contrast ratios for TEXT_FAINT and placeholder text across dark theme cards',
    labels: ['ECSoC26', 'accessibility', 'ui', 'frontend', 'beginner'],
    body: `## 📌 Description
Subtle secondary text (\`TEXT_FAINT = 'rgba(255,255,255,0.65)'\`) and input placeholders (\`placeholder:text-white/40\`) on dark translucent card backgrounds fail WCAG AA 4.5:1 contrast requirements in certain lighting conditions.

## 🎯 Expected Outcome / Requirements
- Audit contrast ratios across text variables in \`app/globals.css\` and inline styles in page templates.
- Update secondary and faint text colors to minimum 4.5:1 ratio against background cards.
- Ensure readability in both dark mode and high-contrast environments.

## 🔍 Context & Relevant Files
- \`app/globals.css\`
- \`app/[locale]/insights/page.js\`
- \`app/[locale]/track/page.js\`

## 💻 Scope
* Visual accessibility & WCAG AA compliance` + ecsocFooter
  },
  {
    title: '[FEAT] Add copy-to-clipboard feedback toast and error boundary for HealthReport generation',
    labels: ['ECSoC26', 'enhancement', 'frontend', 'reliability', 'beginner'],
    body: `## 📌 Description
When users generate health reports or export data, unexpected PDF parsing errors or clipboard API permission denials can occur silently without user feedback.

## 🎯 Expected Outcome / Requirements
- Wrap Health Report export actions in a React error boundary and try/catch block with descriptive error toasts.
- Add clear visual "Copied to clipboard!" state and fallback text area for unsupported browsers.

## 🔍 Context & Relevant Files
- \`lib/generateReport.js\`
- \`lib/pdf-layout.js\`
- \`app/[locale]/insights/page.js\`

## 💻 Scope
* Frontend error handling & user feedback` + ecsocFooter
  },
  {
    title: '[UI/UX] Improve mobile touch targets to minimum 44x44px for calendar navigation and icon buttons',
    labels: ['ECSoC26', 'ui', 'mobile', 'frontend', 'beginner'],
    body: `## 📌 Description
Certain interactive icon buttons (such as calendar previous/next month chevrons, close buttons on modal headers, and symptom delete icons) have small tap targets (< 32px), leading to accidental missed taps on mobile devices.

## 🎯 Expected Outcome / Requirements
- Ensure all interactive buttons, chevron arrows, and touch targets meet Apple HIG / Google Material standard minimum 44x44px clickable area (using padding or pseudo-elements without changing visual size).
- Test on mobile viewports.

## 🔍 Context & Relevant Files
- \`components/dashboard/CycleCalendar.jsx\`
- \`components/layout/Navbar.jsx\`
- \`components/self-care/SelfCareChecklist.jsx\`

## 💻 Scope
* Mobile usability & touch ergonomics` + ecsocFooter
  },

  // ─── 4. Code Quality, Refactoring & Types ───
  {
    title: '[REFACTOR] Extract duplicate inline design tokens into centralized theme constants',
    labels: ['ECSoC26', 'code quality', 'frontend', 'beginner'],
    body: `## 📌 Description
Several page files (e.g. \`app/[locale]/insights/page.js\`, \`app/[locale]/track/page.js\`, and \`components/dashboard/StatCard.jsx\`) repeat identical inline token constants:
\`\`\`js
const PINK = '#e8527e'
const MAUVE = '#9d3f7a'
const ACCENT = '#e91e8c'
const CARD_BG = 'rgba(255,255,255,0.08)'
\`\`\`
This creates maintenance overhead when updating brand colors or themes.

## 🎯 Expected Outcome / Requirements
- Consolidate common color and card tokens into \`lib/constants/theme.js\` or CSS custom properties in \`globals.css\`.
- Import the centralized theme tokens across pages and components.

## 🔍 Context & Relevant Files
- \`app/[locale]/insights/page.js\`
- \`app/[locale]/track/page.js\`
- \`lib/ThemeContext.jsx\`
- \`app/globals.css\`

## 💻 Scope
* Clean code & DRY architecture` + ecsocFooter
  },
  {
    title: '[CODE QUALITY] Replace direct navigator.clipboard calls with resilient clipboard utility',
    labels: ['ECSoC26', 'code quality', 'reliability', 'frontend', 'beginner'],
    body: `## 📌 Description
Calls to \`navigator.clipboard.writeText()\` are copy-pasted with separate \`document.execCommand('copy')\` fallback implementations in multiple files (e.g. \`insights/page.js\`, \`PartnerLoveBanner.jsx\`, \`CommunityShareModal.jsx\`). In non-secure contexts (HTTP / local testing / certain webviews), \`navigator.clipboard\` throws errors.

## 🎯 Expected Outcome / Requirements
- Create a shared \`copyToClipboard(text: string): Promise<boolean>\` utility in \`lib/utils.js\`.
- Automatically handle clipboard API permission checks, fallback text area selection, and return boolean success status.
- Replace repetitive inline copy logic across components.

## 🔍 Context & Relevant Files
- \`lib/utils.js\`
- \`app/[locale]/insights/page.js\`
- \`components/dashboard/PartnerLoveBanner.jsx\`

## 💻 Scope
* Code reusability & cross-browser compatibility` + ecsocFooter
  },
  {
    title: '[REFACTOR] Deduplicate cycle phase calculation logic across page.js and calculateCyclePhase.js',
    labels: ['ECSoC26', 'code quality', 'backend', 'frontend', 'beginner'],
    body: `## 📌 Description
Cycle phase calculations (Menstrual, Follicular, Ovulation, Luteal) and day counting are performed in \`app/[locale]/page.js\` lines 380-410 as well as inside \`lib/calculateCyclePhase.js\`. Having two separate calculation routines introduces potential phase drift bugs.

## 🎯 Expected Outcome / Requirements
- Centralize all cycle day calculation and phase determination in \`lib/calculateCyclePhase.js\`.
- Refactor \`app/[locale]/page.js\` to consume the centralized function directly.
- Add unit tests verifying edge cases (e.g. cycleDay > 28, day 1 transition, leap years).

## 🔍 Context & Relevant Files
- \`lib/calculateCyclePhase.js\`
- \`app/[locale]/page.js\`
- \`lib/cycle-helpers.js\`

## 💻 Scope
* Refactoring & single source of truth` + ecsocFooter
  },
  {
    title: '[CODE QUALITY] Add JSDoc type definitions and prop validation for key dashboard components',
    labels: ['ECSoC26', 'code quality', 'frontend', 'beginner'],
    body: `## 📌 Description
Key interactive components such as \`DailyLogPanel\`, \`CycleCalendar\`, and \`PCODRiskCard\` receive numerous props without JSDoc comments or TypeScript interfaces, making it difficult for new open-source contributors to understand expected object shapes.

## 🎯 Expected Outcome / Requirements
- Add comprehensive JSDoc type annotations (\`@param\`, \`@returns\`, \`@typedef\`) for component props and data structures.
- Document cycle object shapes (\`start_date\`, \`end_date\`, \`cycle_length\`, \`symptoms\`).

## 🔍 Context & Relevant Files
- \`components/dashboard/DailyLogPanel.jsx\`
- \`components/dashboard/CycleCalendar.jsx\`
- \`components/dashboard/PCODRiskCard.jsx\`

## 💻 Scope
* Developer ergonomics & documentation` + ecsocFooter
  },
  {
    title: '[I18N] Audit and add missing Hindi (hi.json) translation keys for SelfCare and WeightTracker',
    labels: ['ECSoC26', 'frontend', 'beginner', 'good first issue'],
    body: `## 📌 Description
New feature components such as \`SelfCareChecklist.jsx\` and \`WeightTracker.jsx\` contain some hardcoded English labels or missing keys in \`messages/hi.json\`, causing fallback or untranslated UI for Hindi-speaking users.

## 🎯 Expected Outcome / Requirements
- Audit all translation keys in \`messages/en.json\` and ensure 100% key parity in \`messages/hi.json\`.
- Replace any hardcoded strings in \`SelfCareChecklist.jsx\` and \`WeightTracker.jsx\` with \`useTranslations\`.

## 🔍 Context & Relevant Files
- \`messages/en.json\`
- \`messages/hi.json\`
- \`components/self-care/SelfCareChecklist.jsx\`
- \`components/dashboard/WeightTracker.jsx\`

## 💻 Scope
* Internationalization (i18n) & localization` + ecsocFooter
  },
  {
    title: '[CODE QUALITY] Eliminate redundant useEffect re-renders in OfflineContext sync-queue listeners',
    labels: ['ECSoC26', 'code quality', 'performance', 'frontend', 'intermediate'],
    body: `## 📌 Description
In \`lib/OfflineContext.jsx\`, multiple \`useEffect\` hooks bind to network online/offline events and IndexedDB sync queues. Without memoized handlers and strict dependency arrays, state updates cause cascade re-renders across the entire component tree.

## 🎯 Expected Outcome / Requirements
- Refactor \`OfflineContext.jsx\` to use \`useCallback\` and \`useMemo\` for exposed client methods.
- Prevent unneeded subscriber notifications when sync queue status is unchanged.
- Ensure event listeners are cleanly unsubscribed on component unmount.

## 🔍 Context & Relevant Files
- \`lib/OfflineContext.jsx\`
- \`lib/sync-queue.js\`

## 💻 Scope
* State management & React performance optimization` + ecsocFooter
  },

  // ─── 5. Performance, Offline & Security ───
  {
    title: '[PERF] Dynamic import heavy Recharts and PDF rendering modules to reduce initial page bundle size',
    labels: ['ECSoC26', 'performance', 'frontend', 'optimization', 'intermediate'],
    body: `## 📌 Description
Recharts (\`LineChart\`, \`BarChart\`) and PDF generator dependencies (\`jspdf\`, \`html2canvas\`) are statically imported at the top of \`app/[locale]/insights/page.js\`, inflating the initial JavaScript bundle sent to mobile devices.

## 🎯 Expected Outcome / Requirements
- Use Next.js \`dynamic(() => import(...), { ssr: false, loading: () => <Skeleton /> })\` for chart and PDF components.
- Reduce First Contentful Paint (FCP) and Time to Interactive (TTI) on mobile connections.

## 🔍 Context & Relevant Files
- \`app/[locale]/insights/page.js\`
- \`components/dashboard/WeightTrendChart.jsx\`
- \`lib/generateReport.js\`

## 💻 Scope
* Bundle size optimization & code splitting` + ecsocFooter
  },
  {
    title: '[OFFLINE] Implement exponential backoff and retry limits for failed sync-queue items in OfflineContext',
    labels: ['ECSoC26', 'reliability', 'offline', 'frontend', 'intermediate'],
    body: `## 📌 Description
When an offline mutation (e.g. saving daily logs or updating cycle dates) fails due to server error or network instability upon reconnecting, the sync queue may attempt infinite immediate retries, causing network thrashing.

## 🎯 Expected Outcome / Requirements
- Implement exponential backoff with jitter (e.g. 1s, 2s, 4s, 8s up to max 30s) and a max retry limit (e.g. 5 attempts).
- If retry limit is reached, mark item as failed and display a notification to the user with a manual "Retry" action.

## 🔍 Context & Relevant Files
- \`lib/OfflineContext.jsx\`
- \`lib/sync-queue.js\`
- \`lib/sync-failure-view.js\`

## 💻 Scope
* Offline resilience & network optimization` + ecsocFooter
  },
  {
    title: '[PERF] Convert and serve static PNG/JPEG assets in modern WebP/AVIF formats with next/image',
    labels: ['ECSoC26', 'performance', 'frontend', 'optimization', 'beginner'],
    body: `## 📌 Description
Static illustration images in \`public/assets\` and exercises section use uncompressed PNG/JPEG files rendered with standard \`<img>\` tags instead of Next.js optimized \`<Image />\` component, causing extra payload overhead on mobile networks.

## 🎯 Expected Outcome / Requirements
- Audit images in \`public/\` and convert suitable assets to WebP/AVIF.
- Replace raw \`<img>\` tags with Next.js \`next/image\` using appropriate \`width\`, \`height\`, and \`priority\` attributes.

## 🔍 Context & Relevant Files
- \`components/dashboard/FeaturesSection.jsx\`
- \`components/self-care/SelfCareChecklist.jsx\`
- \`public/\`

## 💻 Scope
* Frontend asset optimization & load performance` + ecsocFooter
  },
  {
    title: '[TEST] Add automated integration unit tests for /api/profile and /api/cycles route handlers',
    labels: ['ECSoC26', 'testing', 'backend', 'api', 'intermediate'],
    body: `## 📌 Description
While unit tests exist for helpers and schemas, automated test coverage for the API route handlers in \`app/api/profile/route.js\` and \`app/api/cycles/route.js\` is needed to ensure regression prevention during refactoring.

## 🎯 Expected Outcome / Requirements
- Create test files (e.g. \`test-api-profile.test.js\` and \`test-api-cycles.test.js\`) using Node test runner or Vitest/Jest.
- Test unauthorized access (401), invalid payload validation (400), database mock error handling (500), and successful response shapes (200).

## 🔍 Context & Relevant Files
- \`app/api/profile/route.js\`
- \`app/api/cycles/route.js\`
- \`lib/supabase-mock.js\`
- \`scripts/\`

## 💻 Scope
* Automated testing & CI/CD quality gates` + ecsocFooter
  },
  {
    title: '[SECURITY] Enforce strict Content Security Policy (CSP) headers and Permissions-Policy in middleware',
    labels: ['ECSoC26', 'security', 'backend', 'intermediate'],
    body: `## 📌 Description
To protect health-tracking data against clickjacking, script injection, and unauthorized iframe embedding, strict HTTP security headers should be enforced across all responses.

## 🎯 Expected Outcome / Requirements
- Implement or update CSP headers, \`X-Frame-Options: DENY\`, \`X-Content-Type-Options: nosniff\`, \`Referrer-Policy: strict-origin-when-cross-origin\`, and \`Permissions-Policy\` in \`middleware.js\` / \`next.config.mjs\`.
- Allow required external sources (Clerk authentication, Google Fonts, Supabase).
- Verify with automated security headers test.

## 🔍 Context & Relevant Files
- \`lib/security-headers.mjs\`
- \`middleware.js\`
- \`next.config.mjs\`

## 💻 Scope
* Web security hardening & compliance` + ecsocFooter
  }
];

function postIssue(issue) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      title: issue.title,
      body: issue.body,
      labels: issue.labels
    });

    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/issues',
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Issue-Creator',
        'Authorization': 'token ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error('GitHub API error (' + res.statusCode + '): ' + (parsed.message || data)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('Starting creation of ' + issues.length + ' issues on GitHub (' + REPO_OWNER + '/' + REPO_NAME + ')...');
  const created = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    console.log('[' + (i + 1) + '/' + issues.length + '] Creating: ' + issue.title + '...');
    try {
      const result = await postIssue(issue);
      console.log('  --> Created successfully: #' + result.number + ' (' + result.html_url + ')');
      created.push({ number: result.number, title: issue.title, url: result.html_url });
    } catch (err) {
      console.error('  --> Error creating issue: ' + err.message);
    }
    // Rate spacing between requests to be gentle on GitHub API
    await sleep(700);
  }

  console.log('\nCompleted! Successfully created ' + created.length + '/' + issues.length + ' issues.');
}

run();

