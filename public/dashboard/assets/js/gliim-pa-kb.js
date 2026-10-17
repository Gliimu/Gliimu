// Assistant built-in knowledge base.
//
// This lets the assistant answer the questions Gliimaits actually ask —
// navigation, GP tiers, wallet, pricing, updates, publishing, live,
// premium, profile, support and core media craft — with no external LLM.
// The hosted model (server /api/chat) is still tried first when it is
// funded; this module is the always-available fallback, so the assistant
// never shows a dead end.
//
// Answers are plain markdown. assistant.js escapes everything before it
// renders, so nothing here can inject markup.

const ENTRIES = [
  {
    title: 'What the Assistant can do',
    keys: ['help', 'what can you do', 'who are you', 'gliim pa', 'gliim-pa', 'assistant', 'commands', 'what do you do', 'capabilit'],
    answer: `I am **Assistant**, your built-in AI helper on the Gliimu platform. I work right here in the app, so you always get an answer.

I can help with:
- **Navigating** the dashboard — Hub, Ping, Updates, Queue, Billing, Settings
- **GP and tiers** — what each level unlocks
- **Wallet and top-ups** — funding, transfers, withdrawals
- **Plans and pricing** — Pay n' Go, Monthly, Pro
- **The Updates** — contests, cohorts, leaderboard and referrals
- **Publishing** — uploading a gliim, books, audiolites, bundles and PDFs
- **Going live** — 1-on-1 sessions, screen share, rewards
- **Premium content**, your **portfolio**, and **support**
- **Media craft** — b-roll, editing, lighting, audio, pitching clients

Ask me anything above, or tap a suggested chip to get started.`
  },
  {
    title: 'Navigating the dashboard',
    keys: ['navigate', 'where', 'find', 'menu', 'tab', 'tabs', 'sidebar', 'hub', 'ping', 'queue', 'billing', 'settings', 'updates', 'updates tab', 'community tab', 'how do i get to', 'section'],
    answer: `Here is what each tab in the sidebar does:

- **Hub** — the community feed. Browse, publish and read gliims from other Gliimaits.
- **Ping** — your messages and live sessions. Start a chat or go live with someone.
- **Updates** — contests, cohorts, leaderboard and referrals. Join a contest to climb the leaderboard.
- **Queue** — bring us a deal or gig. See the queue and track your work.
- **Billing** — your wallet balance, plans, top-ups and transaction history.
- **Settings** — your profile, app version and downloads.
- **Assistant** — that is me. Ask me anything, any time.

On a phone the same tabs slide out from the menu button, and the top bar moves to the bottom of the screen. Tap your avatar to open your public portfolio.`
  },
  {
    title: 'GP and tiers',
    keys: ['gp', 'gliim points', 'points', 'tier', 'tiers', 'level', 'rank', 'ambassador', 'earn gp', 'how do i level', 'unlock'],
    answer: `**GP (Gliim Points)** measure how active you are on the platform. They unlock features as you grow:

- **50 GP** — publish posts in the Hub
- **100 GP** — request and host live sessions, and publish content
- **500 GP** — the support icon appears on your work, and you can price PDFs
- **1,000 GP** — premium (locked) content
- **5,000 GP** — Ambassador tier, with a distinct avatar border

You earn GP by posting, going live, and engaging with the community. Your current GP shows on your profile and under your name in the Hub.`
  },
  {
    title: 'Wallet, top-ups and transfers',
    keys: ['wallet', 'top up', 'topup', 'fund', 'funds', 'payment', 'pay', 'bank', 'transfer', 'paystack', 'naira', 'money', 'balance', 'withdraw', 'withdrawal', 'add money', 'cash'],
    answer: `Your **Billing** tab holds your wallet.

- **Top up** — tap the add-fund button and choose a bank transfer or a card payment (Paystack). Bank transfers are verified by the registrar, usually with one click.
- **Balance** — your live naira balance shows at the top of Billing.
- **Send to another Gliimait** — use transfer-to-user. For security you must confirm with your password.
- **History** — every top-up, purchase and transfer is listed with its status.

Withdrawals and revenue share follow the terms you accepted at sign-up. If a top-up is still pending, give the registrar a moment to verify it.`
  },
  {
    title: 'Plans and pricing',
    keys: ['price', 'pricing', 'cost', 'tuition', 'plan', 'plans', 'subscription', 'monthly', 'pro', "pay n go", 'pay n\' go', 'how much', 'fee', 'fees'],
    answer: `Gliimu runs three ways to pay:

- **Pay n' Go** — no subscription. You pay only for the premium content you unlock.
- **Monthly** — a recurring plan with broader access.
- **Pro** — the full tier.

Program tuition is set at a premium tier, roughly **₦70,000 to ₦780,000**, depending on the subscription plan you choose. All payments are final and non-refundable once access is granted, except in documented cases of verifiable platform failure.

Open **Billing** to see the current plan cards and pick the one that fits you.`
  },
  {
    title: 'The Updates page',
    keys: ['updates', 'arena', 'community', 'contest', 'contests', 'leaderboard', 'cohort', 'cohorts', 'competition', 'join a contest', 'seats', 'prize', 'rank', 'standing', 'standings'],
    answer: `Your **Updates** tab is where Gliimaits come together:

- **Leaderboard & Contests** — join a contest to be tracked on its leaderboard. Each contest scores you automatically by its metric: GP earned, titles read, engagement, or referrals. The top 7 of the featured contest are shown.
- **Cohorts** — seat-capped groups. Request a seat and the operations team approves you.
- **Refer & earn** — share your referral link and earn 100 GP when a friend signs up and buys.

Use the filter button at the top to view one section at a time. Join a contest, take part, and your standing updates on its own — no manual scoring.`
  },
  {
    title: 'Publishing a gliim',
    keys: ['upload', 'post', 'publish', 'gliim', 'gliims', 'bundle', 'book', 'audiolite', 'pdf', 'submit', 'content', 'create', 'composer', 'share my work'],
    answer: `To publish in the **Hub**:

1. Make sure you have at least **50 GP**.
2. Tap the **+** button to open the composer.
3. Choose what you are making — a **Book**, an **Audiolite**, or a **Bundle** that mixes text, images, video, audio and PDFs.
4. Add your files, a title and a description. PDFs can carry their own price once you reach **500 GP**.
5. Submit.

New gliims go to the CRM team for a quick review. Once approved they appear in the Hub and on your portfolio. You can mark a gliim **premium** to lock it behind GP.`
  },
  {
    title: 'Going live',
    keys: ['live', 'stream', 'go live', 'session', 'sessions', 'webcam', 'screen share', 'broadcast', 'video call', '1-on-1', 'host'],
    answer: `Live sessions are **1-on-1** video calls, reached from the **Ping** tab.

- You need **100 GP** to request or host a live session.
- Both people can toggle their camera, share their screen and take a screenshot.
- Sessions have a view cap and expire after a few views, so make them count.
- Hosting earns you a **25 GP** reward.

Open Ping, pick the Gliimait you want to meet, and start the session. While you are live, your other sessions are locked so you can focus on the one in front of you.`
  },
  {
    title: 'Premium content',
    keys: ['premium', 'lock', 'locked', 'unlock', 'exclusive', 'paywall', 'paid content', 'is_premium'],
    answer: `**Premium** gliims are locked until they are unlocked. An author marks a post premium in the composer; readers then unlock it once, and keep access forever.

- Unlocking uses your wallet balance.
- Premium posting opens up at **1,000 GP**.
- Once you unlock something it stays in your library — you never pay twice for the same piece.

Look for the lock badge on a card in the Hub to see what is premium.`
  },
  {
    title: 'Your profile and portfolio',
    keys: ['profile', 'portfolio', 'qr', 'print', 'cv', 'resume', 'projects', 'my page', 'avatar', 'bio'],
    answer: `Tap your **avatar** (in the sidebar, or the menu on mobile) to open your public portfolio.

It is laid out like an A4 page and shows:
- Your name, verified label and GP tier
- Your **Projects** — the gliims you have published
- A **QR code** that links straight to the page

Use the print button to export a clean PDF you can share with clients. Your avatar border reflects your tier: a glow at 1,000 GP and the Ambassador styling at 5,000 GP.`
  },
  {
    title: 'Support and reporting',
    keys: ['support', 'contact', 'help desk', 'report', 'issue', 'bug', 'problem', 'reach', 'complaint', 'not working', 'broken', 'error'],
    answer: `If something is not right:

- **Report content** — use the report option on any gliim or profile and pick a reason. The CRM team reviews every report.
- **Payment or top-up problems** — check your Billing history first, then reach the registrar.
- **Platform support** — use the contact form on the Gliimu site, or ping the support account.

Tell me what is going wrong and I will point you to the right place.`
  },
  {
    title: 'B-roll and core craft',
    keys: ['b-roll', 'broll', 'b roll', 'editing', 'edit', 'color', 'colour', 'lighting', 'audio', 'camera', 'shot', 'shots', 'footage', 'filming', 'video', 'cinematograph', 'cut'],
    answer: `**B-roll** is the extra footage you cut away to, on top of your main shot (the A-roll). It hides jump cuts, adds context and makes an edit feel professional.

Start here:
- **Shoot for the edit** — grab wide, medium and tight of every subject, plus hands, details and movement.
- **Keep clips steady** — 5 to 10 seconds each, slow pushes or pans, no shaky zooms.
- **Match the story** — b-roll should illustrate what is being said, not distract from it.
- **Light and audio first** — a clean, lit subject beats fancy gear. Bad audio kills a video faster than bad picture.

As a Full Stack Media Architect, your b-roll library is an asset — reuse it across client work.`
  },
  {
    title: 'Pitching and client work',
    keys: ['pitch', 'client', 'clients', 'proposal', 'brief', 'contract', 'freelance', 'deal', 'deals', 'gig', 'sell', 'outreach'],
    answer: `A short pitch that lands:

> Hi [name] — I am a Full Stack Media Architect. I help [type of business] turn one idea into a full set of assets: video, stills, copy and a distribution plan. For [their goal], I would deliver [1-2 concrete outputs] by [timeframe]. Happy to send a quick sample or a 15-minute plan — which works for you?

Keep it under five sentences, name their goal, promise a concrete deliverable and end with one easy question. Follow up once after three days. Track live opportunities in the **Queue** tab.`
  },
  {
    title: 'Outlines and structuring notes',
    keys: ['outline', 'notes', 'summarize', 'summarise', 'structure', 'organize', 'organise', 'plan it', 'rewrite', 'clean up'],
    answer: `Paste your raw notes and I will shape them. A clean outline usually looks like this:

1. **Goal** — one line on what the piece must achieve.
2. **Hook** — the opening that earns attention.
3. **Key points** — three to five beats, each with one supporting detail.
4. **Proof** — an example, stat or short story per beat.
5. **Close / call to action** — what the audience does next.

Drop your notes here and tell me the format you want (script, article, carousel or brief) and I will lay it out.`
  },
  {
    title: 'What to learn next',
    keys: ['next', 'what next', 'learn next', 'roadmap', 'after this', 'where do i start', 'path', 'progress', 'improve'],
    answer: `For a **Full Stack Media Architect**, a sensible order is:

1. **Foundations** — story, framing, lighting and clean audio.
2. **Production** — camera work and shooting for the edit.
3. **Post** — editing, colour, sound design and b-roll.
4. **Distribution** — packaging work for each platform.
5. **Monetisation** — pitching clients, pricing and delivering.
6. **Capstone** — a complete piece for your portfolio.

Work through them in order, then publish each result in the Hub. Building in public is how the lessons turn into GP, a portfolio and paid work. Check the **Arena** tab for contests and cohorts to practise with.`
  }
];

const GREETING_KEYS = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy', 'yo', 'sup'];

const FALLBACK = `I am not sure I caught that, but I can definitely help.

Try asking about:
- **GP and tiers**, or what each level unlocks
- **Wallet, top-ups and transfers**
- **Plans and pricing**
- **The Updates** — contests, cohorts, leaderboard and referrals
- **Publishing a gliim** (books, audiolites, bundles, PDFs)
- **Going live**, **premium content**, or your **portfolio**
- **Media craft** — b-roll, editing, lighting, pitching clients
- **Support** and reporting a problem

Rephrase your question, or tap one of the chips below.`;

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(entry, query) {
  let hits = 0;
  for (const key of entry.keys) {
    if (query.includes(key)) hits += key.includes(' ') ? 2 : 1;
  }
  return hits;
}

// Returns a markdown answer for any input. Always non-empty: an unmatched
// question gets the FALLBACK guide rather than a dead end.
export function kbAnswer(text) {
  const query = normalise(text);
  if (!query) return FALLBACK;

  // A bare greeting gets a warm, useful hello rather than the generic guide.
  const words = query.split(' ');
  if (words.length <= 3 && words.some(w => GREETING_KEYS.includes(w))) {
    return `Hey, I am **Assistant**, your AI helper on Gliimu. Ask me anything about Gliimu — your **courses**, **GP and tiers**, the **wallet**, **publishing**, **going live** or **media craft**. What would you like to do?`;
  }

  let best = null;
  let bestScore = 0;
  for (const entry of ENTRIES) {
    const s = score(entry, query);
    if (s > bestScore) { bestScore = s; best = entry; }
  }

  if (best && bestScore > 0) return best.answer;
  return FALLBACK;
}

export default kbAnswer;
