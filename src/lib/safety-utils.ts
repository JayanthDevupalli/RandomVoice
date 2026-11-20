/**
 * YapClub Casual Safety & Precaution Utilities
 *
 * Keeps the community chill, light, and drama-free while silently catching
 * accidental personal-info leaks (phone numbers, UPI IDs, OTPs, emails) and
 * blocking known IP-grabber / phishing links.
 */

export const LANDING_CHILL_LINE =
  "Here for good vibes, not life stories. Keep it light, stay anonymous, and leave personal stuff offline.";

export const DM_CHILL_BANNER_COPY = {
  title: "Keep it easygoing",
  body: "Take your time before sharing personal socials, numbers, or real-life details. You can mute or block anytime — zero awkwardness.",
};

export const VOICE_ROOM_VIBE_TIPS: string[] = [
  "Good vibes only — keep it casual, keep it kind, and keep your personal details yours.",
  "Strangers are fun to yap with — no rush to drop your phone number, Insta, or real name.",
  "It's just a hangout, not a courtroom. If a room feels off, mute, hop rooms, or tap report.",
  "Late-night convos hit different — still, never share OTPs, passwords, or money with anyone here.",
  "Heads up: YapClub doesn't record rooms, but anyone online can screen-record. Stay smart, stay chill.",
  "Keep internet chats light — enjoy the banter and don't let random drama get personal.",
];

/**
 * Known IP-grabber, credential-phishing, and link-tracking abuse domains.
 * Blocked automatically across room chat and DMs to protect user IP privacy.
 */
const BLOCKED_TRACKER_DOMAINS = [
  "grabify.link",
  "iplogger.org",
  "iplogger.com",
  "iplogger.ru",
  "2no.co",
  "yip.su",
  "blasze.tk",
  "blasze.com",
  "ps3cfw.com",
  "bmwforum.co",
  "leancoding.co",
  "spottyfly.com",
  "stopify.co",
  "lovebird.guru",
  "trulove.guru",
  "dateing.club",
  "otherhalf.life",
  "shrekis.life",
  "headshot.monster",
  "gaming-at-my.best",
  "progaming.monster",
  "yourmy.monster",
  "imageshare.best",
  "screenshot.best",
  "gamingfun.me",
  "catsnthing.com",
  "mypic.icu",
  "curiouscat.club",
  "joinmy.site",
  "fortnitechat.site",
  "fortnight.space",
  "freegiftcards.co",
  "saper.ru",
];

const URL_REGEX = /(https?:\/\/[^\s<>"'`]+)/gi;

export interface SafetyDetection {
  kind: "blocked_link" | "otp" | "upi" | "phone" | "email" | "card";
  severity: "block" | "nudge";
  message: string;
}

export function extractHostname(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isBlockedTrackerUrl(rawUrl: string): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return BLOCKED_TRACKER_DOMAINS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`)
  );
}

export function hasBlockedMaliciousLink(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (
    BLOCKED_TRACKER_DOMAINS.some((domain) => {
      const escaped = domain.replace(/\./g, "\\.");
      return new RegExp(`(?:^|[\\s/(@.])${escaped}(?:$|[\\s/?#)])`, "i").test(lower);
    })
  ) {
    return true;
  }

  const matches = text.match(URL_REGEX) || [];
  return matches.some((url) => isBlockedTrackerUrl(url));
}

/**
 * Inspects outgoing chat text for accidental personal info (PII) or blocked IP-grabber links.
 * Returns null when text looks totally fine.
 *
 * - `severity: "block"` -> Hard stop (IP-grabber / malicious tracker domains).
 * - `severity: "nudge"` -> Gentle, friend-like heads-up (user can still dismiss / send anyway).
 */
export function detectSafetyConcern(
  text: string,
  context: "room" | "dm" = "room"
): SafetyDetection | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return null;

  // 1. Hard-block known IP grabbers & phishing trackers
  if (hasBlockedMaliciousLink(trimmed)) {
    return {
      kind: "blocked_link",
      severity: "block",
      message:
        "That link looks like an IP tracker or unsafe redirect and can't be sent on YapClub.",
    };
  }

  // Strip normal URLs before checking digits so URLs don't trigger false phone/card matches
  const withoutUrls = trimmed.replace(URL_REGEX, " ");

  // 2. OTP / Verification Code warning
  if (
    /\b(?:otp|verification\s*code|passcode|cvv|mpin)\b/i.test(withoutUrls) &&
    /\b\d{4,8}\b/.test(withoutUrls)
  ) {
    return {
      kind: "otp",
      severity: "nudge",
      message:
        "Heads up — never share OTPs, PINs, or verification codes with anyone here (even if they claim to be staff).",
    };
  }

  // 3. UPI ID detection (India & popular UPI handles)
  if (
    /\b[a-zA-Z0-9._-]{2,}@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|ibl|axl|paytm|upi|apl|fbl|icici|hdfcbank|sbi|kotak|indus|airtel|jio|freecharge|slice|cred|naviaxis)\b/i.test(
      withoutUrls
    )
  ) {
    return {
      kind: "upi",
      severity: "nudge",
      message:
        context === "room"
          ? "Looks like a UPI ID — better to keep money & payments out of public voice chats."
          : "Looks like a UPI ID — just be careful sending or requesting money with people you met online.",
    };
  }

  // 4. Email address detection
  if (/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/.test(withoutUrls)) {
    return {
      kind: "email",
      severity: "nudge",
      message:
        context === "room"
          ? "Looks like an email address — sure you want to drop that in a public room?"
          : "Looks like an email — no rush sharing personal details before you really know someone.",
    };
  }

  // 5. Phone number detection (10-digit Indian mobile or +XX international format)
  const phoneRegex =
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3,4}\)[\s.-]?|\b)[6-9]\d{4}[\s.-]?\d{5}\b|\+\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
  if (phoneRegex.test(withoutUrls)) {
    return {
      kind: "phone",
      severity: "nudge",
      message:
        context === "room"
          ? "Looks like a phone number — sure you want to drop that in a room? Keep it chill & anonymous!"
          : "Looks like a phone number — totally your call, just looking out so you don't overshare too soon.",
    };
  }

  // 6. Bank / Debit / Credit card-like 13–16 digit sequence
  const cardLike = withoutUrls.replace(/[\s-]/g, "");
  if (/\b(?:\d{13,16})\b/.test(cardLike) && !/\b\d{17,}\b/.test(cardLike)) {
    return {
      kind: "card",
      severity: "nudge",
      message:
        "That looks like a card or account number — please don't share financial info in chat.",
    };
  }

  return null;
}

export interface TextSegment {
  type: "text" | "link";
  value: string;
  hostname?: string;
  isBlocked?: boolean;
}

/**
 * Splits a message into plain text and URL segments so links can be rendered
 * with a friendly external-link confirmation prompt.
 */
export function splitTextWithLinks(text: string): TextSegment[] {
  if (!text) return [];
  const parts = text.split(URL_REGEX);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      if (/^https?:\/\//i.test(part)) {
        const hostname = extractHostname(part) || part;
        return {
          type: "link" as const,
          value: part,
          hostname,
          isBlocked: isBlockedTrackerUrl(part),
        };
      }
      return { type: "text" as const, value: part };
    });
}
