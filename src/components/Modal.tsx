import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ children }: { children: ReactNode }) {
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    container.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={container}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const items = [
            ...(container.current?.querySelectorAll<HTMLElement>(
              'input:not(:disabled), button:not(:disabled)',
            ) ?? []),
          ];
          const first = items[0];
          const last = items.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </section>
    </div>
  );
}
