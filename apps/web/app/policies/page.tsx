'use client';
import { Card, PageTitle } from '@/components/ui';
import { useLang } from '@/lib/i18n';

// FR-SUP-06. Draft summaries: the consortium supplies the approved texts and
// their version numbers (parameter POLICY_VERSIONS).
export default function Policies() {
  const { t } = useLang();
  const sections = [
    {
      id: 'community',
      title: t('Community standards', 'የማኅበረሰብ መመሪያዎች'),
      points: [
        t('Treat everyone with respect. Harassment, discrimination and exploitation are not allowed.', 'ሁሉንም በአክብሮት ይያዙ። ትንኮሳ፣ መድልዎ እና ብዝበዛ አይፈቀዱም።'),
        t('Keep all messages and payments on the platform. Off-platform deals are not protected and are not accepted as evidence in a dispute.', 'ሁሉንም መልዕክቶችና ክፍያዎች በመድረኩ ላይ ያድርጉ። ከመድረኩ ውጭ የሚደረጉ ስምምነቶች ጥበቃ የላቸውም፤ በክርክርም እንደ ማስረጃ አይወሰዱም።'),
        t('Only deliver work that is your own, and respect the client’s data and passwords.', 'የራስዎን ሥራ ብቻ ያቅርቡ፤ የደንበኛውን መረጃና የይለፍ ቃሎች ያክብሩ።'),
        t('Use “Report a concern” at the bottom of any page to tell designated staff in confidence.', 'በሚስጥር ለተመደቡ ሠራተኞች ለማሳወቅ በማንኛውም ገጽ ግርጌ “ስጋት ሪፖርት ያድርጉ” ይጠቀሙ።'),
      ],
    },
    {
      id: 'pricing',
      title: t('Prices and fees', 'ዋጋዎችና ክፍያዎች'),
      points: [
        t('Each package has a standard price and a price band. Talents can accept the standard price or propose a price within the band.', 'እያንዳንዱ ጥቅል መደበኛ ዋጋ እና የዋጋ ክልል አለው። ባለሙያዎች መደበኛውን ዋጋ መቀበል ወይም በክልሉ ውስጥ ዋጋ ማቅረብ ይችላሉ።'),
        t('The client pays the agreed price into an escrow account held by the partner bank. The platform never holds the money.', 'ደንበኛው የተስማሙበትን ዋጋ በአጋር ባንክ ወደሚያዝ የኤስክሮ ሂሳብ ይከፍላል። መድረኩ ገንዘቡን አይይዝም።'),
        t('When the work is accepted, the talent is paid less a commission of 5%. Women verified through Fayda and persons with a confirmed disability pay 1%.', 'ሥራው ሲቀበል ባለሙያው 5% ኮሚሽን ተቀንሶ ይከፈለዋል። በፋይዳ የተረጋገጡ ሴቶች እና አካል ጉዳታቸው የተረጋገጠ ሰዎች 1% ይከፍላሉ።'),
        t('Talents pay no registration or membership fee.', 'ባለሙያዎች የምዝገባ ወይም የአባልነት ክፍያ አይከፍሉም።'),
      ],
    },
    {
      id: 'disputes',
      title: t('If something goes wrong', 'ችግር ቢፈጠር'),
      points: [
        t('The client has 3 working days after delivery to accept, ask for a revision, or open a dispute. If they do nothing, the work is accepted and the talent is paid.', 'ደንበኛው ሥራው ከቀረበ በኋላ ለመቀበል፣ ማሻሻያ ለመጠየቅ ወይም ክርክር ለመክፈት 3 የሥራ ቀናት አለው። ምንም ካላደረገ ሥራው ተቀባይነት ያገኛል፤ ባለሙያውም ይከፈለዋል።'),
        t('When a dispute is opened the money is frozen. A case officer reviews the messages and files, helps you agree, and if needed decides.', 'ክርክር ሲከፈት ገንዘቡ ይታገዳል። የጉዳይ ኃላፊ መልዕክቶቹንና ፋይሎቹን ይገመግማል፣ እንድትስማሙ ይረዳል፣ ካስፈለገም ይወስናል።'),
        t('Any payment decided in a dispute is approved by a second staff member before it is made.', 'በክርክር የተወሰነ ማንኛውም ክፍያ ከመፈጸሙ በፊት በሁለተኛ ሠራተኛ ይጸድቃል።'),
        t('Either side can appeal once within 5 working days. The appeal decision is final.', 'ማንኛውም ወገን በ5 የሥራ ቀናት ውስጥ አንድ ጊዜ ይግባኝ ማለት ይችላል። የይግባኙ ውሳኔ የመጨረሻ ነው።'),
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle sub={t('Summary. The full approved texts are published by the ToD consortium.', 'ማጠቃለያ። ሙሉ የጸደቁ ጽሑፎች በToD ጥምረት ይታተማሉ።')}>{t('How ToD works', 'ToD እንዴት እንደሚሠራ')}</PageTitle>
      {sections.map((s) => (
        <Card key={s.id} title={s.title}>
          <ul id={s.id} className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {s.points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
