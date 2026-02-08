// Vercel Serverless Function: proxies Yahoo Finance SPX options data
// Uses cookie + crumb authentication (required since 2024)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function getAuth() {
  // Step 1: Get cookies from Yahoo Finance
  const initRes = await fetch('https://finance.yahoo.com/quote/%5ESPX/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
  });

  // Parse set-cookie headers (getSetCookie may not exist in all runtimes)
  let cookieStr = '';
  const raw = initRes.headers.raw?.()?.['set-cookie'];
  if (raw) {
    cookieStr = raw.map(c => c.split(';')[0]).join('; ');
  } else if (typeof initRes.headers.getSetCookie === 'function') {
    cookieStr = initRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  } else {
    // Fallback: try get('set-cookie') which concatenates
    const sc = initRes.headers.get('set-cookie') || '';
    cookieStr = sc;
  }

  // Consume body
  await initRes.text();

  // Step 2: Get crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookieStr },
  });
  const crumb = await crumbRes.text();

  if (!crumb || crumb.includes('<') || crumb.length > 50) {
    throw new Error('Failed to obtain crumb from Yahoo Finance');
  }

  return { cookie: cookieStr, crumb };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    const auth = await getAuth();
    const { date } = req.query;
    const base = `https://query2.finance.yahoo.com/v7/finance/options/%5ESPX?crumb=${encodeURIComponent(auth.crumb)}`;
    const url = date ? `${base}&date=${date}` : base;

    const response = await fetch(url, {
      headers: { 'User-Agent': UA, 'Cookie': auth.cookie },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: `Yahoo Finance returned ${response.status}`,
        detail: body.substring(0, 200),
      });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
