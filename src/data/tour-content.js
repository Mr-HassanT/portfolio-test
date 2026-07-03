/*
 * All human-readable tour content lives here so copy can be edited
 * without touching scene or UI code.
 */

export const SITE = {
  name: 'Muhammad Hassan Tariq',
  role: 'Quantitative Developer',
  location: 'Abu Dhabi',
  linkedin: 'https://www.linkedin.com/in/hassantq/',
  // Replace with a different address if you prefer a dedicated contact inbox.
  email: 'htariq0601@gmail.com',
  canonicalUrl: 'https://mr-hassant.github.io/portfolio-test/'
};

/*
 * Story stops along the flight path.
 *  t       - position along the camera spline (0..1)
 *  carrier - which 3D contraption holds the card in the sky
 *  lines   - card body copy, pre-wrapped for the canvas renderer
 */
export const chapters = [
  {
    t: 0.05, carrier: 'blimp', tag: 'WELCOME ABOARD', title: "HI, I'M HASSAN",
    sub: 'Muhammad Hassan Tariq · Quantitative Developer · Abu Dhabi', accent: '#e2674f',
    foot: 'TICKER: HSSN · SECTOR: QUANT DEVELOPMENT · HQ: ABU DHABI',
    lines: [
      'I build trading systems and ML models that',
      'run on live US markets - and so does this',
      'city. The weather here is real: the sky',
      'tracks SPY, QQQ and VOO right now.',
      'Green tape shines. Red tape rains.'
    ]
  },
  {
    t: 0.24, carrier: 'heli', tag: 'STOP 1 · WHERE IT BEGAN', title: "TAYLOR'S UNIVERSITY",
    sub: 'BSc (Hons) Computer Science · AI & Cybersecurity', accent: '#5f7fc0',
    foot: 'CLASS OF DEC 2022 · AI & CYBERSECURITY · AZURE AZ-900 · CISI (UAE)',
    lines: [
      'Graduated December 2022 after a foundation',
      'year at Heriot-Watt University Dubai.',
      'Specialised in AI & Cybersecurity, then',
      'went straight for the markets.',
      'Certified: Azure AZ-900 · CISI (UAE).'
    ]
  },
  {
    t: 0.44, carrier: 'crane', tag: 'STOP 2 · THE BUILDING YEARS', title: 'AL RAMZ · 2022–25',
    sub: 'Software Engineer → Quantitative Developer · Algo Desk', accent: '#3f9181',
    foot: 'FIX CONNECTIVITY · BLAZOR RISK DASHBOARDS · MARGIN FRAMEWORKS',
    lines: [
      'Joined the Robotics & Algorithms desk and',
      'grew from Software Engineer into a Quant',
      'Developer role. Built a proprietary FIX',
      'engine for automated execution, Blazor risk',
      'dashboards, and margin frameworks.'
    ]
  },
  {
    t: 0.64, carrier: 'bank', tag: 'STOP 3 · TODAY', title: 'IRH · QUANT EQUITIES',
    sub: 'Quantitative Developer · International Resources Holding', accent: '#c98a12',
    foot: 'SINCE SEP 2025 · ML MODELS ON GLOBAL EQUITIES · OPTIONS RISK DAILY',
    lines: [
      'ML.NET models trading global equities, with',
      'Databricks research pipelines feeding the desk.',
      'Built an OTC options platform pricing Greeks,',
      'vol surfaces and IV term structure - deployed',
      'and generating signals in production.'
    ]
  },
  {
    t: 0.82, carrier: 'balloon', tag: 'STOP 4 · MY TOOLBOX', title: 'WHAT I BUILD WITH',
    sub: 'Current stack & future directions', accent: '#e8a93d',
    foot: 'STACK: .NET · PYTHON · DATA · CLOUD',
    lines: [
      'C# · .NET · Blazor · ML.NET · WPF · SQL',
      'Python · Databricks · FIX Protocol',
      'Azure DevOps · PowerShell · MSSQL',
      'Currently evaluating PostgreSQL & AWS',
      'for the next generation of the stack.'
    ]
  },
  {
    t: 0.90, carrier: 'party', tag: 'STOP 5 · AFTER HOURS', title: 'LIFE OUTSIDE CODE',
    sub: 'Sports, cars, projects & markets', accent: '#a55f9c',
    foot: 'SIDE PROJECTS · SPORTS · MARKETS · CARS',
    lines: [
      'Padel and cricket keep weekends competitive',
      '- the glass court and oval are right below.',
      'The Mustang GT idles in the garage nearby.',
      'Personal projects (like this city) get built',
      'after hours, while the market sleeps.'
    ]
  },
  {
    t: 0.97, carrier: 'helipad', tag: 'FINAL STOP', title: "LET'S TALK",
    sub: 'Markets · code · big ideas', accent: '#e2674f',
    foot: 'LINKEDIN.COM/IN/HASSANTQ · OPEN TO GREAT CONVERSATIONS',
    lines: [
      'The landing pad is just ahead. If you',
      'trade, build, or want to compare notes',
      'on ML systems, options risk, or markets,',
      'send a message and bring your best',
      'question.'
    ]
  }
];

/* Clickable billboard pop-up copy, keyed by billboard artwork type. */
export const billboardStories = {
  capital: { meta: 'City exchange', title: 'Hassan Tariq', text: 'Quant developer, market systems builder, and mayor of this skyline. HSSN is the one fictional ticker in town with a well-documented green bias.' },
  sharpe: { meta: 'Research district', title: 'Research to production', text: 'Backtests are easy; production is where a model earns its Sharpe. This district is where my notebooks grow up, get jobs, and start paying rent.' },
  fix: { meta: 'Execution lane', title: 'FIX engine', text: 'A proprietary FIX engine built from scratch at Al Ramz: orders in, fills out, clean flow throughout. Coffee consumption remains unmodelled.' },
  candles: { meta: 'HSSN terminal', title: 'Ticker with a pulse', text: 'The stock is imaginary, but the habit is real: candles, signals, risk - and a mild, thoroughly documented green bias.' },
  greeks: { meta: 'Options desk', title: 'Greeks in production', text: 'Delta, gamma, theta, vega, rho - the risk alphabet behind the OTC options platform I built. The only Greeks in town repriced daily before breakfast.' },
  news: { meta: 'Research wire', title: 'Signals shipped', text: 'BREAKING: research has left the slide deck and shipped to the desk. The pipeline remains unbothered and fully automated.' },
  projects: { meta: 'After-hours lab', title: 'Personal coding projects', text: 'The after-hours lab: side projects and prototypes get stress-tested at night so they can act professional by day. This website is one of them.' },
  hire: { meta: 'Landing pad', title: "Let's build", text: 'Markets, code, ML systems, big ideas - the vacancy sign is always lit for a good conversation. Bring your best question; I trade in those.' },
  cloud: { meta: 'Cloud district', title: 'Cloud research stack', text: 'Databricks pipelines and Azure by day, AWS curiosity by night. Research workflows built to outgrow a single machine - unlike this billboard.' },
  ai: { meta: 'Model avenue', title: 'ML in production', text: 'ML.NET models with actual jobs: signals, risk, and pricing on live equities. No chatbots were harmed in the making of this desk.' },
  padel: { meta: 'Weekend derivatives', title: 'Padel & cricket', text: 'Weekend risk book: padel off the glass walls (high gamma, questionable hedging at the net) and cricket cover drives with strictly discretionary footwork.' },
  mustang: { meta: 'Garage district', title: 'Mustang GT', text: '5.0 litres of strictly discretionary horsepower. The one long position in the portfolio that is never, ever getting closed.' }
};

/* Ground-level plaza blurbs, one per story stop. */
export const plazaBlurbs = [
  'Welcome plaza. Look up for the blimp, look around for the weather - the sky is trading SPY, QQQ and VOO as you read this.',
  "Graduation plaza. Somewhere between a Heriot-Watt foundation year and a Taylor's degree, the markets got interesting.",
  'The building-years plaza. One FIX engine, a fleet of Blazor dashboards, and the climb from Software Engineer to Quant Developer.',
  'Head-office plaza. ML models upstairs, options risk priced daily, fountain fully deployed to production.',
  'Toolbox plaza. The fountain runs on C#. The pigeons are migrating to PostgreSQL.',
  'After-hours plaza. Padel to the west, cricket to the east, one very loud garage to the south.',
  'Landing plaza. If you made it this far, we should probably talk - the contact links are on the final card.'
];

export const bankNames = [
  { label: 'BANK OF HASSAN', sub: 'VAULTS FULL OF IDEAS' },
  { label: 'SHARPE & SONS', sub: 'RISK-ADJUSTED SINCE 2022' },
  { label: 'GAMMA SAVINGS', sub: 'WE COMPOUND DAILY' },
  { label: 'DELTA TRUST', sub: 'SMALL MOVES, BIG HEDGES' },
  { label: 'FIX & CO. CLEARING', sub: 'ALL ORDERS FILLED' },
  { label: 'THETA MUTUAL', sub: 'TIME IS ON OUR SIDE' }
];

/* Bottom-of-screen ticker tape. Clearly playful - everything here is a wink, not a stat. */
export const tickerItems = [
  'HSSN ▲ GREEN AS ALWAYS', 'C#/.NET ▲ HELD LONG', 'ML.NET ▲ IN PRODUCTION', 'FIX ENGINE ▲ FILLED',
  'BLAZOR ▲ RENDERED', 'GREEKS Δ Γ Θ ν · LIVE', 'OTC OPTIONS ▲ PRICED', 'SPY·QQQ·VOO → CITY WEATHER',
  'PADEL ▲ HIGH GAMMA', 'CRICKET ▲ COVER DRIVE', 'MUSTANG GT ▲ 5.0L', 'SIDE PROJECTS ▲ SHIPPING',
  'COFFEE ▲ WELL BID', 'SLEEP ▼ OFFERED', 'EM WATCHLIST ▲ OPEN'
];
