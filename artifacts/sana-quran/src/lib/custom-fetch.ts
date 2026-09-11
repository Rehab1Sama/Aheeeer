import { getToken } from "./auth";

// Override the default custom fetch to include auth headers
// This patches the generated api-client-react's customFetch
const originalFetch = window.fetch;

export function setupAuthFetch() {
  // Already handled in api-client-react custom-fetch via token access
}
