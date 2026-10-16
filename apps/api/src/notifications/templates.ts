// Notification texts in English and Amharic (NFR-USE-01). Placeholders use {name}.
// Amharic texts should be reviewed by a native editor before launch.
type T = { en: { title: string; body: string }; am: { title: string; body: string } };

export const TEMPLATES: Record<string, T> = {
  OTP: {
    en: { title: 'Your code', body: 'Your ToD code is {code}. It expires in {minutes} minutes. Do not share it.' },
    am: { title: 'የእርስዎ ኮድ', body: 'የToD ኮድዎ {code} ነው። በ{minutes} ደቂቃ ውስጥ ጊዜው ያልፋል። ለማንም አያጋሩ።' },
  },
  ACCOUNT_LOCKED: {
    en: { title: 'Account locked', body: 'Too many failed sign-ins. Your account is locked for {minutes} minutes. If this was not you, contact support.' },
    am: { title: 'መለያ ተቆልፏል', body: 'ብዙ ያልተሳኩ የመግቢያ ሙከራዎች ነበሩ። መለያዎ ለ{minutes} ደቂቃ ተቆልፏል። እርስዎ ካልሆኑ ድጋፍን ያግኙ።' },
  },
  INVITATION: {
    en: { title: 'New assignment invitation', body: 'You are invited to "{title}". Accept at {price} or send a proposal by {due}.' },
    am: { title: 'አዲስ የሥራ ግብዣ', body: 'ለ"{title}" ተጋብዘዋል። በ{price} ይቀበሉ ወይም እስከ {due} ድረስ ሀሳብ ያቅርቡ።' },
  },
  PROPOSAL_RECEIVED: {
    en: { title: 'New proposal', body: '{talent} sent a proposal of {price} for "{title}".' },
    am: { title: 'አዲስ ሀሳብ', body: '{talent} ለ"{title}" የ{price} ሀሳብ ልኳል።' },
  },
  PROPOSAL_ACCEPTED: {
    en: { title: 'Proposal accepted', body: 'Your proposal for "{title}" was accepted. Do not start until the client has paid into escrow; we will tell you.' },
    am: { title: 'ሀሳብዎ ተቀባይነት አግኝቷል', body: 'ለ"{title}" ያቀረቡት ሀሳብ ተቀባይነት አግኝቷል። ደንበኛው ወደ ኤስክሮ እስኪከፍል ድረስ ሥራ አይጀምሩ፤ እናሳውቅዎታለን።' },
  },
  PROPOSAL_DECLINED: {
    en: { title: 'Proposal not selected', body: 'The client chose another proposal for "{title}". Thank you for responding.' },
    am: { title: 'ሀሳብዎ አልተመረጠም', body: 'ደንበኛው ለ"{title}" ሌላ ሀሳብ መርጧል። ምላሽ ስለሰጡ እናመሰግናለን።' },
  },
  PAYMENT_INSTRUCTION: {
    en: { title: 'Pay into escrow', body: 'Pay {amount} for "{title}" using reference {reference}. Your money is held until you accept the work.' },
    am: { title: 'ወደ ኤስክሮ ይክፈሉ', body: 'ለ"{title}" {amount} በመለያ ቁጥር {reference} ይክፈሉ። ሥራውን እስኪቀበሉ ድረስ ገንዘብዎ ተይዞ ይቆያል።' },
  },
  FUNDED_START: {
    en: { title: 'Start work', body: 'Payment for "{title}" is secured in escrow. You can start now. Deadline: {deadline}.' },
    am: { title: 'ሥራ ይጀምሩ', body: 'የ"{title}" ክፍያ በኤስክሮ ተጠብቋል። አሁን መጀመር ይችላሉ። የመጨረሻ ቀን፦ {deadline}።' },
  },
  FUNDED_CLIENT: {
    en: { title: 'Payment received', body: 'Your payment for "{title}" is held in escrow. The talent has been told to start.' },
    am: { title: 'ክፍያ ደርሷል', body: 'ለ"{title}" የከፈሉት በኤስክሮ ተይዟል። ባለሙያው እንዲጀምር ተነግሮታል።' },
  },
  DELIVERED: {
    en: { title: 'Work delivered', body: '"{title}" has been delivered. Review it by {due}: accept, ask for a revision or raise a dispute. If you do nothing, it is accepted automatically.' },
    am: { title: 'ሥራ ደርሷል', body: '"{title}" ደርሷል። እስከ {due} ድረስ ይገምግሙ፦ ይቀበሉ፣ ማሻሻያ ይጠይቁ ወይም ቅሬታ ያቅርቡ። ምንም ካላደረጉ በራሱ ተቀባይነት ያገኛል።' },
  },
  REVIEW_REMINDER: {
    en: { title: 'Review reminder', body: 'Please review "{title}" by {due}. After that it is accepted automatically and the talent is paid.' },
    am: { title: 'የግምገማ ማስታወሻ', body: 'እባክዎ "{title}"ን እስከ {due} ድረስ ይገምግሙ። ከዚያ በኋላ በራሱ ተቀባይነት ያገኛል፤ ባለሙያውም ይከፈለዋል።' },
  },
  REVISION_REQUESTED: {
    en: { title: 'Revision requested', body: 'The client asked for a revision on "{title}": {reason}' },
    am: { title: 'ማሻሻያ ተጠይቋል', body: 'ደንበኛው በ"{title}" ላይ ማሻሻያ ጠይቋል፦ {reason}' },
  },
  ACCEPTED_TALENT: {
    en: { title: 'Work accepted', body: '"{title}" was accepted. {net} will be paid to your account after {commission} commission.' },
    am: { title: 'ሥራዎ ተቀባይነት አግኝቷል', body: '"{title}" ተቀባይነት አግኝቷል። {commission} ኮሚሽን ተቀንሶ {net} ወደ ሂሳብዎ ይከፈላል።' },
  },
  RECEIPT: {
    en: { title: 'Receipt', body: 'Receipt {ref} for "{title}": paid {gross}, commission {commission}, talent received {net}.' },
    am: { title: 'ደረሰኝ', body: 'ለ"{title}" ደረሰኝ {ref}፦ የተከፈለ {gross}፣ ኮሚሽን {commission}፣ ባለሙያው የተቀበለው {net}።' },
  },
  RATE_PROMPT: {
    en: { title: 'Rate your experience', body: 'How did "{title}" go? Your rating is published once both sides have rated, or after 7 days.' },
    am: { title: 'ተሞክሮዎን ይገምግሙ', body: '"{title}" እንዴት ነበር? ሁለቱም ወገኖች ከገመገሙ በኋላ ወይም ከ7 ቀን በኋላ ግምገማዎ ይታተማል።' },
  },
  DISPUTE_OPENED: {
    en: { title: 'Dispute opened', body: 'A dispute was opened on "{title}" ({ref}). The amount in question is held until the case is closed.' },
    am: { title: 'ቅሬታ ቀርቧል', body: 'በ"{title}" ላይ ቅሬታ ቀርቧል ({ref})። የተከራከረው ገንዘብ ጉዳዩ እስኪዘጋ ድረስ ተይዞ ይቆያል።' },
  },
  DISPUTE_CLOSED: {
    en: { title: 'Dispute closed', body: 'Case {ref} on "{title}" is closed. Outcome: {outcome}.' },
    am: { title: 'ቅሬታው ተዘግቷል', body: 'በ"{title}" ላይ ያለው ጉዳይ {ref} ተዘግቷል። ውሳኔ፦ {outcome}።' },
  },
  DEADLINE_SOON: {
    en: { title: 'Deadline approaching', body: '"{title}" is due on {deadline}.' },
    am: { title: 'የመጨረሻ ቀን እየቀረበ ነው', body: '"{title}" የሚጠናቀቅበት ቀን {deadline} ነው።' },
  },
  DEADLINE_MISSED: {
    en: { title: 'Deadline missed', body: '"{title}" was due on {deadline} and has not been delivered. Support has been told.' },
    am: { title: 'የመጨረሻ ቀን አልፏል', body: '"{title}" እስከ {deadline} መድረስ ነበረበት ግን አልደረሰም። ድጋፍ ሰጪ ተነግሯል።' },
  },
  CANCELLED: {
    en: { title: 'Assignment cancelled', body: '"{title}" was cancelled. {detail}' },
    am: { title: 'ሥራው ተሰርዟል', body: '"{title}" ተሰርዟል። {detail}' },
  },
  TICKET_UPDATE: {
    en: { title: 'Support update', body: 'There is an update on your request {ref}.' },
    am: { title: 'የድጋፍ መረጃ', body: 'በጥያቄዎ {ref} ላይ አዲስ መረጃ አለ።' },
  },
  CASE_ACKNOWLEDGED: {
    en: { title: 'Report received', body: 'We received your confidential report {ref}. A designated staff member will contact you.' },
    am: { title: 'ሪፖርትዎ ደርሷል', body: 'ሚስጥራዊ ሪፖርትዎን {ref} ተቀብለናል። የተመደበ ሠራተኛ ያነጋግርዎታል።' },
  },
  ACCOUNT_SUSPENDED: {
    en: { title: 'Account suspended', body: 'Your account has been suspended. Reason: {reason}. Contact support to appeal.' },
    am: { title: 'መለያ ታግዷል', body: 'መለያዎ ታግዷል። ምክንያት፦ {reason}። ይግባኝ ለማለት ድጋፍን ያግኙ።' },
  },
  ACCOUNT_REINSTATED: {
    en: { title: 'Account reinstated', body: 'Your account is active again.' },
    am: { title: 'መለያ ተመልሷል', body: 'መለያዎ እንደገና ንቁ ሆኗል።' },
  },
  STAFF_ALERT: {
    en: { title: '{subject}', body: '{detail}' },
    am: { title: '{subject}', body: '{detail}' },
  },
  NEW_MESSAGE: {
    en: { title: 'New message', body: 'New message about "{title}".' },
    am: { title: 'አዲስ መልእክት', body: 'ስለ"{title}" አዲስ መልእክት አለ።' },
  },
  PROFILE_PUBLISHED: {
    en: { title: 'Profile published', body: 'Your profile is now visible to clients. Keep your availability up to date.' },
    am: { title: 'መገለጫዎ ታትሟል', body: 'መገለጫዎ አሁን ለደንበኞች ይታያል። የሚገኙበትን ጊዜ ወቅታዊ ያድርጉ።' },
  },
  ANNOUNCEMENT: {
    en: { title: '{subject}', body: '{detail}' },
    am: { title: '{subject}', body: '{detail}' },
  },
};

export function render(type: string, lang: 'en' | 'am', vars: Record<string, string | number>) {
  const t = TEMPLATES[type]?.[lang] ?? TEMPLATES[type]?.en;
  if (!t) return { title: type, body: '' };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { title: fill(t.title), body: fill(t.body) };
}
