// Vercel Serverless Function: proxies Yahoo Finance SPX options data
// Uses cookie + crumb authentication (required since 2024)

let cachedAuth = null;
let authExpiry = 0;

async function getAuth() {
  const now = Date.now();
  if (cachedAuth && now < authExpiry) return cachedAuth;

  // Step 1: Get cookies from Yahoo Finance
  const initRes = await fetch('https://finance.yahoo.com/quote/%5ESPX/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  const cookies = initRes.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
    },
  });

  const crumb = await crumbRes.text();

  cachedAuth = { cookie: cookieStr, crumb };
  authExpiry = now + 5 * 60 * 1000; // cache 5 min
  return cachedAuth;
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': auth.cookie,
      },
    });

    if (!response.ok) {
      // Clear cache on auth failure so next request retries
      if (response.status === 401) {
        cachedAuth = null;
        authExpiry = 0;
      }
      return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
