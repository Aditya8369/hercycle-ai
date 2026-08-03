# 🌸 Contributing to HerCycle AI (ECSoC26 Guidelines)

Thank you for your interest in contributing to **HerCycle AI**! This guide outlines our open-source workflow, issue claiming rules, coding standards, and PR submission guidelines for **ECSoC26**.

---

## 📋 Rules & Guidelines for ECSoC26

### 1. ✌️ Active Assignment Limit (Max 5 Issues)
- Each contributor can have a maximum of **5 active assigned issues** without a submitted Pull Request.
- Once you submit Pull Requests for your assigned issues, your active limit unlocks automatically so you can claim new issues!

### 2. ⏰ 34-Hour Completion Deadline
- Once assigned to an issue, please complete and submit a Pull Request within **34 hours**.
- Issues with no PR activity after 34 hours will be automatically unassigned by our stale bot to keep issues available for all community members.

### 3. 💬 How to Claim an Issue
To work on an issue, comment on the issue with:
```
/claim
```
or
```
/assign
```
Our automated bot will verify your active limit and assign you to the issue immediately!

---

## 🛠️ Local Development Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/khushi897920-lang/hercycle-ai.git
cd hercycle-ai
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and add your local development keys:
```bash
cp .env.example .env.local
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run E2E Integration Tests & Build Verification
Before submitting a PR, make sure local build and test suites pass cleanly:
```bash
npm run build
npm run test:e2e
```

---

## 🗄️ Database Setup (Supabase)
If working on backend/database features, execute the master production migration script in your Supabase SQL Editor:
- [`supabase/MASTER_PRODUCTION_MIGRATION.sql`](file:///supabase/MASTER_PRODUCTION_MIGRATION.sql)

---

## 🚀 Submitting a Pull Request (PR)

1. Ensure your PR title starts with the `[ECSoC26]` prefix (e.g. `[ECSoC26] fix(ui): adjust mobile navbar spacing`).
2. Link the issue in your PR description using `Fixes #ISSUE_NUMBER`.
3. Our automated **PR Bot** will automatically:
   - Attach the **`ECSoC26`** label + category tags (`frontend`, `backend`, `documentation`).
   - Merge `main` into your branch to eliminate merge conflicts.
   - Run `npm run build` & `npm run test:e2e` CI verification.
   - Leave a status report comment when ready for merging.

Thank you for building a safer, more accessible, and empowered platform with us! **Happy Coding! 🌸✨**
