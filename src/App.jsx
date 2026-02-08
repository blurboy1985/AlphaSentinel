import React, { useState, useEffect } from 'react';
import { 
  ComposedChart, 
  LineChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';
import { 
  Search, 
  Activity, 
  TrendingUp, 
  RefreshCw, 
  BarChart2, 
  AlertCircle, 
  Settings, 
  DollarSign, 
  Shield 
} from 'lucide-react';

// --- UTILS & MATH HELPERS ---

// Deterministic random number generator to make sure "AAPL" always looks like "AAPL"
const seededRandom = (seed) => {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const generateStockData = (ticker) => {
  // Turn ticker string into a numeric seed
  let seed = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const data = [];
  // Start price between 100-150
  let price = 100 + (seededRandom(seed) * 50); 
  let trend = (seededRandom(seed + 1) - 0.5) * 0.2; // Slight drift
  
  const now = new Date();
  
  // Generate 400 points (200 warm-up + 200 visible)
  // This ensures SMA200 is valid from the very first visible point
  const totalPoints = 400; 
  
  for (let i = 0; i < totalPoints; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (totalPoints - i));
    
    // Random Walk with Drift
    const volatility = price * 0.02; // 2% daily vol
    const change = (seededRandom(seed + i) - 0.5) * volatility + trend;
    price += change;
    
    // Ensure positive price
    price = Math.max(price, 5);

    data.push({
      date: date.toISOString().split('T')[0],
      price: price,
      volume: Math.floor(seededRandom(seed + i + 1000) * 1000000)
    });
  }
  return data;
};

const calculateIndicators = (data) => {
  const period50 = 50;
  const period200 = 200;
  const rsiPeriod = 14;
  
  let gains = 0;
  let losses = 0;

  const dataWithIndicators = data.map((day, index) => {
    // SMA 50
    let sma50 = null;
    if (index >= period50 - 1) {
      const slice = data.slice(index - period50 + 1, index + 1);
      sma50 = slice.reduce((sum, d) => sum + d.price, 0) / period50;
    }

    // SMA 200
    let sma200 = null;
    if (index >= period200 - 1) {
      const slice = data.slice(index - period200 + 1, index + 1);
      sma200 = slice.reduce((sum, d) => sum + d.price, 0) / period200;
    }

    // RSI
    let rsi = 50;
    if (index > 0) {
      const change = day.price - data[index - 1].price;
      if (index <= rsiPeriod) {
        if (change > 0) gains += change;
        else losses -= change;
        if (index === rsiPeriod) {
          const avgGain = gains / rsiPeriod;
          const avgLoss = losses / rsiPeriod;
          rsi = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
        }
      } else {
        // Simple RSI approximation for this demo loop
        const slice = data.slice(index - rsiPeriod + 1, index + 1);
        let g = 0, l = 0;
        for (let k = 1; k < slice.length; k++) {
            const d = slice[k].price - slice[k-1].price;
            if (d > 0) g += d; else l -= d;
        }
        rsi = 100 - (100 / (1 + ((g/rsiPeriod) / ((l/rsiPeriod) || 1))));
      }
    }

    // Bollinger Bands (20, 2)
    let bbUpper = null;
    let bbLower = null;
    let zScore = 0;
    if (index >= 20) {
        const slice = data.slice(index - 19, index + 1);
        const mean = slice.reduce((a, b) => a + b.price, 0) / 20;
        const stdDev = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b.price - mean, 2), 0) / 20);
        bbUpper = mean + (2 * stdDev);
        bbLower = mean - (2 * stdDev);
        zScore = (day.price - mean) / (stdDev || 1);
    }

    return { ...day, sma50, sma200, rsi, bbUpper, bbLower, zScore };
  });

  // Return only the last 200 points for the chart view
  // This ensures SMAs are pre-calculated for the visible range
  return dataWithIndicators.slice(-200);
};

// --- COMPONENTS ---

const ScoreCard = ({ title, score, weight, description, icon: Icon, color }) => {
  const weightedScore = score * weight;
  
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-md bg-opacity-20 ${color.bg} ${color.text}`}>
            <Icon size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
            <p className="text-xs text-slate-400">Weight: {(weight * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div className={`text-xl font-bold ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {score > 0 ? '+' : ''}{score}
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2 h-10">{description}</p>
      <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between items-center">
          <span className="text-xs text-slate-500">Contribution</span>
          <span className={`text-sm font-mono ${weightedScore > 0 ? 'text-green-400' : weightedScore < 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {weightedScore > 0 ? '+' : ''}{weightedScore.toFixed(2)}
          </span>
      </div>
    </div>
  );
};

export default function App() {
  const envKey = import.meta.env.VITE_FINNHUB_API_KEY || '';
  const savedKey = localStorage.getItem('alphaEngine_finnhubKey') || envKey;
  const savedDefault = localStorage.getItem('alphaEngine_defaultTicker') || 'NFLX';

  const [ticker, setTicker] = useState(savedDefault);
  const [searchVal, setSearchVal] = useState(savedDefault);
  const [data, setData] = useState([]);
  const [weights, setWeights] = useState({ trend: 0.4, meanRev: 0.4, sentiment: 0.2 });
  const [analyzing, setAnalyzing] = useState(false);
  const [dataSource, setDataSource] = useState('loading'); // 'yahoo' | 'simulated' | 'loading'
  const [apiKey, setApiKey] = useState(savedKey);
  const [apiKeyInput, setApiKeyInput] = useState(savedKey);
  const [defaultTickerInput, setDefaultTickerInput] = useState(savedDefault);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [finnhubQuote, setFinnhubQuote] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);

  const handleSaveSettings = () => {
    const newKey = apiKeyInput.trim();
    const newDefault = defaultTickerInput.trim().toUpperCase();
    if (newKey) {
      localStorage.setItem('alphaEngine_finnhubKey', newKey);
      setApiKey(newKey);
    }
    if (newDefault) {
      localStorage.setItem('alphaEngine_defaultTicker', newDefault);
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // Effect 1: Fetch historical OHLCV from Yahoo Finance (no API key needed)
  useEffect(() => {
    if (!ticker) return;
    setAnalyzing(true);
    setDataSource('loading');

    const fetchYahooData = async () => {
      try {
        const yahooPath = `/v8/finance/chart/${ticker}?range=2y&interval=1d`;
        const url = import.meta.env.DEV
          ? `/api/yahoo${yahooPath}`
          : `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com${yahooPath}`)}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Yahoo Finance HTTP ${response.status}`);
        }

        const json = await response.json();
        const result = json.chart?.result?.[0];

        if (!result || !result.timestamp) {
          throw new Error('No data returned from Yahoo Finance');
        }

        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        const rawData = timestamps.map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          price: quotes.close[i],
          volume: quotes.volume[i]
        })).filter(d => d.price != null);

        const processedData = calculateIndicators(rawData);
        setData(processedData);
        setDataSource('yahoo');
      } catch (error) {
        console.warn('Yahoo Finance fetch failed, using simulated data:', error.message);
        const rawData = generateStockData(ticker);
        setData(calculateIndicators(rawData));
        setDataSource('simulated');
      } finally {
        setAnalyzing(false);
      }
    };

    fetchYahooData();
  }, [ticker]);

  // Effect 2: Fetch Finnhub quote, recommendations, and company profile
  useEffect(() => {
    if (!ticker || !apiKey) {
      setFinnhubQuote(null);
      setRecommendations(null);
      setCompanyProfile(null);
      return;
    }

    const fetchFinnhubData = async () => {
      const base = 'https://finnhub.io/api/v1';
      const [quoteRes, recsRes, profileRes] = await Promise.allSettled([
        fetch(`${base}/quote?symbol=${ticker}&token=${apiKey}`),
        fetch(`${base}/stock/recommendation?symbol=${ticker}&token=${apiKey}`),
        fetch(`${base}/stock/profile2?symbol=${ticker}&token=${apiKey}`),
      ]);

      if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
        const q = await quoteRes.value.json();
        if (q.c && q.c > 0) setFinnhubQuote(q);
      }

      if (recsRes.status === 'fulfilled' && recsRes.value.ok) {
        const recs = await recsRes.value.json();
        if (Array.isArray(recs) && recs.length > 0) setRecommendations(recs[0]);
        else setRecommendations(null);
      }

      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        const profile = await profileRes.value.json();
        if (profile.name) setCompanyProfile(profile);
        else setCompanyProfile(null);
      }
    };

    fetchFinnhubData().catch(err => console.warn('Finnhub fetch error:', err.message));
  }, [ticker, apiKey]);


  // Derived State (Latest Signals)
  const current = data[data.length - 1] || {};
  const prev = data[data.length - 2] || {};
  
  // Model A: Trend
  // Logic: Bullish if Price > SMA200. Bearish if < SMA200.
  const trendScore = current.price > current.sma200 ? 1 : -1;
  const trendDesc = trendScore === 1 
    ? "Price is trading above the long-term 200-day average. Uptrend intact." 
    : "Price is below the 200-day average. Primary trend is bearish.";

  // Model B: Mean Reversion
  // Logic: Buy if Z-Score < -2. Sell if Z-Score > 2. Neutral otherwise.
  let revScore = 0;
  if (current.zScore < -2) revScore = 1;
  else if (current.zScore > 2) revScore = -1;
  const revDesc = revScore === 1 
    ? "Statistical extension to downside (Oversold). Snap-back likely."
    : revScore === -1 
        ? "Statistical extension to upside (Overbought). Pullback likely." 
        : "Price is within normal statistical bands. No edge.";

  // Model C: Sentiment (Real analyst consensus from Finnhub, fallback to SMA50)
  let sentimentScore = 0;
  let sentimentDesc = '';
  if (recommendations) {
    const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = recommendations;
    const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
    if (totalAnalysts > 0) {
      const rawScore = (strongBuy * 2 + buy * 1 + hold * 0 + sell * -1 + strongSell * -2) / totalAnalysts;
      const normalized = Math.max(-1, Math.min(1, rawScore));
      sentimentScore = normalized > 0.3 ? 1 : normalized < -0.3 ? -1 : 0;
      sentimentDesc = `${totalAnalysts} analysts: ${strongBuy + buy} Buy, ${hold} Hold, ${sell + strongSell} Sell. Consensus score: ${rawScore.toFixed(2)}.`;
    } else {
      sentimentScore = current.price > current.sma50 ? 1 : -1;
      sentimentDesc = 'No analyst data. Falling back to price vs SMA50.';
    }
  } else {
    sentimentScore = current.price > current.sma50 ? 1 : -1;
    sentimentDesc = sentimentScore === 1
      ? "No analyst data available. Price above SMA50 used as proxy."
      : "No analyst data available. Price below SMA50 used as proxy.";
  }

  // Final Calculations
  const totalScore = (trendScore * weights.trend) + (revScore * weights.meanRev) + (sentimentScore * weights.sentiment);
  
  // Kelly Sizing
  const volatility = (current.price - prev.price) / prev.price; // Daily return
  const annualizedVol = Math.abs(volatility * Math.sqrt(252));
  const targetVol = 0.15; // 15% target
  let positionSize = (targetVol / (annualizedVol || 0.01)) * Math.abs(totalScore); 
  positionSize = Math.min(positionSize, 2.5) * 10; // Scaled for display
  
  // Color Helpers
  const getScoreColor = (s) => s > 0.2 ? 'text-green-400' : s < -0.2 ? 'text-red-400' : 'text-yellow-400';
  const getScoreBg = (s) => s > 0.2 ? 'bg-green-500/20 border-green-500' : s < -0.2 ? 'bg-red-500/20 border-red-500' : 'bg-yellow-500/20 border-yellow-500';

  const handleSearch = (e) => {
    e.preventDefault();
    if(searchVal.trim()) setTicker(searchVal.toUpperCase());
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 md:p-8">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
                <Activity className="text-white" size={24} />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Alpha Engine <span className="text-blue-500">Terminal</span></h1>
                <p className="text-xs text-slate-400">Quantitative Multi-Factor Analysis System</p>
            </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
          <div className="relative group w-full">
            <Search className="absolute left-3 top-3 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input 
              type="text" 
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Enter Ticker (e.g. NFLX)"
              className="bg-slate-800 border border-slate-700 text-slate-200 pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-blue-500 w-full md:w-64 transition-all"
            />
          </div>
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20">
            Analyze
          </button>
        </form>
      </header>

      {/* Data Source Banner */}
      {dataSource === 'yahoo' && (
        <div className="mb-6 flex items-center gap-3 bg-green-500/10 border border-green-500/30 text-green-300 rounded-lg px-4 py-3 text-sm">
          <Activity size={18} className="shrink-0" />
          <span>
            <strong>Live Data</strong> — {companyProfile?.name || ticker} historical prices via Yahoo Finance.
            {finnhubQuote && ` Real-time: $${finnhubQuote.c.toFixed(2)}`}
            {recommendations && ` · ${(recommendations.strongBuy || 0) + (recommendations.buy || 0) + (recommendations.hold || 0) + (recommendations.sell || 0) + (recommendations.strongSell || 0)} analyst ratings`}
          </span>
        </div>
      )}
      {dataSource === 'simulated' && (
        <div className="mb-6 flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>
            Yahoo Finance unavailable. Displaying <strong>simulated data</strong> for {ticker}.
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls & Signal Breakdown (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
            
            {/* Strategy Weights */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center gap-2 mb-4 text-slate-100">
                    <Settings size={18} />
                    <h3 className="font-semibold">Strategy Configuration</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Trend Weight</span>
                            <span className="text-blue-400">{(weights.trend * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={weights.trend}
                            onChange={(e) => setWeights({...weights, trend: parseFloat(e.target.value)})}
                            className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Mean Rev Weight</span>
                            <span className="text-purple-400">{(weights.meanRev * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={weights.meanRev}
                            onChange={(e) => setWeights({...weights, meanRev: parseFloat(e.target.value)})}
                            className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Sentiment Weight</span>
                            <span className="text-amber-400">{(weights.sentiment * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={weights.sentiment}
                            onChange={(e) => setWeights({...weights, sentiment: parseFloat(e.target.value)})}
                            className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* API & Defaults */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center gap-2 mb-4 text-slate-100">
                    <Shield size={18} />
                    <h3 className="font-semibold">API Settings</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Finnhub API Key</label>
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="Enter Finnhub API key"
                            className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Default Ticker</label>
                        <input
                            type="text"
                            value={defaultTickerInput}
                            onChange={(e) => setDefaultTickerInput(e.target.value.toUpperCase())}
                            placeholder="e.g. AAPL"
                            className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleSaveSettings}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                        {settingsSaved ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>

            {/* Score Cards */}
            <div className="space-y-3">
                <ScoreCard 
                    title="Trend" 
                    score={trendScore} 
                    weight={weights.trend} 
                    description={trendDesc}
                    icon={TrendingUp}
                    color={{bg: 'bg-blue-500', text: 'text-blue-400'}}
                />
                <ScoreCard 
                    title="Mean Reversion" 
                    score={revScore} 
                    weight={weights.meanRev} 
                    description={revDesc}
                    icon={RefreshCw}
                    color={{bg: 'bg-purple-500', text: 'text-purple-400'}}
                />
                <ScoreCard 
                    title="Sentiment" 
                    score={sentimentScore} 
                    weight={weights.sentiment} 
                    description={sentimentDesc}
                    icon={BarChart2}
                    color={{bg: 'bg-amber-500', text: 'text-amber-400'}}
                />
            </div>
        </div>

        {/* MIDDLE COLUMN: Charts (6 Cols) */}
        <div className="lg:col-span-6 space-y-6">
            
            {/* Price Chart */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-[400px]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                        {companyProfile?.logo && (
                          <img src={companyProfile.logo} alt="" className="w-6 h-6 rounded" />
                        )}
                        {companyProfile?.name ? `${companyProfile.name} (${ticker})` : ticker} Price Action
                        {analyzing && <RefreshCw className="animate-spin text-blue-500" size={14} />}
                    </h3>
                    <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1 text-orange-400"><div className="w-2 h-2 rounded-full bg-orange-400"></div> SMA 50</span>
                        <span className="flex items-center gap-1 text-red-500"><div className="w-2 h-2 rounded-full bg-red-500"></div> SMA 200</span>
                    </div>
                </div>
                
                <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={data}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis 
                            dataKey="date" 
                            hide={true} 
                        />
                        <YAxis 
                            domain={['auto', 'auto']} 
                            orientation="right" 
                            tick={{fill: '#94a3b8', fontSize: 10}} 
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip 
                            contentStyle={{backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px'}}
                            itemStyle={{color: '#e2e8f0'}}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="price" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorPrice)" 
                        />
                        {/* SMA Lines now have thicker strokes and valid data across the chart */}
                        <Line type="monotone" dataKey="sma50" stroke="#fb923c" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="sma200" stroke="#ef4444" dot={false} strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* RSI Chart */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-[200px]">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-slate-100 text-sm">RSI (14) Momentum</h3>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${current.rsi < 30 ? 'bg-green-500 text-white' : current.rsi > 70 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {current.rsi?.toFixed(1)}
                    </span>
                </div>
                <ResponsiveContainer width="100%" height="80%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" hide={true} />
                        <YAxis domain={[0, 100]} orientation="right" tick={{fill: '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 100]} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                        <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="rsi" stroke="#a855f7" dot={false} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* RIGHT COLUMN: Output & Sizing (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
            
            {/* Final Signal */}
            <div className={`rounded-xl p-6 border-2 ${getScoreBg(totalScore)} transition-all duration-500`}>
                <h2 className="text-slate-400 text-sm uppercase tracking-wider font-semibold mb-2">Alpha Verdict</h2>
                <div className="flex items-baseline gap-2 mb-4">
                    <span className={`text-4xl font-bold ${getScoreColor(totalScore)}`}>
                        {totalScore > 0.2 ? "BUY" : totalScore < -0.2 ? "SELL" : "NEUTRAL"}
                    </span>
                    <span className="text-slate-400 text-sm">Score: {totalScore.toFixed(2)}</span>
                </div>
                
                <div className="space-y-3">
                    {finnhubQuote && (
                      <div className="flex justify-between text-sm border-b border-slate-700/50 pb-2">
                        <span className="text-slate-400">Live Price</span>
                        <span className="text-slate-200 flex items-center gap-2">
                          ${finnhubQuote.c.toFixed(2)}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${finnhubQuote.dp >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {finnhubQuote.dp >= 0 ? '+' : ''}{finnhubQuote.dp.toFixed(2)}%
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-b border-slate-700/50 pb-2">
                        <span className="text-slate-400">Conviction</span>
                        <span className="text-slate-200">{Math.abs(totalScore * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-sm border-b border-slate-700/50 pb-2">
                        <span className="text-slate-400">Risk Level</span>
                        <span className="text-slate-200">{current.zScore < -2 || current.zScore > 2 ? "High (Reversal)" : "Moderate (Trend)"}</span>
                    </div>
                </div>
            </div>

            {/* Position Sizing (Kelly) */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                    <DollarSign size={64} className="text-green-400" />
                </div>
                
                <h3 className="font-semibold text-slate-100 flex items-center gap-2 mb-4">
                    <Shield size={16} className="text-green-400" />
                    Risk Management
                </h3>

                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-slate-400 mb-1">Recommended Position Size</p>
                        <div className="text-2xl font-mono font-bold text-slate-200">
                            {totalScore > 0.2 || totalScore < -0.2 ? `${positionSize.toFixed(1)}%` : "0.0%"}
                        </div>
                        <p className="text-[10px] text-slate-500">Based on 15% Volatility Target</p>
                    </div>

                    <div className="pt-4 border-t border-slate-700">
                        <p className="text-xs text-slate-400 mb-2">Stop Loss Level</p>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-mono text-red-400">
                                ${(current.price * 0.92).toFixed(2)}
                            </span>
                            <span className="text-xs text-red-500/80 bg-red-500/10 px-2 py-0.5 rounded">
                                -8.0%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="flex gap-2 text-slate-500">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-relaxed">
                        <strong>{dataSource === 'yahoo' ? 'Live Data:' : 'Simulation Mode:'}</strong>{' '}
                        {dataSource === 'yahoo'
                          ? 'Historical prices from Yahoo Finance. Real-time quotes and analyst ratings from Finnhub. Not financial advice.'
                          : 'Market data is statistically generated for demonstration. Real-world Alpha Engines use paid feeds (Bloomberg/Refinitiv) and execute via FIX protocol.'}
                    </p>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}