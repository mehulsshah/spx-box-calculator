// Vercel Serverless Function: proxies CBOE delayed SPX options data
// CBOE's API is reliable from cloud IPs (no auth required)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const response = await fetch('https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `CBOE returned ${response.status}` });
    }

    const raw = await response.json();
    
    // Transform CBOE data into a useful format for the frontend
    const data = raw.data;
    const spot = data.current_price;
    
    // Parse options into organized structure
    // CBOE option symbols: SPX(W)YYMMDD[C/P]SSSSSSSSS
    const options = data.options || [];
    const expirations = new Set();
    const chains = {};

    for (const opt of options) {
      // Parse the option symbol: e.g. "SPXW261231C06860000"
      const sym = opt.option;
      if (!sym) continue;
      
      // Extract expiration and type from symbol
      // Format: SPX(W)YYMMDDX########
      const match = sym.match(/SPX[W]?(\d{6})([CP])(\d{8})/);
      if (!match) continue;
      
      const [, dateStr, type, strikeStr] = match;
      const year = 2000 + parseInt(dateStr.substring(0, 2));
      const month = parseInt(dateStr.substring(2, 4));
      const day = parseInt(dateStr.substring(4, 6));
      const expiry = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const strike = parseInt(strikeStr) / 1000;
      
      expirations.add(expiry);
      
      if (!chains[expiry]) chains[expiry] = {};
      if (!chains[expiry][strike]) chains[expiry][strike] = {};
      
      chains[expiry][strike][type === 'C' ? 'call' : 'put'] = {
        bid: opt.bid,
        ask: opt.ask,
        mid: ((opt.bid || 0) + (opt.ask || 0)) / 2,
        last: opt.last_trade_price,
        iv: opt.iv,
        delta: opt.delta,
        volume: opt.volume,
        openInterest: opt.open_interest,
      };
    }

    res.status(200).json({
      source: 'CBOE',
      spot,
      timestamp: data.last_trade_time,
      expirations: Array.from(expirations).sort(),
      chains,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
