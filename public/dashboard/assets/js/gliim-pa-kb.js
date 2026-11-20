// Gliim P.A. built-in knowledge base.
//
// This lets her answer the questions Gliimaits actually ask — navigation,
// GP, wallet, plans, publishing, live, portfolio, cohorts, referrals and
// core media craft — with no external LLM. The hosted model (server /api/chat)
// is still tried first when it is funded; this module is the always-available
// fallback, so the Support chat never shows a dead end.
//
// Answers are plain markdown. views/support.js escapes everything before it
// renders, so nothing here can inject markup.

const ENTRIES = [
  {
    title: 'What Gliim P.A. can do',
    keys: ['help', 'what can you do', 'who are you', 'gliim pa', 'gliim-pa', 'assistant', 'commands', 'what do you do', 'capabilit'],
    answer: `I am **Gliim P.A.**, your built-in assistant on Gliimu. Open the **Support** chat at the top of your **Ping** list and I am there.

I can help with:
- **Navigating** the dashboard — XpLoRe, Publish, Live, Ping, Alerts, Billing, Settings
- **GP** — how you earn them, and what they are for
- **Wallet and top-ups** — funding, transfers, withdrawals
- **Plans and pricing** — what each one charges and where to switch
- **Cohorts and referrals** — applying for a cohort, and Refer & earn
- **Publishing** — a gliim, a book, a log or a bundle
- **Going live** — sessions, screen share, voice notes
- Your **profile and portfolio**, and **support**
- **Media craft** — b-roll, editing, lighting, audio, pitching clients

Ask me anything above, or tap a suggested chip to get started. If my answer ever misses the mark, press the thumbs-down and a person from Team Gliimu takes over.`
  },
  {
    title: 'Navigating the dashboard',
    keys: ['navigate', 'where', 'find', 'menu', 'tab', 'tabs', 'sidebar', 'hub', 'ping', 'billing', 'settings', 'updates', 'support', 'how do i get to', 'section', 'alerts', 'xplore', 'publish'],
    answer: `Gliimu keeps navigation small.

On a **desktop** the slim rail on the left holds three things:
- The **Gliimu logo** — opens **XpLoRe**, the feed where you browse and read gliims.
- **Team** — the people you have added to your Team. Tap one to Ping them or open their gliims.
- **You** — your avatar. Tap it for a menu with **Profile**, **Billing**, **Ping**, **Alerts** and **Settings**.

On a **phone** the same three sit in the bottom bar: **Team**, **XpLoRe**, **You**.

What each page is for:
- **XpLoRe** — the feed, with search above it and tabs for **Collections** and **Saved**. The **Live** and **Publish** buttons sit at the top right.
- **Publish** — the composer for a new gliim.
- **Live** — sessions you can join, and your own studio when you host.
- **Ping** — your chats with other Gliimaits, and the **Support** chat at the top of the list.
- **Alerts** — notices about your account: payments, reading charges, low balance, cohort decisions, replies from the Support desk.
- **Billing** — your wallet, plans, top-ups and history.
- **Settings** — your name, bio, banner, app version and sign out.
- **Profile** — your own page: your gliims, your stats and the QR and share link.`
  },
  {
    title: 'GP (Gliim Points)',
    keys: ['gp', 'gliim points', 'points', 'tier', 'tiers', 'level', 'rank', 'ambassador', 'earn gp', 'how do i level', 'unlock'],
    answer: `**GP (Gliim Points)** measure how much you use Gliimu. They are not money, and no feature on Gliimu is locked behind them.

You earn GP when your work gets used:
- **10 GP** to the author the first time someone reads a gliim.
- **3 GP** to the author when someone likes their gliim.
- **5 GP** for leaving a comment, plus **4 GP** to the author of the gliim you commented on.
- **5 GP** for sharing a gliim, plus **5 GP** to its author.
- **GP** from reacting and supporting inside a live session, and when a friend you referred signs up and their reward vests.

What they are for is standing: your **GP** total is the number people see under your name on your profile, and your Billing history records the GP each action brought you. GP are not money and are never mixed up with it — the **Earnings** tab on Billing reports the tokens your work has paid you, separately.

What they no longer do: publishing is open to every member with no GP minimum, hosting a Live session takes neither GP nor a plan (it costs a small token fee taken once when you go on air), supporting a gliim costs tokens from your wallet, GP cannot be turned into money, and there are no avatar borders or Ambassador tiers.`
  },
  {
    title: 'Wallet, top-ups and transfers',
    keys: ['wallet', 'top up', 'topup', 'fund', 'funds', 'payment', 'pay', 'bank', 'transfer', 'paystack', 'naira', 'money', 'balance', 'withdraw', 'withdrawal', 'add money', 'cash'],
    answer: `Your **Billing** tab holds your wallet.

- **Top up** — tap the add-fund button and pay by card, bank transfer or USSD through Paystack. The wallet is credited as soon as the payment succeeds.
- **Balance** — your live token balance shows at the top of Billing.
- **Share** — send tokens to another Gliimait. For security you must confirm with your password.
- **Withdraw** — move your tokens into your own bank account once your balance reaches the minimum shown on the Withdraw screen.
- **History** — every top-up, purchase, share and payout is listed with its status.

Payouts go to the bank account registered against your own name, and a short hold applies after a top-up before money can leave.`
  },
  {
    title: 'Plans and pricing',
    keys: ['price', 'pricing', 'cost', 'tuition', 'plan', 'plans', 'subscription', 'monthly', 'yearly', 'standard', 'pro', 'xtra', "pay n go", 'pay n\' go', 'how much', 'fee', 'fees', 'renew', 'expired', 'per minute', 'unlimited', 'host fee', 'hosting cost'],
    answer: `Everything starts from your wallet, which holds tokens. Here is how money actually moves on Gliimu:

- **Pay n' Go** is the plan every account is on, and it carries no subscription fee. The older paid plans — Monthly, Yearly and Standard — have been retired, so nobody buys a plan any more.
- **Usage is metered.** The platform's per-minute rate comes out of your wallet for every minute you spend reading a gliim or watching a live session, and a wallet that cannot cover one minute will not open either. There is no unlimited option.
- **Hosting is charged once per session**, when you go on air, at the small fee shown in the host window. It keeps the live rooms free of throwaway sessions. Anyone can host — no plan and no GP requirement.
- **You earn from your room.** Viewers pay the per-minute rate while they watch, and a share of what they pay is credited to you as the creator.
- **Top-ups** — paid in naira through Paystack by card, bank transfer or USSD, and credited at the exchange rate shown on the page.
- **Earnings** — the **Earnings** tab on Billing shows what your own work has brought you.

The exact rate and fee figures on your **Billing** page are the live ones, so those are the ones to trust. They change only when the people running Gliimu change them.`
  },
  {
    title: 'Cohorts and referrals',
    keys: ['updates', 'arena', 'community', 'contest', 'contests', 'leaderboard', 'cohort', 'cohorts', 'competition', 'join a cohort', 'seat', 'seats', 'prize', 'rank', 'standing', 'standings', 'referrals', 'refer', 'invite', 'bring a friend'],
    answer: `There is no **Updates**, **Arena** or contests page any more — the two things people used to look for there now live where you use them:

- **Refer & earn** — on **Billing**, tap the refer icon in the page header. You get one link to copy and send. Pending and vested counts, your GP earned and the list of people who joined you are all in that same card.
- **Cohorts** — seat-capped groups run by the operations team. When a cohort is open, a **Current cohort** card appears the next time you load XpLoRe. Press **Apply** and the Support chat opens with your application already written — send it, and the desk answers you there. You will also see the decision under **Alerts**.

Contest and leaderboard boards do not exist, so there is nothing to find or rank on. If you were pointed at one of those pages, it has been retired.`
  },
  {
    title: 'Publishing a gliim',
    keys: ['upload', 'post', 'publish', 'gliim', 'gliims', 'bundle', 'book', 'log', 'audiolite', 'media', 'pdf', 'submit', 'content', 'create', 'composer', 'share my work'],
    answer: `To publish a gliim:

1. Open **Publish** — the button at the top right of XpLoRe, next to **Live**.
2. Choose what you are making — a **Book**, a **Log** (a recording: audio or video), or a **Bundle** that mixes text, images, media and documents.
3. Add your files, a title and a description. A document in a bundle can carry its own price in naira — leave it at zero for free.
4. Publish — the gliim goes live the moment you publish it, in XpLoRe and on your portfolio. Use **Save as draft** if you want to keep working on it.`
  },
  {
    title: 'Ping, messages and voice notes',
    keys: ['ping', 'message', 'messages', 'chat', 'dm', 'voice note', 'voice', 'audio message', 'send a photo', 'notification', 'sound', 'unread'],
    answer: `**Ping** is your private inbox with other Gliimaits.

- Send text, photos, video, documents and **voice notes** — tap the microphone, talk, and press send.
- The list shows the newest message from each person under their name, so you can see what came in before you open it.
- A new message plays a short chime and raises a desktop notification, unless the chat is already open.
- Anything from a Team Gliimu admin does **not** appear in your chats — the desk answers you in the **Support** chat, the first item in the same list, so your conversations with other members stay clean.

Unread counts show as a dot on **Ping** in your account menu and on your avatar, and clear the moment you open the chat.`
  },
  {
    title: 'Going live',
    keys: ['live', 'stream', 'go live', 'session', 'sessions', 'webcam', 'screen share', 'broadcast', 'video call', '1-on-1', 'host'],
    answer: `Live is one broadcast with a host and as many viewers as turn up, reached from the **Live** action at the top right of **XpLoRe**.

- The Live page lists the sessions that are running. **Join Session** puts you into one; **Host Session** starts your own.
- Your own session appears with **Go on air** — nobody can join until you press it, because the room only exists once you are broadcasting.
- **Anyone can host.** Neither a plan nor GP is required.
- In the studio you can turn your camera on or off, and on a bigger screen share your screen instead (on a phone that button switches between the front and back camera).
- Sessions carry video, audio and a chat forum, and anyone in the room can share a file into that forum.
- The host can mute or remove a viewer. A viewer who is removed cannot get back in.
- Every viewer pays the platform's per-minute rate — the same price that applies to reading a gliim — straight from their wallet, and a wallet that cannot cover one minute will not open the session. No plan watches for free.
- Going on air costs the host a one-token fee, taken once per session to keep throwaway rooms out. The host is not charged by the minute for their own room, and earns the creator rate for the minutes their viewers actually paid for.
- Supporting costs **10 tokens** per tap, and the host keeps 70% of it.

Pick a session on the Live page to join it, or host your own.`
  },
  {
    title: 'Your profile and portfolio',
    keys: ['profile', 'portfolio', 'qr', 'print', 'cv', 'resume', 'projects', 'my page', 'avatar', 'bio'],
    answer: `Open **You** — your avatar at the bottom of the rail, or the **You** tab on the bottom bar on a phone — and tap **Profile**.

It is built around a banner image and shows:
- Your name, your bio and — if you have one — the verified tick
- Your **GP** total, and your **Gliims**, which are the gliims you have published
- A **QR code** that links straight to the page, and a share link you can copy

Your own page also shows your subscriber count and lets you filter between **All Gliims**, **Drafts** and **Saved Gliims**. Nobody else sees those numbers. Change your banner, name and bio under **Settings**.`
  },
  {
    title: 'Support and reporting',
    keys: ['support', 'contact', 'help desk', 'report', 'issue', 'bug', 'problem', 'reach', 'complaint', 'not working', 'broken', 'error', 'talk to a human', 'real person', 'admin'],
    answer: `Support is one chat, and it is the first item in your **Ping** list. The composer there has two chips: **Gliim P.A.** and **Gliimu team**.

- **Ask me first.** With **Gliim P.A.** selected, type your question and I answer instantly from what I know about Gliimu and about media work.
- **Reach a person.** Tap the **Gliimu team** chip and your message goes to the Team Gliimu desk instead of me. Every admin on the desk can read it and reply, you can attach a file or screenshot there, and you get a sound plus a desktop notification when someone answers.
- **If my answer misses**, press the thumbs-down on it. That hands the question to a human straight away, and I go quiet while they pick it up.
- **I come back automatically.** After a person replies, I stay out of the way for five minutes and then take the thread over again on my own — nobody has to switch anything back on.

For content problems use the **report** option on the gliim or profile itself and pick a reason; the CRM team reviews every report. For anything about money, check your **Billing** history first, then write to the desk.`
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
    keys: ['pitch', 'client', 'clients', 'proposal', 'brief', 'contract', 'freelance', 'sell', 'outreach'],
    answer: `A short pitch that lands:

> Hi [name] — I am a Full Stack Media Architect. I help [type of business] turn one idea into a full set of assets: video, stills, copy and a distribution plan. For [their goal], I would deliver [1-2 concrete outputs] by [timeframe]. Happy to send a quick sample or a 15-minute plan — which works for you?

Keep it under five sentences, name their goal, promise a concrete deliverable and end with one easy question. Follow up once after three days.`
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

Work through them in order, then publish each result with **Publish** at the top right of XpLoRe. Building in public is how the lessons turn into GP, a portfolio and paid work — other people reading, liking and commenting on your gliims is what pays you GP. Cohorts are where you practise alongside other members: press **Apply** on the **Current cohort** card when it appears on XpLoRe.`
  }
];

const GREETING_KEYS = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy', 'yo', 'sup'];

const FALLBACK = `I am not sure I caught that, but I can definitely help.

Try asking about:
- **GP**, how you earn them and what they are for
- **Wallet, top-ups and transfers**
- **Plans and pricing**
- **Cohorts and referrals** — applying for a cohort, and Refer & earn
- **Publishing a gliim** (books, logs, bundles, documents)
- **Going live** or your **portfolio**
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
    return `Hey, I am **Gliim P.A.**, your helper on Gliimu. Ask me anything about Gliimu — how to get around the dashboard, **GP**, the **wallet**, **plans**, **publishing**, **going live** or **media craft**. What would you like to do?`;
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
