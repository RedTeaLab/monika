# E2E Tests

End-to-end tests for Monika frontend using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers (requires network connection):
```bash
npx playwright install
```

Or install only Chromium:
```bash
npx playwright install chromium
```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests in UI mode
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (show browser)
```bash
npm run test:e2e:headed
```

### Debug tests
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test e2e/auth.spec.ts
```

### Run specific test suite
```bash
npx playwright test --grep "Authentication"
```

## Test Structure

```
e2e/
├── auth.spec.ts           # Authentication (login/register) tests
├── game-console.spec.ts   # Game console message flow tests
├── dice.spec.ts           # Dice rolling functionality tests
├── events.spec.ts         # Event log and export tests
└── helpers/
    └── utils.ts            # Test utilities and helpers
```

## Test Coverage

- **Authentication**: Login flow, registration, logout
- **Game Console**: Message sending, responsive layout, state panel
- **Dice Rolling**: Roll commands, bonus/penalty dice, push/luck
- **Event Log**: Event filtering, export (JSON/CSV), panel controls

## Notes

- Tests require a running backend server on `http://localhost:8000`
- Tests use a test user account (create one before running)
- Tests automatically start the dev server in headless mode
- Screenshots are captured on test failures
- HTML report is generated in `playwright-report/` after test run

## Troubleshooting

**Browser download failed:**
- Check network connection
- Try running: `npx playwright install --force`

**Tests fail with timeout:**
- Ensure backend server is running
- Increase timeout in `playwright.config.ts`

**Tests fail with "Test user not found":**
- Create a test user account:
  - Username: `testuser`
  - Password: `TestPassword123!`
- Or update credentials in `e2e/helpers/utils.ts`
