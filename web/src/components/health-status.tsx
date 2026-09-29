'use client';

import { useEffect, useState } from 'react';

export function HealthStatus() {
  const [result, setResult] = useState('loading');

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setResult('Missing NEXT_PUBLIC_API_URL');
      return;
    }

    fetch(`${apiUrl}/api/v1/health`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.text();
        setResult(`${response.status} ${body}`);
      })
      .catch((error: unknown) => {
        setResult(error instanceof Error ? error.message : 'request failed');
      });
  }, []);

  return (
    <section>
      <h2>GET /api/v1/health</h2>
      <pre>{result}</pre>
    </section>
  );
}
