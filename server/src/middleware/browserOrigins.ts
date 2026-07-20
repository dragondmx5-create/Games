/** Parse the comma-separated browser origins accepted by the API. */
export function parseBrowserOrigins(value: string): string[] {
  return [...new Set(
    value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )];
}

export function originIsAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.includes(origin.replace(/\/$/, ''));
}
