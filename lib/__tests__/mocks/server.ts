/**
 * MSW Server Setup
 * For use in Node.js environments (tests)
 */

import { setupServer } from "msw/node"
import { handlers } from "./handlers"

// Create the MSW server with default handlers
export const server = setupServer(...handlers)

// Export for use in test setup
export { handlers }

