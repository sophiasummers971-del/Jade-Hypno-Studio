export function errorDetail(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'An unexpected local operation failed.';
}
export function ErrorNotice({
  message,
  detail,
  dismiss,
}: {
  message: string;
  detail: string;
  dismiss?: () => void;
}) {
  return (
    <div className="error" role="alert">
      <strong>{message}</strong>
      <p>
        Check the details below. If you were editing, keep this window open
        until your changes are saved or copied.
      </p>
      <details>
        <summary>Diagnostic details</summary>
        <pre>{detail}</pre>
      </details>
      {dismiss && <button onClick={dismiss}>Dismiss</button>}
    </div>
  );
}
