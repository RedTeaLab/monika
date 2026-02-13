/**
 * Test Setup File
 *
 * Configures the testing environment for vitest.
 * This file is imported before each test file.
 */

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Extend Vitest's expect with jest-dom matchers
// Note: Since we're using vitest with jsdom, most jest-dom features should work
// If you encounter issues, you may need to add additional configuration
