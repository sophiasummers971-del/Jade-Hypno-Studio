import { useEffect, useState } from 'react';

export function GroundingMode({ onReturn }: { onReturn: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="grounding-screen">
      <h1>Calm / Grounding Mode</h1>
      <p className="lead">Ordinary, non-immersive application screen.</p>
      <section>
        <h2>Session stopped</h2>
        <p>
          Current date and time:{' '}
          <time dateTime={now.toISOString()}>{now.toLocaleString()}</time>
        </p>
        <p>Notice the ordinary surroundings around the screen.</p>
        <p>
          Breathe at your normal comfortable pace. Do not hold or restrict your
          breath.
        </p>
        <p>Drink water if you want it.</p>
        <p>
          This screen is neutral application guidance, not medical treatment.
        </p>
        <button type="button" className="primary" onClick={onReturn}>
          Return to normal application
        </button>
      </section>
    </div>
  );
}
