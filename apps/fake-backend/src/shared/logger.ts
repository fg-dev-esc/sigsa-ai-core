export function logStep(scope: string, message: string, payload?: unknown) {
  console.log(`[${scope}] ${message}`);

  if (payload !== undefined) {
    console.log(JSON.stringify(payload, null, 2));
  }
}

export function logError(scope: string, message: string, error: unknown, payload?: unknown) {
  console.error(`[${scope}] ${message}`);
  console.error(
    JSON.stringify(
      {
        ...(payload && typeof payload === 'object' ? payload : {}),
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
}
