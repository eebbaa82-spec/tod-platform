// Initial catalogue (FR-CAT-02). Prices are in ETB and are starting
// placeholders for the consortium to set from the market assessment;
// administrators change them in the console without a release.
// Amharic text should be reviewed by a native editor before launch.

export const SERVICE_AREAS = [
  { code: 'SOCIAL', nameEn: 'Social media management', nameAm: 'የማኅበራዊ ሚዲያ አስተዳደር' },
  { code: 'DIGITAL_MKT', nameEn: 'Digital marketing', nameAm: 'ዲጂታል ግብይት' },
  { code: 'DESIGN', nameEn: 'Graphic design', nameAm: 'ግራፊክ ዲዛይን' },
  { code: 'BOOKKEEPING', nameEn: 'Bookkeeping', nameAm: 'የሂሳብ መዝገብ አያያዝ' },
  { code: 'DATA_ENTRY', nameEn: 'Data entry', nameAm: 'የመረጃ ማስገባት' },
  { code: 'INVENTORY', nameEn: 'Inventory digitisation', nameAm: 'የዕቃ ክምችት ዲጂታላይዜሽን' },
  { code: 'CUSTOMER_DB', nameEn: 'Customer databases', nameAm: 'የደንበኛ መረጃ ቋት' },
  { code: 'ECOMMERCE', nameEn: 'E-commerce support', nameAm: 'የኢ-ኮሜርስ ድጋፍ' },
  { code: 'BUS_ADMIN', nameEn: 'Business administration', nameAm: 'የንግድ አስተዳደር' },
  { code: 'WEB_IT', nameEn: 'Web and IT support', nameAm: 'የድረ-ገጽ እና የአይቲ ድጋፍ' },
];

type P = {
  code: string;
  area: string;
  titleEn: string;
  titleAm: string;
  scopeEn: string;
  scopeAm: string;
  exclusionsEn: string;
  exclusionsAm: string;
  deliverableEn: string;
  deliverableAm: string;
  turnaroundDays: number;
  revisionLimit: number;
  checklistEn: string[];
  checklistAm: string[];
  minTier: 'ENTRY' | 'INTERMEDIATE' | 'EXPERT';
  etb: [number, number, number]; // min, standard, max
};

export const PACKAGES: P[] = [
  {
    code: 'SOC-SETUP', area: 'SOCIAL',
    titleEn: 'Business page set-up', titleAm: 'የንግድ ገጽ ማዘጋጀት',
    scopeEn: 'Create or tidy Facebook, Instagram and Telegram pages for the business with profile, cover, description, contact details and opening hours.',
    scopeAm: 'ለንግዱ የፌስቡክ፣ የኢንስታግራም እና የቴሌግራም ገጾችን ከመገለጫ ፎቶ፣ ሽፋን፣ መግለጫ፣ የመገኛ አድራሻ እና የሥራ ሰዓት ጋር ማዘጋጀት ወይም ማስተካከል።',
    exclusionsEn: 'Paid advertising, regular posting and photography.', exclusionsAm: 'የሚከፈልበት ማስታወቂያ፣ መደበኛ ልጥፍ እና ፎቶግራፍ አይጨምርም።',
    deliverableEn: 'Three live pages and a one-page handover with log-in details kept by the client.', deliverableAm: 'ሦስት የሚሠሩ ገጾች እና የመግቢያ መረጃ ያለው የአንድ ገጽ ርክክብ ሰነድ።',
    turnaroundDays: 3, revisionLimit: 2, minTier: 'ENTRY', etb: [1500, 2500, 4000],
    checklistEn: ['Pages are live and public', 'Business name, phone and location are correct', 'The client holds the passwords'],
    checklistAm: ['ገጾቹ ለሕዝብ ክፍት ናቸው', 'የንግድ ስም፣ ስልክ እና አድራሻ ትክክል ነው', 'የይለፍ ቃሎቹ በደንበኛው እጅ ናቸው'],
  },
  {
    code: 'SOC-MONTH', area: 'SOCIAL',
    titleEn: 'Monthly social media management', titleAm: 'ወርሃዊ የማኅበራዊ ሚዲያ አስተዳደር',
    scopeEn: 'Plan and publish 12 posts over four weeks in Amharic and English, reply to comments and messages on working days, and report reach.',
    scopeAm: 'በአራት ሳምንታት ውስጥ 12 ልጥፎችን በአማርኛና በእንግሊዝኛ ማቀድና ማውጣት፣ በሥራ ቀናት ለአስተያየቶችና መልዕክቶች ምላሽ መስጠት እና ተደራሽነትን ሪፖርት ማድረግ።',
    exclusionsEn: 'Advertising budget, video production and influencer fees.', exclusionsAm: 'የማስታወቂያ በጀት፣ የቪዲዮ ዝግጅት እና የኢንፍሉዌንሰር ክፍያ አይጨምርም።',
    deliverableEn: 'Content calendar, 12 published posts and an end-of-month report.', deliverableAm: 'የይዘት መርሐ ግብር፣ 12 የወጡ ልጥፎች እና የወር መጨረሻ ሪፖርት።',
    turnaroundDays: 28, revisionLimit: 2, minTier: 'INTERMEDIATE', etb: [4000, 6000, 10000],
    checklistEn: ['Calendar approved before posting', '12 posts published', 'Report shows reach and messages handled'],
    checklistAm: ['መርሐ ግብሩ ከመለጠፉ በፊት ጸድቋል', '12 ልጥፎች ወጥተዋል', 'ሪፖርቱ ተደራሽነትንና የተስተናገዱ መልዕክቶችን ያሳያል'],
  },
  {
    code: 'MKT-CAMPAIGN', area: 'DIGITAL_MKT',
    titleEn: 'Small ad campaign', titleAm: 'አነስተኛ የማስታወቂያ ዘመቻ',
    scopeEn: 'Set up and run one paid social campaign for up to two weeks with targeting, two ad designs and daily monitoring. The client pays the platform for ads directly.',
    scopeAm: 'ዒላማ፣ ሁለት የማስታወቂያ ዲዛይኖች እና ዕለታዊ ክትትል ያለው አንድ የሚከፈልበት የማኅበራዊ ሚዲያ ዘመቻ እስከ ሁለት ሳምንት ማካሄድ። የማስታወቂያ ክፍያውን ደንበኛው በቀጥታ ይከፍላል።',
    exclusionsEn: 'The advertising spend itself.', exclusionsAm: 'የማስታወቂያው ወጪ ራሱ አይጨምርም።',
    deliverableEn: 'A running campaign and a results summary.', deliverableAm: 'የሚሠራ ዘመቻ እና የውጤት ማጠቃለያ።',
    turnaroundDays: 14, revisionLimit: 1, minTier: 'INTERMEDIATE', etb: [3000, 5000, 8000],
    checklistEn: ['Campaign approved by client before launch', 'Ran for the agreed period', 'Summary shows spend, reach and clicks'],
    checklistAm: ['ዘመቻው ከመጀመሩ በፊት በደንበኛው ጸድቋል', 'በተስማሙበት ጊዜ ተካሂዷል', 'ማጠቃለያው ወጪ፣ ተደራሽነትና ጠቅታዎችን ያሳያል'],
  },
  {
    code: 'DES-LOGO', area: 'DESIGN',
    titleEn: 'Logo and brand basics', titleAm: 'አርማ እና መሠረታዊ የብራንድ መለያ',
    scopeEn: 'Three logo concepts, one refined into final files, with colours and fonts on a one-page brand sheet.',
    scopeAm: 'ሦስት የአርማ ሐሳቦች፣ አንዱ ተመርጦ የሚጠናቀቅ፣ ቀለሞችና ፊደላት ያሉት የአንድ ገጽ የብራንድ ሉህ።',
    exclusionsEn: 'Trademark registration and printing.', exclusionsAm: 'የንግድ ምልክት ምዝገባ እና ሕትመት አይጨምርም።',
    deliverableEn: 'Logo in PNG, SVG and PDF, and the brand sheet.', deliverableAm: 'አርማ በPNG፣ SVG እና PDF እንዲሁም የብራንድ ሉህ።',
    turnaroundDays: 5, revisionLimit: 2, minTier: 'ENTRY', etb: [2000, 3500, 6000],
    checklistEn: ['Three concepts were shown', 'Final files in all three formats', 'Brand sheet lists colours and fonts'],
    checklistAm: ['ሦስት ሐሳቦች ቀርበዋል', 'የመጨረሻ ፋይሎች በሦስቱም ቅርጸቶች', 'የብራንድ ሉሁ ቀለሞችንና ፊደላትን ይዘረዝራል'],
  },
  {
    code: 'DES-PRINT', area: 'DESIGN',
    titleEn: 'Flyer, menu or banner design', titleAm: 'የበራሪ ወረቀት፣ ሜኑ ወይም ባነር ዲዛይን',
    scopeEn: 'One print-ready design in Amharic and English from the client’s text and photos.',
    scopeAm: 'ከደንበኛው ጽሑፍና ፎቶዎች ለሕትመት ዝግጁ የሆነ አንድ ዲዛይን በአማርኛና በእንግሊዝኛ።',
    exclusionsEn: 'Printing and photography.', exclusionsAm: 'ሕትመት እና ፎቶግራፍ አይጨምርም።',
    deliverableEn: 'Print-ready PDF and a social media version.', deliverableAm: 'ለሕትመት ዝግጁ PDF እና የማኅበራዊ ሚዲያ ቅጂ።',
    turnaroundDays: 3, revisionLimit: 2, minTier: 'ENTRY', etb: [800, 1500, 3000],
    checklistEn: ['Text matches what the client gave', 'Print-ready PDF at the agreed size', 'Social media version included'],
    checklistAm: ['ጽሑፉ ደንበኛው ከሰጠው ጋር ይመሳሰላል', 'በተስማሙበት መጠን ለሕትመት ዝግጁ PDF', 'የማኅበራዊ ሚዲያ ቅጂ ተካትቷል'],
  },
  {
    code: 'BK-MONTH', area: 'BOOKKEEPING',
    titleEn: 'Monthly bookkeeping', titleAm: 'ወርሃዊ የሂሳብ መዝገብ',
    scopeEn: 'Record up to 150 sales and expense transactions for one month from receipts and statements, and reconcile one bank account.',
    scopeAm: 'ከደረሰኞችና መግለጫዎች ለአንድ ወር እስከ 150 የሽያጭና የወጪ ግብይቶችን መመዝገብ እና አንድ የባንክ ሂሳብ ማስታረቅ።',
    exclusionsEn: 'Tax filing, audit and payroll.', exclusionsAm: 'የግብር ማስታወቅ፣ ኦዲት እና የደመወዝ ክፍያ አይጨምርም።',
    deliverableEn: 'Updated ledger, bank reconciliation and a simple income statement.', deliverableAm: 'የተሻሻለ መዝገብ፣ የባንክ ማስታረቂያ እና ቀላል የገቢ መግለጫ።',
    turnaroundDays: 7, revisionLimit: 1, minTier: 'INTERMEDIATE', etb: [2500, 4000, 7000],
    checklistEn: ['All transactions supplied are recorded', 'Bank balance agrees with the statement', 'Income statement delivered'],
    checklistAm: ['የተሰጡት ሁሉም ግብይቶች ተመዝግበዋል', 'የባንክ ቀሪ ሂሳብ ከመግለጫው ጋር ይስማማል', 'የገቢ መግለጫ ቀርቧል'],
  },
  {
    code: 'DE-BATCH', area: 'DATA_ENTRY',
    titleEn: 'Data entry batch', titleAm: 'የመረጃ ማስገቢያ ስብስብ',
    scopeEn: 'Type up to 500 records from paper or images into a spreadsheet using the client’s columns, with a second check of 10% of rows.',
    scopeAm: 'ከወረቀት ወይም ከምስል እስከ 500 መዝገቦችን በደንበኛው ዓምዶች ወደ ስፕሬድሺት ማስገባት፣ 10% ረድፎችን በድጋሚ መፈተሽ።',
    exclusionsEn: 'Data analysis and collection of new data.', exclusionsAm: 'የመረጃ ትንተና እና አዲስ መረጃ መሰብሰብ አይጨምርም።',
    deliverableEn: 'A clean spreadsheet and a short note of unreadable entries.', deliverableAm: 'ንጹሕ ስፕሬድሺት እና የማይነበቡ መዝገቦች አጭር ማስታወሻ።',
    turnaroundDays: 4, revisionLimit: 1, minTier: 'ENTRY', etb: [1000, 1800, 3000],
    checklistEn: ['Row count matches the source', 'Columns follow the client’s template', 'Unreadable entries are listed'],
    checklistAm: ['የረድፎች ብዛት ከምንጩ ጋር ይስማማል', 'ዓምዶቹ የደንበኛውን ቅጽ ይከተላሉ', 'የማይነበቡ መዝገቦች ተዘርዝረዋል'],
  },
  {
    code: 'INV-DIGITISE', area: 'INVENTORY',
    titleEn: 'Stock list digitisation', titleAm: 'የዕቃ ዝርዝር ዲጂታላይዜሽን',
    scopeEn: 'Count and record up to 300 stock items on site or from records into a spreadsheet or simple stock app, with reorder levels.',
    scopeAm: 'እስከ 300 የዕቃ ዓይነቶችን በቦታው ወይም ከመዝገቦች ቆጥሮ ወደ ስፕሬድሺት ወይም ቀላል የክምችት መተግበሪያ ማስገባት፣ የድጋሚ ማዘዣ ደረጃዎችን ጨምሮ።',
    exclusionsEn: 'Purchase of software or hardware.', exclusionsAm: 'የሶፍትዌር ወይም የሃርድዌር ግዢ አይጨምርም።',
    deliverableEn: 'Digital stock list with quantities, prices and reorder levels, and a 30-minute handover.', deliverableAm: 'ብዛት፣ ዋጋ እና የድጋሚ ማዘዣ ደረጃ ያለው ዲጂታል የዕቃ ዝርዝር እና የ30 ደቂቃ ርክክብ።',
    turnaroundDays: 5, revisionLimit: 1, minTier: 'ENTRY', etb: [1500, 2500, 4500],
    checklistEn: ['Every item has a quantity and price', 'Reorder levels set', 'Client shown how to update the list'],
    checklistAm: ['እያንዳንዱ ዕቃ ብዛትና ዋጋ አለው', 'የድጋሚ ማዘዣ ደረጃዎች ተቀምጠዋል', 'ደንበኛው ዝርዝሩን እንዴት እንደሚያሻሽል ታይቷል'],
  },
  {
    code: 'CDB-BUILD', area: 'CUSTOMER_DB',
    titleEn: 'Customer list set-up', titleAm: 'የደንበኛ ዝርዝር ማዘጋጀት',
    scopeEn: 'Build a customer database of up to 400 contacts from the client’s records, remove duplicates and set up groups for messaging.',
    scopeAm: 'ከደንበኛው መዝገቦች እስከ 400 የደንበኛ አድራሻዎችን የያዘ የመረጃ ቋት መገንባት፣ ድግግሞሾችን ማስወገድ እና ለመልዕክት ቡድኖችን ማዘጋጀት።',
    exclusionsEn: 'Buying contact lists and sending campaigns.', exclusionsAm: 'የአድራሻ ዝርዝር መግዛት እና ዘመቻ መላክ አይጨምርም።',
    deliverableEn: 'A de-duplicated customer list with groups, kept in a tool the client controls.', deliverableAm: 'ድግግሞሽ የሌለው፣ በቡድን የተከፋፈለ፣ ደንበኛው በሚቆጣጠረው መሣሪያ የተቀመጠ የደንበኛ ዝርዝር።',
    turnaroundDays: 5, revisionLimit: 1, minTier: 'ENTRY', etb: [1200, 2000, 3500],
    checklistEn: ['No duplicate phone numbers', 'Each contact is in a group', 'Only contacts the client supplied are included'],
    checklistAm: ['የተደገመ ስልክ ቁጥር የለም', 'እያንዳንዱ አድራሻ በቡድን ውስጥ ነው', 'ደንበኛው የሰጣቸው አድራሻዎች ብቻ ተካትተዋል'],
  },
  {
    code: 'ECOM-SHOP', area: 'ECOMMERCE',
    titleEn: 'Online shop listing', titleAm: 'የኦንላይን ሱቅ ዝርዝር',
    scopeEn: 'List up to 40 products with photos, prices and descriptions on a Telegram shop, marketplace or existing website.',
    scopeAm: 'እስከ 40 ምርቶችን ከፎቶ፣ ዋጋና መግለጫ ጋር በቴሌግራም ሱቅ፣ በገበያ መድረክ ወይም ባለው ድረ-ገጽ ላይ መዘርዘር።',
    exclusionsEn: 'Product photography, delivery logistics and payment gateway contracts.', exclusionsAm: 'የምርት ፎቶግራፍ፣ የማድረስ ሎጂስቲክስ እና የክፍያ መግቢያ ውል አይጨምርም።',
    deliverableEn: 'Live listings and a guide to adding new products.', deliverableAm: 'የሚሠሩ ዝርዝሮች እና አዲስ ምርት የማከያ መመሪያ።',
    turnaroundDays: 5, revisionLimit: 2, minTier: 'INTERMEDIATE', etb: [2000, 3500, 6000],
    checklistEn: ['All products listed with price', 'Order or contact button works', 'Guide delivered'],
    checklistAm: ['ሁሉም ምርቶች ከዋጋ ጋር ተዘርዝረዋል', 'የትዕዛዝ ወይም የመገኛ ቁልፍ ይሠራል', 'መመሪያ ቀርቧል'],
  },
  {
    code: 'ADM-DOCS', area: 'BUS_ADMIN',
    titleEn: 'Business documents pack', titleAm: 'የንግድ ሰነዶች ጥቅል',
    scopeEn: 'Prepare up to five templates such as invoice, receipt, quotation, delivery note and letterhead in Amharic and English.',
    scopeAm: 'እንደ ደረሰኝ፣ የክፍያ ጥያቄ፣ የዋጋ ማቅረቢያ፣ የማድረሻ ማስታወሻ እና የደብዳቤ ራስጌ ያሉ እስከ አምስት ቅጾችን በአማርኛና በእንግሊዝኛ ማዘጋጀት።',
    exclusionsEn: 'Legal advice and official registration.', exclusionsAm: 'የሕግ ምክር እና ይፋዊ ምዝገባ አይጨምርም።',
    deliverableEn: 'Editable Word or Sheets templates and PDF copies.', deliverableAm: 'ሊስተካከሉ የሚችሉ የWord ወይም Sheets ቅጾች እና PDF ቅጂዎች።',
    turnaroundDays: 4, revisionLimit: 2, minTier: 'ENTRY', etb: [1000, 1800, 3000],
    checklistEn: ['Each template shows the business name and TIN', 'Editable and PDF versions delivered', 'Both languages included'],
    checklistAm: ['እያንዳንዱ ቅጽ የንግድ ስምና የግብር ከፋይ መለያ ቁጥር ያሳያል', 'ሊስተካከሉ የሚችሉ እና PDF ቅጂዎች ቀርበዋል', 'ሁለቱም ቋንቋዎች ተካትተዋል'],
  },
  {
    code: 'ADM-VA', area: 'BUS_ADMIN',
    titleEn: 'Virtual assistant, 20 hours', titleAm: 'ምናባዊ ረዳት፣ 20 ሰዓት',
    scopeEn: 'Up to 20 hours over two weeks of scheduling, email and message handling, document preparation or research, logged daily.',
    scopeAm: 'በሁለት ሳምንታት ውስጥ እስከ 20 ሰዓት የቀጠሮ ማስያዝ፣ የኢሜይልና የመልዕክት አያያዝ፣ የሰነድ ዝግጅት ወይም ጥናት፣ በየቀኑ የሚመዘገብ።',
    exclusionsEn: 'Handling money on the client’s behalf.', exclusionsAm: 'በደንበኛው ስም ገንዘብ መያዝ አይጨምርም።',
    deliverableEn: 'Completed tasks and a time log.', deliverableAm: 'የተጠናቀቁ ተግባራት እና የሰዓት መዝገብ።',
    turnaroundDays: 14, revisionLimit: 1, minTier: 'INTERMEDIATE', etb: [3000, 4500, 7000],
    checklistEn: ['Time log totals 20 hours or less', 'Each task in the log is marked done or explained'],
    checklistAm: ['የሰዓት መዝገቡ ድምር 20 ሰዓት ወይም ከዚያ በታች ነው', 'በመዝገቡ ያለ እያንዳንዱ ተግባር ተጠናቋል ወይም ተብራርቷል'],
  },
  {
    code: 'WEB-SITE', area: 'WEB_IT',
    titleEn: 'One-page business website', titleAm: 'ባለአንድ ገጽ የንግድ ድረ-ገጽ',
    scopeEn: 'A mobile-friendly one-page site with services, photos, map and contact buttons on a low-cost host, in Amharic and English.',
    scopeAm: 'አገልግሎቶች፣ ፎቶዎች፣ ካርታ እና የመገኛ ቁልፎች ያሉት በሞባይል የሚመች ባለአንድ ገጽ ድረ-ገጽ በዝቅተኛ ወጪ ሆስቲንግ፣ በአማርኛና በእንግሊዝኛ።',
    exclusionsEn: 'Domain and hosting fees, online payments and ongoing maintenance.', exclusionsAm: 'የዶሜይን እና የሆስቲንግ ክፍያ፣ የኦንላይን ክፍያ እና ቀጣይ ጥገና አይጨምርም።',
    deliverableEn: 'A live website with the domain and hosting in the client’s name.', deliverableAm: 'ዶሜይኑና ሆስቲንጉ በደንበኛው ስም የተመዘገበ የሚሠራ ድረ-ገጽ።',
    turnaroundDays: 7, revisionLimit: 2, minTier: 'INTERMEDIATE', etb: [4000, 7000, 12000],
    checklistEn: ['Site loads on a phone', 'Contact buttons work', 'Domain and hosting are in the client’s name'],
    checklistAm: ['ድረ-ገጹ በስልክ ይከፈታል', 'የመገኛ ቁልፎቹ ይሠራሉ', 'ዶሜይንና ሆስቲንግ በደንበኛው ስም ናቸው'],
  },
  {
    code: 'IT-SETUP', area: 'WEB_IT',
    titleEn: 'Office IT set-up', titleAm: 'የቢሮ የአይቲ ዝግጅት',
    scopeEn: 'Set up up to five computers or phones with business email, shared files, printer, antivirus and backups, on site in Addis Ababa.',
    scopeAm: 'እስከ አምስት ኮምፒዩተሮችን ወይም ስልኮችን በንግድ ኢሜይል፣ የጋራ ፋይሎች፣ ፕሪንተር፣ ፀረ-ቫይረስ እና ምትኬ በአዲስ አበባ በቦታው ማዘጋጀት።',
    exclusionsEn: 'Hardware, licences and repairs.', exclusionsAm: 'ሃርድዌር፣ ፈቃዶች እና ጥገና አይጨምርም።',
    deliverableEn: 'Working devices and a one-page list of accounts and settings.', deliverableAm: 'የሚሠሩ መሣሪያዎች እና የሂሳቦችና ቅንብሮች የአንድ ገጽ ዝርዝር።',
    turnaroundDays: 3, revisionLimit: 1, minTier: 'INTERMEDIATE', etb: [2000, 3500, 6000],
    checklistEn: ['Email works on every device', 'Backups are running', 'Client holds every password'],
    checklistAm: ['ኢሜይል በሁሉም መሣሪያ ይሠራል', 'ምትኬ እየተወሰደ ነው', 'ሁሉም የይለፍ ቃሎች በደንበኛው እጅ ናቸው'],
  },
];
