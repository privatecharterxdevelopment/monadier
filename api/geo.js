/** Vercel serverless — timezone from visitor IP (x-vercel-ip-* headers). */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const timezone = req.headers['x-vercel-ip-timezone'] || 'UTC';
  const country = req.headers['x-vercel-ip-country'] || '';
  const city = req.headers['x-vercel-ip-city'] || '';

  res.status(200).json({
    timezone: typeof timezone === 'string' ? timezone : 'UTC',
    country: typeof country === 'string' ? country : '',
    city: typeof city === 'string' ? city : '',
    source: req.headers['x-vercel-ip-timezone'] ? 'ip' : 'fallback',
  });
}
