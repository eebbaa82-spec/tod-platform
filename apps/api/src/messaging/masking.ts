// Contact details are hidden in messages until the assignment is funded
// (FR-MAT-09), so parties do not move the deal off the platform.
const PATTERNS: RegExp[] = [
  /(?:\+?251|0)[\s-]?[79](?:[\s-]?\d){8}/g, // Ethiopian mobile numbers
  /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, // other 10-digit numbers
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // email addresses
  /(?:^|\s)@[A-Za-z0-9_]{4,}/g, // Telegram handles
  /\b(?:t\.me|wa\.me|telegram\.me)\/\S+/gi, // chat links
];

export function maskContacts(text: string): { text: string; masked: boolean } {
  let masked = false;
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p, (m) => {
      masked = true;
      const lead = m.startsWith(' ') ? ' ' : '';
      return `${lead}[hidden until funded]`;
    });
  }
  return { text: out, masked };
}
