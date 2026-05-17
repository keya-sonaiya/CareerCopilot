export const GENERATOR_STATE_KEY = "jobcopilot.generator.state.v1";

export function apiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.port === "3000") {
    return "http://127.0.0.1:8000";
  }

  return "";
}

export function formatScore(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.0";
  }

  return value.toFixed(1);
}

export function asString(value: unknown, fallback = "Not found") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function getNestedValue(
  source: Record<string, unknown> | null | undefined,
  path: string[],
) {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
