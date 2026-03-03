/**
 * 1-800-Packouts SDR Onboarding — Google Slides Generator
 *
 * HOW TO USE:
 * 1. Go to script.google.com (logged in as your @1800packouts.com account)
 * 2. Create a new project, name it "SDR Slides Generator"
 * 3. Paste this entire file into Code.gs (replace the default code)
 * 4. Update FOLDER_ID below with your target Drive folder ID
 * 5. Click Run → select generateAllDecks → Authorize when prompted
 * 6. Wait ~2-3 minutes — all 7 decks will appear in your Drive folder
 *
 * To get a folder ID: open the folder in Drive, copy the ID from the URL
 * e.g., https://drive.google.com/drive/folders/THIS_IS_THE_ID
 */

// ============================================================
// CONFIGURATION — Update this before running
// ============================================================
const FOLDER_ID = '1_Pll9pREcaSw0oEJwZUu0PUA_EE0Gxud';

// Brand colors
const NAVY = '#1B365D';
const GOLD = '#D4A853';
const WARM_WHITE = '#F5F3F0';
const WHITE = '#FFFFFF';
const DARK_TEXT = '#1A1A1A';
const LIGHT_TEXT = '#FFFFFF';
const MUTED_TEXT = '#6B7280';

// Font
const HEADING_FONT = 'Montserrat';
const BODY_FONT = 'Open Sans';

// ============================================================
// MAIN ENTRY POINT
// ============================================================
function generateAllDecks() {
  if (!FOLDER_ID) {
    throw new Error('Please set FOLDER_ID at the top of the script before running.');
  }

  const lessons = [
    { title: 'What Is Contents Packout?', subtitle: 'Understanding the service you sell every day', slides: getLesson01() },
    { title: 'The Insurance Claim Lifecycle', subtitle: 'Understanding the 6-step process that drives every conversation', slides: getLesson02() },
    { title: 'Industry Glossary', subtitle: 'Every term you\'ll hear on calls, in HubSpot, and from Matt', slides: getLesson03() },
    { title: 'Who You\'re Calling & Why', subtitle: '4 customer types, 4 scripts, 4 different approaches', slides: getLesson04() },
    { title: 'The Competitive Landscape', subtitle: 'Know the players. Win the right way.', slides: getLesson05() },
    { title: 'The Fire Leads Program', subtitle: 'Your #1 priority — from alert to close', slides: getLesson06() },
    { title: 'HubSpot Logging: The Complete Guide', subtitle: 'If it\'s not logged, it didn\'t happen', slides: getLesson07() },
  ];

  const folder = DriveApp.getFolderById(FOLDER_ID);

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const deckNum = String(i + 1).padStart(2, '0');
    const deckName = `${deckNum} — ${lesson.title}`;

    Logger.log(`Creating deck: ${deckName}`);
    const presentation = SlidesApp.create(deckName);
    const presId = presentation.getId();

    // Move to target folder
    const file = DriveApp.getFileById(presId);
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    // Remove default blank slide
    const defaultSlides = presentation.getSlides();

    // Build title slide
    buildTitleSlide(defaultSlides[0], lesson.title, lesson.subtitle);

    // Build content slides
    for (const slideData of lesson.slides) {
      buildContentSlide(presentation, slideData);
    }

    Logger.log(`Done: ${deckName} → ${presentation.getUrl()}`);
  }

  Logger.log('All 7 decks created successfully!');
}

// ============================================================
// SLIDE BUILDERS
// ============================================================

function buildTitleSlide(slide, title, subtitle) {
  // Set navy background
  slide.getBackground().setSolidFill(NAVY);

  // Clear default placeholders
  slide.getPageElements().forEach(el => el.remove());

  // Gold accent bar at top
  const bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 8);
  bar.getFill().setSolidFill(GOLD);
  bar.getBorder().setTransparent();

  // Lesson title
  const titleBox = slide.insertTextBox(title, 40, 120, 640, 100);
  const titleStyle = titleBox.getText().getTextStyle();
  titleStyle.setFontSize(40).setBold(true).setForegroundColor(WHITE).setFontFamily(HEADING_FONT);
  titleBox.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
  titleBox.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);

  // Subtitle
  const subBox = slide.insertTextBox(subtitle, 40, 230, 640, 50);
  const subStyle = subBox.getText().getTextStyle();
  subStyle.setFontSize(20).setItalic(true).setForegroundColor(GOLD).setFontFamily(BODY_FONT);

  // "1-800-Packouts SDR Onboarding" label
  const labelBox = slide.insertTextBox('1-800-Packouts SDR Onboarding', 40, 310, 640, 35);
  const labelStyle = labelBox.getText().getTextStyle();
  labelStyle.setFontSize(16).setForegroundColor('#8899AA').setFontFamily(BODY_FONT);

  // Footer
  addFooter(slide);
}

function buildContentSlide(presentation, data) {
  const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);

  if (data.type === 'quiz') {
    buildQuizSlide(slide, data);
  } else {
    buildBulletSlide(slide, data);
  }

  // Add speaker notes
  if (data.notesEN || data.notesES) {
    let notes = '';
    if (data.notesEN) {
      notes += '[English]\n' + data.notesEN;
    }
    if (data.notesES) {
      notes += '\n\n[Español]\n' + data.notesES;
    }
    slide.getNotesPage().getSpeakerNotesShape().getText().setText(notes);
  }

  addFooter(slide);
}

function buildBulletSlide(slide, data) {
  // Warm white background
  slide.getBackground().setSolidFill(WARM_WHITE);

  // Navy header bar
  const headerBar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 70);
  headerBar.getFill().setSolidFill(NAVY);
  headerBar.getBorder().setTransparent();

  // Gold accent line under header
  const accent = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 70, 720, 4);
  accent.getFill().setSolidFill(GOLD);
  accent.getBorder().setTransparent();

  // Title in header
  const titleBox = slide.insertTextBox(data.title, 30, 12, 660, 50);
  const titleStyle = titleBox.getText().getTextStyle();
  titleStyle.setFontSize(26).setBold(true).setForegroundColor(WHITE).setFontFamily(HEADING_FONT);
  titleBox.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);

  // Bullets
  if (data.bullets && data.bullets.length > 0) {
    const bulletText = data.bullets.join('\n');
    const fontSize = data.bullets.length > 6 ? 16 : 18;
    const topMargin = 90;
    const bulletBox = slide.insertTextBox(bulletText, 40, topMargin, 640, 290);
    const bStyle = bulletBox.getText().getTextStyle();
    bStyle.setFontSize(fontSize).setForegroundColor(DARK_TEXT).setFontFamily(BODY_FONT);
    bulletBox.getText().getParagraphStyle().setLineSpacing(130);

    // Bold any text wrapped in ** (simple bold markers)
    applyBoldMarkers(bulletBox);

    // Add bullet list styling
    for (let i = 0; i < data.bullets.length; i++) {
      const para = bulletBox.getText().getParagraphs()[i];
      if (para) {
        para.getRange().getParagraphStyle().setIndentStart(20);
      }
    }
  }
}

function buildQuizSlide(slide, data) {
  // Gold background for quiz slides to differentiate
  slide.getBackground().setSolidFill(NAVY);

  // Title
  const titleBox = slide.insertTextBox(data.title, 30, 20, 660, 50);
  const titleStyle = titleBox.getText().getTextStyle();
  titleStyle.setFontSize(28).setBold(true).setForegroundColor(GOLD).setFontFamily(HEADING_FONT);

  // Questions
  if (data.bullets && data.bullets.length > 0) {
    const qText = data.bullets.join('\n');
    const fontSize = data.bullets.length > 5 ? 15 : 17;
    const qBox = slide.insertTextBox(qText, 40, 85, 640, 300);
    const qStyle = qBox.getText().getTextStyle();
    qStyle.setFontSize(fontSize).setForegroundColor(WHITE).setFontFamily(BODY_FONT);
    qBox.getText().getParagraphStyle().setLineSpacing(140);
  }
}

function addFooter(slide) {
  const footerBox = slide.insertTextBox('1-800-Packouts  |  SDR Onboarding  |  Confidential', 150, 385, 420, 20);
  const fStyle = footerBox.getText().getTextStyle();
  fStyle.setFontSize(9).setForegroundColor(MUTED_TEXT).setFontFamily(BODY_FONT);
  footerBox.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
}

function applyBoldMarkers(textBox) {
  // Look for text between ** markers and bold it
  const text = textBox.getText().asString();
  const regex = /\*\*(.+?)\*\*/g;
  let match;
  const ranges = [];

  while ((match = regex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length, boldText: match[1] });
  }

  // Apply bold in reverse order so indices stay valid
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const range = textBox.getText().getRange(r.start, r.end);
    range.getTextStyle().setBold(true);
    // Remove the ** markers
    const currentText = textBox.getText().asString();
    const before = currentText.substring(0, r.start);
    const bold = r.boldText;
    const after = currentText.substring(r.end);
    textBox.getText().setText(before + bold + after);
    // Re-bold the unmasked text
    textBox.getText().getRange(r.start, r.start + bold.length).getTextStyle().setBold(true);
  }
}

// ============================================================
// LESSON CONTENT — All 7 lessons
// ============================================================

function getLesson01() {
  return [
    {
      title: 'Contents vs. Structure — What\'s the Difference?',
      bullets: [
        '**Structure** = the building itself (walls, roof, floors, plumbing, electrical)',
        '**Contents** = everything INSIDE the home (furniture, clothes, electronics, kitchenware, personal items)',
        'A restoration company fixes the structure; WE handle the contents',
        'Think of it this way: if you flipped the house upside down, everything that falls out is "contents"',
      ],
      notesEN: 'This is the most important distinction in our industry. When a fire or flood happens, two separate things need help — the house itself and everything inside it. Most people only think about fixing the walls and floors. But all of their belongings — their furniture, their clothes, their kids\' toys, their family photos — that\'s what WE take care of. We are the contents experts.',
      notesES: 'Esta es la distinción más importante en nuestra industria. Cuando ocurre un incendio o una inundación, dos cosas separadas necesitan ayuda — la casa en sí y todo lo que hay dentro. La mayoría de la gente solo piensa en reparar las paredes y los pisos. Pero todas sus pertenencias — sus muebles, su ropa, los juguetes de sus hijos, las fotos familiares — eso es lo que NOSOTROS cuidamos. Somos los expertos en contenidos.',
    },
    {
      title: 'Why Do Homeowners Need a Packout Company?',
      bullets: [
        'After a fire or flood, the home becomes a construction zone',
        'Contents left inside get damaged by dust, debris, smoke, and moisture',
        'Homeowners can\'t live there AND their stuff can\'t stay there',
        'Without professional packout, belongings suffer MORE damage during repairs',
        'We protect what insurance already agreed to cover',
      ],
      notesEN: 'Here\'s the scenario. A family has a kitchen fire. The restoration company needs to gut the kitchen and maybe part of the living room. If the family\'s furniture, clothes, and electronics stay in the house during construction, they\'ll get covered in drywall dust, exposed to chemicals, and potentially destroyed. That\'s where we come in. We carefully remove everything, protect it, clean it, store it, and bring it back when the house is ready. Without us, the homeowner loses more than they already lost.',
      notesES: 'Este es el escenario. Una familia tiene un incendio en la cocina. La empresa de restauración necesita demoler la cocina y tal vez parte de la sala. Si los muebles, la ropa y los electrónicos de la familia se quedan en la casa durante la construcción, se cubrirán de polvo de yeso, se expondrán a químicos y potencialmente se destruirán. Ahí es donde entramos nosotros. Retiramos todo con cuidado, lo protegemos, lo limpiamos, lo almacenamos y lo devolvemos cuando la casa está lista. Sin nosotros, el propietario pierde más de lo que ya perdió.',
    },
    {
      title: 'The 4-Phase Process — Overview',
      bullets: [
        '**Phase 1: Packout** — Carefully inventory, pack, and remove all contents from the home',
        '**Phase 2: Cleaning** — Professional cleaning of smoke, soot, water, or mold damage on items',
        '**Phase 3: Storage** — Secure climate-controlled storage while the home is repaired',
        '**Phase 4: Pack-back** — Return everything to the home once repairs are complete',
        'Every phase is a separate billable service covered by insurance',
      ],
      notesEN: 'This is our entire business in four steps. Think of it like a cycle — we take things out, clean them, hold them safely, and bring them back. Each phase is its own service, and insurance pays for each one separately. When you\'re on the phone with a homeowner, this is the simple story you tell: "We pack it, clean it, store it, and bring it back." Easy to remember, easy to explain.',
      notesES: 'Este es todo nuestro negocio en cuatro pasos. Piénsalo como un ciclo — sacamos las cosas, las limpiamos, las guardamos de forma segura y las devolvemos. Cada fase es un servicio propio, y el seguro paga por cada una por separado. Cuando estés al teléfono con un propietario, esta es la historia simple que cuentas: "Lo empacamos, lo limpiamos, lo almacenamos y lo devolvemos." Fácil de recordar, fácil de explicar.',
    },
    {
      title: 'Phase 1 — Packout',
      bullets: [
        'Our crew goes room by room through the entire home',
        'Every item is inventoried, photographed, and documented (using Encircle app)',
        'Items are carefully wrapped, boxed, and labeled',
        'Boxes are loaded onto trucks and transported to our warehouse',
        'The homeowner receives a detailed inventory of everything we took',
        'This phase requires trust — we\'re handling people\'s most personal belongings',
      ],
      notesEN: 'The packout is where we make our first impression. Our techs are in the homeowner\'s space, touching their personal items. This is emotional work. The homeowner may be watching us pack up their grandmother\'s china or their child\'s first drawings. That\'s why we document everything with photos and inventory lists — it builds trust and protects everyone. When you talk to homeowners on the phone, emphasize that we treat their belongings like our own.',
      notesES: 'El empaque es donde hacemos nuestra primera impresión. Nuestros técnicos están en el espacio del propietario, tocando sus artículos personales. Este es un trabajo emocional. El propietario puede estar viéndonos empacar la porcelana de su abuela o los primeros dibujos de su hijo. Por eso documentamos todo con fotos y listas de inventario — eso genera confianza y protege a todos. Cuando hables con propietarios por teléfono, enfatiza que tratamos sus pertenencias como si fueran nuestras.',
    },
    {
      title: 'Phase 2 — Cleaning',
      bullets: [
        'Items damaged by smoke, soot, water, or mold are professionally cleaned',
        'Different cleaning methods for different materials (electronics vs. fabrics vs. wood)',
        'Specialized equipment: ultrasonic cleaners, ozone machines, dry cleaning',
        'Some items can\'t be saved — those are documented as "non-salvageable"',
        'Cleaning is where we ADD value — we restore items that would otherwise be replaced',
      ],
      notesEN: 'Cleaning is a huge part of what we do, but it\'s often overlooked. After a fire, smoke gets into everything — inside drawers, in the fibers of clothing, into electronics. We have specialized equipment to clean all of that. The key message for homeowners: we save as much as possible. Insurance would rather pay us to clean an item than pay to replace it, so this is a win-win. And for items that truly can\'t be saved, we document that carefully too.',
      notesES: 'La limpieza es una parte enorme de lo que hacemos, pero a menudo se pasa por alto. Después de un incendio, el humo se mete en todo — dentro de los cajones, en las fibras de la ropa, en los electrónicos. Tenemos equipo especializado para limpiar todo eso. El mensaje clave para los propietarios: salvamos lo más posible. El seguro prefiere pagarnos por limpiar un artículo que pagar por reemplazarlo, así que todos ganan. Y para los artículos que realmente no se pueden salvar, también lo documentamos cuidadosamente.',
    },
    {
      title: 'Phase 3 — Storage',
      bullets: [
        'All packed items go to our secure, climate-controlled warehouse',
        'Items stay in storage for the duration of home repairs (weeks to months)',
        'Homeowners can request access to specific items if needed',
        'Storage is billed monthly and covered by insurance',
        'We maintain the inventory tracking system so nothing gets lost',
      ],
      notesEN: 'Storage is straightforward but critical. Home repairs can take anywhere from a few weeks to several months, especially after a major fire. During that time, the homeowner\'s belongings need to be somewhere safe. Our warehouse is climate-controlled — that means no extreme heat, no moisture, no pests. When homeowners ask "Where does my stuff go?" you can confidently say: "It\'s in our secure warehouse, and you can access anything you need."',
      notesES: 'El almacenamiento es sencillo pero crítico. Las reparaciones del hogar pueden tomar desde unas pocas semanas hasta varios meses, especialmente después de un incendio grande. Durante ese tiempo, las pertenencias del propietario necesitan estar en un lugar seguro. Nuestro almacén tiene clima controlado — eso significa que no hay calor extremo, no hay humedad, no hay plagas. Cuando los propietarios pregunten "¿A dónde va mi stuff?" puedes decir con confianza: "Está en nuestro almacén seguro, y pueden acceder a lo que necesiten."',
    },
    {
      title: 'Phase 4 — Pack-back',
      bullets: [
        'Once home repairs are complete, we schedule the pack-back',
        'Our crew returns all items to their original rooms',
        'Furniture is placed, boxes are unpacked, items are arranged',
        'The goal: the homeowner walks in and feels like they\'re HOME again',
        'This is the happy ending of a difficult journey',
      ],
      notesEN: 'Pack-back is the best part of what we do. After weeks or months of displacement, the homeowner finally gets to come home — and we\'re the ones who make it feel like home again. We don\'t just dump boxes in the living room. We put furniture back where it belongs, we unpack, we set things up. This is the moment the homeowner remembers us positively. When you\'re selling on the phone, paint this picture: "We\'ll have your home put back together exactly the way it was."',
      notesES: 'El pack-back es la mejor parte de lo que hacemos. Después de semanas o meses de desplazamiento, el propietario finalmente puede regresar a casa — y nosotros somos los que hacen que se sienta como hogar de nuevo. No simplemente dejamos cajas en la sala. Ponemos los muebles donde pertenecen, desempacamos, organizamos las cosas. Este es el momento en que el propietario nos recuerda positivamente. Cuando estés vendiendo por teléfono, pinta esta imagen: "Tendremos su hogar organizado exactamente como estaba."',
    },
    {
      title: 'Insurance Covers Everything',
      bullets: [
        'Contents packout is a standard covered service under homeowner\'s insurance',
        'The homeowner pays **nothing out of pocket** — insurance covers our services',
        'We bill the insurance company directly using Xactimate (industry-standard software)',
        'This is NOT an upsell or luxury — it\'s part of the claim',
        'The homeowner just needs to authorize us to do the work',
      ],
      notesEN: 'This is your most powerful selling point. When a homeowner hears "fire" or "flood," they immediately worry about money. Your job is to remove that worry fast. Say: "This is already covered by your insurance. There\'s no cost to you." That changes the entire conversation. We\'re not asking them to spend money — we\'re telling them about a benefit they already have. All they need to do is say yes and sign a work authorization. Insurance handles the rest.',
      notesES: 'Este es tu punto de venta más poderoso. Cuando un propietario escucha "incendio" o "inundación," inmediatamente se preocupa por el dinero. Tu trabajo es eliminar esa preocupación rápido. Di: "Esto ya está cubierto por su seguro. No tiene costo para usted." Eso cambia toda la conversación. No les estamos pidiendo que gasten dinero — les estamos diciendo sobre un beneficio que ya tienen. Todo lo que necesitan hacer es decir que sí y firmar una autorización de trabajo. El seguro se encarga del resto.',
    },
    {
      title: 'What Makes 1-800-Packouts Different?',
      bullets: [
        'We ONLY do contents — this is all we do, every day',
        'Detailed documentation with photos and inventory (Encircle technology)',
        'Licensed, insured, and IICRC-certified technicians',
        'Local company in Phoenix, AZ — we know the market and the community',
        'We work directly with insurance companies and adjusters',
        'Bilingual team (English and Spanish) — serving the whole community',
      ],
      notesEN: 'When someone asks "Why should I choose you?" here\'s the answer: We\'re specialists, not generalists. A restoration company does packout as a side service — we do it as our ONLY service. That means we\'re better at it, faster at it, and more careful with people\'s belongings. Plus, we have bilingual staff, which is a huge advantage in Phoenix. Many homeowners feel more comfortable working with someone who speaks their language — and that\'s where you come in, Vanessa.',
      notesES: 'Cuando alguien pregunte "¿Por qué debería elegirlos?" aquí está la respuesta: Somos especialistas, no generalistas. Una empresa de restauración hace empaque como un servicio secundario — nosotros lo hacemos como nuestro ÚNICO servicio. Eso significa que somos mejores, más rápidos y más cuidadosos con las pertenencias de las personas. Además, tenemos personal bilingüe, lo cual es una gran ventaja en Phoenix. Muchos propietarios se sienten más cómodos trabajando con alguien que habla su idioma — y ahí es donde entras tú, Vanessa.',
    },
    {
      title: 'Common Homeowner Questions You\'ll Hear',
      bullets: [
        '"How much does this cost?" → "It\'s covered by your insurance — no cost to you."',
        '"How long will you have my stuff?" → "Only as long as it takes to repair your home."',
        '"Will my things be safe?" → "Everything is inventoried, photographed, and stored in our secure warehouse."',
        '"Can I get something from storage?" → "Yes, just let us know what you need."',
        '"Who are you and how did you get my number?" → (We\'ll cover this in the scripts lesson)',
      ],
      notesEN: 'These are the top five questions you\'ll hear on calls. Notice that most of them come from fear — fear of cost, fear of losing their stuff, fear of the unknown. Your job is to be calm, confident, and reassuring. You don\'t need to know every technical detail right now. You just need to make them feel safe. The most important answer to memorize: "It\'s covered by your insurance — no cost to you."',
      notesES: 'Estas son las cinco preguntas principales que escucharás en las llamadas. Nota que la mayoría vienen del miedo — miedo al costo, miedo a perder sus cosas, miedo a lo desconocido. Tu trabajo es ser calmada, segura y tranquilizadora. No necesitas saber cada detalle técnico ahora mismo. Solo necesitas hacerlos sentir seguros. La respuesta más importante para memorizar: "Está cubierto por su seguro — no tiene costo para usted."',
    },
    {
      type: 'quiz',
      title: 'Quiz / Reflection',
      bullets: [
        '1. What is the difference between "contents" and "structure"?',
        '2. Name the 4 phases of our service in order.',
        '3. What do you say when a homeowner asks "How much does this cost?"',
        '4. Why does a homeowner need a packout company instead of just leaving things in the house?',
        '5. In your own words (English or Spanish), explain what 1-800-Packouts does in 2 sentences.',
      ],
      notesEN: 'Take a moment to answer these questions. Don\'t worry about being perfect — this is about making sure you have the basics down. The most important thing: can you explain what we do simply and confidently? Practice saying it out loud in both English and Spanish. You\'ll use this every single day on the phone.',
      notesES: 'Tómate un momento para responder estas preguntas. No te preocupes por ser perfecta — esto es para asegurarte de que tienes los fundamentos claros. Lo más importante: ¿puedes explicar lo que hacemos de forma simple y con confianza? Practica diciéndolo en voz alta tanto en inglés como en español. Usarás esto todos los días en el teléfono.',
    },
  ];
}

function getLesson02() {
  return [
    {
      title: 'The 6 Steps at a Glance',
      bullets: [
        'Step 1: The Loss (fire, water, storm)',
        'Step 2: Claim Filed (homeowner calls insurance)',
        'Step 3: Adjuster Assigned (inspector sent)',
        'Step 4: Scope Written (Xactimate estimate)',
        'Step 5: Vendor Selected (us!)',
        'Step 6: Work Authorization (Matt closes)',
      ],
      notesEN: 'Here\'s the full cycle in six steps. Every lead you talk to is somewhere in this process. Your job is to figure out where they are and move them forward. Let\'s go through each one.',
      notesES: 'Aquí está el ciclo completo en seis pasos. Cada prospecto con el que hables está en algún punto de este proceso. Tu trabajo es descubrir dónde están y avanzarlos. Vamos a revisar cada paso.',
    },
    {
      title: 'Step 1 — The Loss',
      bullets: [
        'Something bad happens: structure fire, water damage, smoke, storm',
        'Structure fires are our primary lead source (fireleads.com)',
        'We often know about it within hours',
        'This is the event that starts everything',
      ],
      notesEN: 'The loss is the triggering event. For us, structure fires are the big one — that\'s where fireleads.com comes in. We get alerts within hours of a fire. Water damage is the other common one — burst pipes, water heater failures. The key thing is: this event just happened, and the homeowner is in crisis mode.',
      notesES: 'La pérdida es el evento que desencadena todo. Para nosotros, los incendios estructurales son los más importantes — ahí es donde entra fireleads.com. Recibimos alertas dentro de horas de un incendio. Los daños por agua son el otro caso común — tuberías rotas, fallas de calentadores. Lo clave es: este evento acaba de pasar y el propietario está en modo de crisis.',
    },
    {
      title: 'Step 2 — Claim Filed',
      bullets: [
        'Homeowner calls their insurance company',
        'Creates a claim number',
        'They may NOT have done this yet when you call',
        'Discovery question: "Has your insurance company been in touch yet?"',
        'Common carriers: State Farm, Allstate, USAA, Travelers, Liberty Mutual, Farmers',
      ],
      notesEN: 'After the loss, the homeowner files a claim with their insurance. Sometimes when you call them, they haven\'t even done this yet — that\'s totally fine. One of your discovery questions is "Has your insurance been in touch?" Knowing which carrier they have matters because some are easier to work with.',
      notesES: 'Después de la pérdida, el propietario presenta una reclamación con su seguro. A veces cuando los llamas, ni siquiera han hecho esto — está bien. Una de tus preguntas de descubrimiento es "¿Ya se comunicó su compañía de seguros?" Saber qué aseguradora tienen importa porque algunas son más fáciles de trabajar.',
    },
    {
      title: 'Step 3 — Adjuster Assigned',
      bullets: [
        'Insurance assigns an adjuster to inspect the damage',
        'The adjuster decides: what\'s covered, which vendors, the scope',
        'Adjusters are GATEKEEPERS — building trust with them is gold',
        'Three types: Staff (employee), Independent (contractor), Public (hired by homeowner)',
      ],
      notesEN: 'The adjuster is the most important person in the process for us. They inspect the damage, decide what\'s covered, and approve vendors — including us. If an adjuster trusts 1-800-Packouts, they\'ll recommend us to every homeowner. That\'s why Script 3 exists — building these relationships is a long game but incredibly valuable.',
      notesES: 'El ajustador es la persona más importante del proceso para nosotros. Inspecciona los daños, decide qué está cubierto y aprueba proveedores — incluyéndonos. Si un ajustador confía en 1-800-Packouts, nos recomendará a cada propietario. Por eso existe el Script 3 — construir estas relaciones es un juego a largo plazo pero increíblemente valioso.',
    },
    {
      title: 'Step 4 — Scope Written',
      bullets: [
        'Adjuster writes a scope of work using Xactimate',
        'Lists every line item insurance will pay for',
        'Key terms: RCV (full replacement cost), ACV (minus depreciation)',
        'Supplements are common — almost every job gets one',
        'You will NEVER write a scope or discuss pricing',
      ],
      notesEN: 'The scope is the document that lists everything insurance will pay for. It\'s written in Xactimate, which is industry-standard software. You need to know what RCV and ACV mean so you sound knowledgeable when talking to adjusters, but you will never write a scope yourself and you will never discuss pricing. That\'s always Matt.',
      notesES: 'El alcance es el documento que lista todo lo que el seguro pagará. Se escribe en Xactimate, que es el software estándar de la industria. Necesitas saber qué significan RCV y ACV para sonar conocedora al hablar con ajustadores, pero nunca escribirás un alcance tú misma y nunca discutirás precios. Eso siempre es Matt.',
    },
    {
      title: 'Step 5 — Vendor Selected',
      bullets: [
        'The homeowner or their team chooses a packout vendor',
        '4 ways we get chosen:',
        '  • Direct from homeowner (fire lead → they liked us)',
        '  • Referral from GC (they sub packout to us)',
        '  • Referral from adjuster (we\'re on their preferred list)',
        '  • Referral from property manager (emergency need)',
        'YOUR job: open ALL of these channels',
      ],
      notesEN: 'This is the moment we get the job. There are four ways in — direct from the homeowner, referred by a GC, referred by an adjuster, or called by a property manager. Your job as SDR is to keep all four channels open. That\'s why you have four different scripts for four different customer types. Each one is a door into the business.',
      notesES: 'Este es el momento en que obtenemos el trabajo. Hay cuatro formas de entrar — directo del propietario, referido por un contratista, referido por un ajustador, o llamado por un administrador de propiedades. Tu trabajo como SDR es mantener los cuatro canales abiertos. Por eso tienes cuatro scripts diferentes para cuatro tipos de clientes. Cada uno es una puerta al negocio.',
    },
    {
      title: 'Step 6 — Work Authorization',
      bullets: [
        'Signed agreement to enter the home, pack contents, store them',
        'Insurance has approved the scope',
        'Matt handles ALL work authorizations',
        'Your role stops here: you discover, qualify, escalate. Matt closes.',
      ],
      notesEN: 'The final step is work authorization — a signed agreement that lets us do the work. Matt handles all of these. Your role as SDR is to get leads to this point. You discover who they are, qualify whether they need us, and escalate to Matt when it\'s real. You don\'t close deals — Matt does. But without your work opening doors, there are no deals to close.',
      notesES: 'El paso final es la autorización de trabajo — un acuerdo firmado que nos permite hacer el trabajo. Matt maneja todas estas. Tu rol como SDR es llevar los prospectos hasta este punto. Descubres quiénes son, calificas si nos necesitan, y escalas a Matt cuando es real. Tú no cierras tratos — Matt lo hace. Pero sin tu trabajo abriendo puertas, no hay tratos que cerrar.',
    },
    {
      title: 'The Timeline',
      bullets: [
        'Loss → first call: hours (fire leads) to days (cold outreach)',
        'Claim → adjuster: 1-5 days',
        'Adjuster → scope: 1-2 weeks',
        'Scope → work auth: days to weeks',
        'Packout: 1-3 days | Storage: 3-12 months | Pack-back: 1-2 days',
        'Total cycle: 6-18 months',
      ],
      notesEN: 'The full cycle from loss to pack-back can take 6 to 18 months. That\'s why follow-up cadence is so important. A lead you talk to today might not need us for weeks, but you need to stay top of mind. Follow up consistently — 3 attempts over 7 days for fire leads, scheduled follow-ups for everyone else.',
      notesES: 'El ciclo completo desde la pérdida hasta el pack-back puede tomar 6 a 18 meses. Por eso la cadencia de seguimiento es tan importante. Un prospecto con el que hables hoy podría no necesitarnos por semanas, pero necesitas estar presente en su mente. Da seguimiento consistentemente — 3 intentos en 7 días para leads de incendio, seguimientos programados para todos los demás.',
    },
    {
      type: 'quiz',
      title: 'Reflection',
      bullets: [
        'A homeowner says "my adjuster hasn\'t come yet." Where are they in the 6 steps?',
        'A GC says "we already have a packout vendor on contract." Is this a dead lead? What do you do?',
        'Why is follow-up cadence important when the cycle is 6-18 months?',
      ],
      notesEN: 'Take a moment to think through these scenarios. The answers tell you whether you\'ve internalized the process. The homeowner is at step 3 waiting. The GC is not dead — explore backup and overflow. And follow-up matters because leads need you later even if they don\'t need you today.',
      notesES: 'Tómate un momento para pensar en estos escenarios. Las respuestas te dicen si has internalizado el proceso. El propietario está en el paso 3 esperando. El contratista no es un caso perdido — explora respaldo y desbordamiento. Y el seguimiento importa porque los prospectos te necesitarán después, aunque no te necesiten hoy.',
    },
  ];
}

function getLesson03() {
  return [
    {
      title: 'Everyday Terms',
      bullets: [
        '**Contents** — everything inside the home (furniture, clothes, electronics)',
        '**Structure** — the building itself (walls, roof, floors). We don\'t do structure.',
        '**Packout** — packing and removing contents from a damaged home',
        '**Pack-back** — returning everything after repairs',
        '**Loss** — the event that caused damage (fire, flood, storm)',
        '**Claim** — the insurance case, with a unique claim number',
      ],
      notesEN: 'These are the words you\'ll use every single day. The most important distinction is contents versus structure. We do contents. Restoration companies do structure. When someone asks what we do, it\'s: "We protect the contents — everything inside the home."',
      notesES: 'Estas son las palabras que usarás cada día. La distinción más importante es contenidos versus estructura. Nosotros hacemos contenidos. Las compañías de restauración hacen estructura. Cuando alguien pregunte qué hacemos, es: "Protegemos los contenidos — todo lo que está dentro de la casa."',
    },
    {
      title: 'More Everyday Terms',
      bullets: [
        '**Mitigation** — emergency response to stop damage (water extraction, board-up). Not us.',
        '**Restoration** — repairing the structure. Done by GCs/restoration companies.',
        '**Scope (of work)** — detailed list of what needs to be done + what insurance pays',
        '**Salvageable** — can be cleaned and restored',
        '**Non-salvageable** — too damaged to save',
        '**Inventory** — documented list of every item packed (photos, descriptions)',
      ],
      notesEN: 'Mitigation and restoration are what other companies do — not us. But you need to know what they mean because you\'ll hear them constantly. Scope is important because it\'s the document that authorizes our work and determines what insurance pays.',
      notesES: 'Mitigación y restauración son lo que hacen otras compañías — no nosotros. Pero necesitas saber qué significan porque los escucharás constantemente. El alcance es importante porque es el documento que autoriza nuestro trabajo y determina lo que paga el seguro.',
    },
    {
      title: 'Insurance & Estimating Terms',
      bullets: [
        '**Xactimate** — industry-standard estimating software',
        '**RCV (Replacement Cost Value)** — full cost to replace an item new',
        '**ACV (Actual Cash Value)** — RCV minus depreciation',
        '**Depreciation** — value reduction for age/wear. Released when work is done.',
        '**Supplement** — additional scope after original estimate. Very common.',
        '**O&P** — Overhead (10%) + Profit (10%). Standard industry add-on.',
      ],
      notesEN: 'You\'ll never write a Xactimate estimate, but you need to know these terms to sound credible with adjusters and GCs. When an adjuster says "we haven\'t written the scope yet," you know exactly what that means. RCV versus ACV is the most common insurance concept you\'ll encounter.',
      notesES: 'Nunca escribirás un estimado de Xactimate, pero necesitas conocer estos términos para sonar creíble con ajustadores y contratistas. Cuando un ajustador dice "aún no hemos escrito el alcance," sabes exactamente qué significa. RCV versus ACV es el concepto de seguros más común que encontrarás.',
    },
    {
      title: 'People & Roles',
      bullets: [
        '**Adjuster** — inspects damage, approves scope and vendors. Gatekeeper.',
        '**Staff adjuster** — employee of one carrier',
        '**Independent adjuster (IA)** — contractor for multiple carriers',
        '**Public adjuster (PA)** — hired by homeowner. Less common.',
        '**GC** — General Contractor, oversees the rebuild',
        '**PM** — Property Manager, manages rental/commercial properties',
        '**TPA** — Third-Party Administrator, manages claims for carriers',
      ],
      notesEN: 'Knowing these roles is critical because each one requires a different tone and approach. You have a different script for each. The adjuster is the gatekeeper. The GC is a peer-level business conversation. The PM is about preparedness. Know who you\'re talking to before you dial.',
      notesES: 'Conocer estos roles es crítico porque cada uno requiere un tono y enfoque diferente. Tienes un script diferente para cada uno. El ajustador es el guardián. El contratista es una conversación de negocios entre iguales. El administrador de propiedades es sobre preparación. Sabe con quién hablas antes de marcar.',
    },
    {
      title: 'Our Company Terms',
      bullets: [
        '**Fire lead** — homeowner who just had a fire. Priority 1. Source: fireleads.com',
        '**azfirehelp.com** — our homeowner resource site. Text after every fire lead call.',
        '**Sales line** — (623) 300-2119. Your outbound number.',
        '**Daily summary** — end-of-day report to Matt via Google Chat',
        '**Escalation** — when a lead is hot enough for Matt. Escalate immediately.',
      ],
      notesEN: 'These are specific to us. The three most important: fire leads are always Priority 1. azfirehelp.com gets texted after every fire lead call or voicemail, no exceptions. And escalation means the lead is real — Matt needs to know right now, not at end of day.',
      notesES: 'Estos son específicos de nuestra empresa. Los tres más importantes: los leads de incendio siempre son Prioridad 1. azfirehelp.com se envía por texto después de cada llamada o buzón de voz de lead de incendio, sin excepciones. Y escalación significa que el prospecto es real — Matt necesita saber ahora mismo, no al final del día.',
    },
    {
      type: 'quiz',
      title: 'Quick Quiz — Match the Term',
      bullets: [
        '1. RCV → ?',
        '2. Mitigation → ?',
        '3. Supplement → ?',
        '4. Pack-back → ?',
        '',
        'A. Additional scope after original estimate',
        'B. Full cost to replace an item new',
        'C. Emergency response to stop further damage',
        'D. Returning contents to the repaired home',
      ],
      notesEN: 'Answers: 1-B, 2-C, 3-A, 4-D. If you got all four, you\'re in great shape. If not, re-read the glossary — these terms will come up on calls every day.',
      notesES: 'Respuestas: 1-B, 2-C, 3-A, 4-D. Si acertaste las cuatro, vas muy bien. Si no, vuelve a leer el glosario — estos términos aparecerán en llamadas todos los días.',
    },
  ];
}

function getLesson04() {
  return [
    {
      title: 'Overview — The 4 Types',
      bullets: [
        '**Homeowners** (fire/water leads) — Priority 1 → Script 1',
        '**GCs & Restoration Companies** — Priority 3 → Script 2',
        '**Insurance Adjusters** — Priority 4 → Script 3',
        '**Property Managers** — Priority 5 → Script 4',
      ],
      notesEN: 'Notice the priority numbers. Homeowners are always first — they\'re the most time-sensitive. GCs are next because one relationship means steady recurring work. Adjusters are high-value but long-cycle. Property managers are lower frequency but still important. You\'ll work all four types every week.',
      notesES: 'Nota los números de prioridad. Los propietarios siempre son primero — son los más urgentes. Los contratistas son los siguientes porque una relación significa trabajo recurrente constante. Los ajustadores son de alto valor pero ciclo largo. Los administradores de propiedades son de menor frecuencia pero igualmente importantes. Trabajarás los cuatro tipos cada semana.',
    },
    {
      title: 'Homeowners — Who They Are',
      bullets: [
        'Regular people who just had a disaster',
        'Stressed, scared, probably displaced',
        'Overwhelmed with insurance paperwork',
        'Many don\'t know packout exists',
        'When you explain it + "insurance covers it" → life-changing news',
      ],
      notesEN: 'Put yourself in their shoes. Their house just caught fire or flooded. They\'re living in a hotel or with family. They\'re scared about losing their stuff — the family photos, the kids\' things, irreplaceable items. And then you call and tell them there\'s a service that protects all of it, and insurance pays. That\'s powerful.',
      notesES: 'Ponte en sus zapatos. Su casa se acaba de incendiar o inundar. Están viviendo en un hotel o con familia. Tienen miedo de perder sus cosas — las fotos familiares, las cosas de los niños, artículos irremplazables. Y entonces tú llamas y les dices que hay un servicio que protege todo, y el seguro paga. Eso es poderoso.',
    },
    {
      title: 'Homeowners — Your Approach',
      bullets: [
        'Tone: Empathetic, calm, helpful. You are NOT selling.',
        'Lead with: "Are you and your family safe?"',
        'Get: insurance carrier, adjuster name, competitor check, callback number',
        'After call: ALWAYS text azfirehelp.com link',
        'If hot: escalate to Matt immediately',
      ],
      notesEN: 'The tone is everything here. You\'re not a salesperson — you\'re a concerned professional offering help during the worst week of their life. Lead with empathy. Ask about their safety first. Then gently explain what we do. If they\'re ready, escalate to Matt. If not, follow up in 2 days.',
      notesES: 'El tono lo es todo aquí. No eres una vendedora — eres una profesional preocupada ofreciendo ayuda durante la peor semana de su vida. Lidera con empatía. Pregunta por su seguridad primero. Luego explica gentilmente lo que hacemos. Si están listos, escala a Matt. Si no, da seguimiento en 2 días.',
    },
    {
      title: 'GCs & Restoration Companies',
      bullets: [
        'Businesses that do fire/water restoration',
        'They get the job first, need someone for contents',
        'Some do packout in-house, many subcontract',
        'One good relationship = steady stream of jobs',
        'Tone: B2B, professional, peer-level. No hard sell.',
      ],
      notesEN: 'GCs are a business-to-business conversation. You\'re one professional talking to another. They already know what packout is — you don\'t need to explain the industry. What you need to find out is: who do they use now, how long, contract or job-by-job, and is there room for a backup vendor? Even happy clients want a backup.',
      notesES: 'Los contratistas son una conversación de negocio a negocio. Eres una profesional hablando con otro profesional. Ya saben qué es el packout — no necesitas explicar la industria. Lo que necesitas descubrir es: a quién usan ahora, desde cuándo, contrato o por trabajo, y ¿hay espacio para un proveedor de respaldo? Incluso los clientes satisfechos quieren un respaldo.',
    },
    {
      title: 'GCs — What You Need',
      bullets: [
        'Do they handle packout in-house or sub it out?',
        'Current vendor name + how long + contract status',
        'Volume: how many packout jobs per month?',
        'Decision maker for packout referrals',
        'Overflow or backup needs?',
        'Close: "Would it make sense for Matt to introduce himself?"',
      ],
      notesEN: 'Log every piece of intel. Even if they say "we\'re happy with our vendor," that\'s useful information. The close is always low-pressure: would it make sense for our owner Matt to introduce himself? No commitment, just an introduction. You\'re planting a seed.',
      notesES: 'Registra cada pieza de información. Incluso si dicen "estamos contentos con nuestro proveedor," esa es información útil. El cierre siempre es de baja presión: ¿tendría sentido que nuestro dueño Matt se presente? Sin compromiso, solo una introducción. Estás plantando una semilla.',
    },
    {
      title: 'Insurance Adjusters',
      bullets: [
        'Inspect damage, write scopes, approve vendors',
        'One adjuster relationship = 5-10 jobs/year',
        'LONGEST sales cycle — they don\'t switch quickly',
        'Tone: Professional, respectful of time, knowledgeable',
        'Your job: get the intro. Matt closes.',
      ],
      notesEN: 'Adjusters are the holy grail. One good adjuster who trusts us can generate 5 to 10 jobs per year — just from their claims. But this is a long game. You\'re introducing us, not selling. Be professional, respect their time, and demonstrate that you know the industry. Matt handles all adjuster relationship closings.',
      notesES: 'Los ajustadores son el santo grial. Un buen ajustador que confía en nosotros puede generar 5 a 10 trabajos por año — solo de sus reclamaciones. Pero este es un juego a largo plazo. Estás presentándonos, no vendiendo. Sé profesional, respeta su tiempo y demuestra que conoces la industria. Matt maneja todos los cierres de relaciones con ajustadores.',
    },
    {
      title: 'Property Managers',
      bullets: [
        'Manage apartments, HOAs, commercial, rentals',
        'When a unit has a loss, they need someone NOW',
        'Most don\'t have a packout vendor on file',
        'Tone: Solution-oriented, preparedness-focused',
        '"Do you have a vendor in place for when this happens?"',
      ],
      notesEN: 'Property managers are the easiest conversation because you\'re usually not competing with anyone. Most PMs have never thought about packout until they need it. You\'re filling a gap they didn\'t know existed. The pitch is simple: "Do you have someone on file for when a unit has a fire or flood?" Usually the answer is no.',
      notesES: 'Los administradores de propiedades son la conversación más fácil porque usualmente no compites con nadie. La mayoría nunca ha pensado en packout hasta que lo necesitan. Estás llenando un vacío que no sabían que existía. El argumento es simple: "¿Tienen a alguien en archivo para cuando una unidad tenga un incendio o inundación?" Usualmente la respuesta es no.',
    },
    {
      title: 'The Golden Rule',
      bullets: [
        'You discover, qualify, and escalate',
        'Matt closes',
        'NEVER discuss pricing',
        'NEVER offer referral fees or gifts',
        'NEVER make commitments — "Let me have Matt confirm that"',
      ],
      notesEN: 'This applies to every call you make, regardless of customer type. You are the opener, not the closer. Your job is to find opportunities and hand them to Matt. Never discuss money, never make promises, and never go off-script. If in doubt, say "Let me have Matt confirm that" and move on.',
      notesES: 'Esto aplica a cada llamada que hagas, sin importar el tipo de cliente. Tú eres la que abre, no la que cierra. Tu trabajo es encontrar oportunidades y pasárselas a Matt. Nunca discutas dinero, nunca hagas promesas, y nunca te salgas del script. Si tienes duda, di "Déjame que Matt confirme eso" y continúa.',
    },
    {
      type: 'quiz',
      title: 'Reflection',
      bullets: [
        'A homeowner says "I don\'t know if insurance covers this." What do you say?',
        'A GC says "We\'ve been with Better Box for 3 years." Dead lead?',
        'An adjuster says "Send me some info." What\'s your next step?',
      ],
      notesEN: 'The homeowner: "It does — insurance covers the full cost of packout, cleaning, storage, and pack-back. There\'s no out-of-pocket cost to you." The GC: Not dead — explore backup. "A lot of companies keep a backup on file. Would it make sense for Matt to introduce himself?" The adjuster: Send the info, log it in HubSpot, follow up in 5 days.',
      notesES: 'El propietario: "Sí lo cubre — el seguro cubre el costo completo del packout, limpieza, almacenamiento y pack-back. No hay costo de bolsillo para usted." El contratista: No está muerto — explora respaldo. "Muchas compañías mantienen un respaldo en archivo. ¿Tendría sentido que Matt se presente?" El ajustador: Envía la información, regístralo en HubSpot, da seguimiento en 5 días.',
    },
  ];
}

function getLesson05() {
  return [
    {
      title: 'Why This Matters',
      bullets: [
        'Adjusters and contractors work with multiple vendors — they hear pitches all day',
        'Trash-talking competitors makes YOU look bad, not them',
        'Knowing the landscape helps you position us with confidence',
        'Sometimes our competitors are also our overflow partners',
      ],
      notesEN: 'Here\'s the reality: the people you\'re calling — adjusters, project managers, contractors — they already work with someone for contents. Your job isn\'t to convince them that their current vendor is terrible. Your job is to position 1-800-Packouts as a strong option they should also have in their rotation. And sometimes, the company they already use might actually refer overflow work to us. So burning bridges helps no one.',
      notesES: 'Esta es la realidad: las personas a las que llamas — ajustadores, gerentes de proyecto, contratistas — ya trabajan con alguien para contenidos. Tu trabajo no es convencerlos de que su proveedor actual es terrible. Tu trabajo es posicionar a 1-800-Packouts como una opcion fuerte que tambien deberian tener en su rotacion. Y a veces, la empresa que ya usan nos podria referir trabajo de desbordamiento. Asi que quemar puentes no ayuda a nadie.',
    },
    {
      title: 'The Key Players in the Phoenix Valley',
      bullets: [
        '**Better Box** — Large contents company, well-established in the Valley',
        '**Cardinal Contents** — Another local competitor with insurance relationships',
        '**General restoration companies** — Some do contents in-house (ServiceMaster, SERVPRO, PuroClean)',
        '**Small/independent operators** — Solo operators or small crews, often subcontracting',
      ],
      notesEN: 'These are the names you\'ll hear most often. Better Box and Cardinal are the two dedicated contents companies you\'ll run into. But you\'ll also encounter general restoration companies that handle contents as part of their full-service offering — they pack out as an add-on, not as their specialty. And then there are small independent operators. Each has strengths and weaknesses, but remember: we never discuss their weaknesses on calls. We only talk about our strengths.',
      notesES: 'Estos son los nombres que vas a escuchar con mas frecuencia. Better Box y Cardinal son las dos empresas dedicadas a contenidos que vas a encontrar. Pero tambien te vas a encontrar con empresas de restauracion general que manejan contenidos como parte de su servicio completo — empacan como un servicio adicional, no como su especialidad. Y luego hay operadores independientes pequenos. Cada uno tiene fortalezas y debilidades, pero recuerda: nunca discutimos sus debilidades en las llamadas. Solo hablamos de nuestras fortalezas.',
    },
    {
      title: 'When You Hear a Competitor\'s Name',
      bullets: [
        'Stay calm and professional — don\'t react negatively',
        'Say: "Oh great, they\'re good people" or "I\'ve heard of them"',
        'Log the competitor name in HubSpot under Intel Gathered',
        'Pivot to backup/overflow angle',
        'Never ask "What don\'t you like about them?"',
      ],
      notesEN: 'This is a critical moment on any call. When someone says "We already use Better Box" or "Cardinal handles our contents," your instinct might be to compete. Don\'t. Instead, acknowledge it positively and pivot. Say something like: "That\'s great — they do good work. A lot of companies we work with like having a backup option for when their primary vendor is at capacity. Would it make sense to have us as a backup?" This approach is non-threatening and opens the door without burning anything down.',
      notesES: 'Este es un momento critico en cualquier llamada. Cuando alguien dice "Ya usamos Better Box" o "Cardinal maneja nuestros contenidos," tu instinto podria ser competir. No lo hagas. En cambio, reconocelo positivamente y cambia el enfoque. Di algo como: "Que bien — ellos hacen buen trabajo. Muchas empresas con las que trabajamos prefieren tener una opcion de respaldo para cuando su proveedor principal esta a capacidad. Tendria sentido tenernos como respaldo?"',
    },
    {
      title: 'The Backup/Overflow Angle',
      bullets: [
        'Most restoration companies need more than one contents vendor',
        'Busy seasons (monsoon, holidays, fire season) overwhelm single vendors',
        'Adjusters get frustrated when their vendor can\'t respond quickly',
        'Being "Vendor #2" often leads to becoming Vendor #1 over time',
        'Frame it as: "We\'d love to be in your rotation"',
      ],
      notesEN: 'The backup and overflow angle is your best friend. It\'s non-confrontational, it\'s true, and it works. During busy seasons — monsoon flooding, fire season, even just a random week when three water losses hit at once — their primary vendor might not be able to respond for 48 hours. That\'s when they call us. And once they see our quality of work, our documentation, our speed — we often move from backup to primary.',
      notesES: 'El angulo de respaldo y desbordamiento es tu mejor amigo. No es confrontacional, es verdad, y funciona. Durante las temporadas ocupadas — inundaciones de monzon, temporada de incendios, incluso una semana aleatoria cuando tres perdidas de agua llegan al mismo tiempo — su proveedor principal podria no poder responder por 48 horas. Ahi es cuando nos llaman. Y una vez que ven nuestra calidad de trabajo, nuestra documentacion, nuestra velocidad — frecuentemente pasamos de respaldo a primarios.',
    },
    {
      title: 'How 1-800-Packouts Differentiates',
      bullets: [
        '**Contents-only focus** — This is ALL we do. Specialists, not generalists',
        '**Insurance-approved vendor** — We work within the insurance claims process',
        '**Encircle documentation** — Photo documentation of every item, every room',
        '**Local & owner-operated** — Matt is here in the Valley, not a distant corporate office',
        '**Capacity for overflow** — We actively want overflow and backup work',
      ],
      notesEN: 'These are the five things that make us different, and you should know them cold. First, we only do contents. Second, we\'re insurance-approved. Third, our Encircle documentation is thorough. Fourth, Matt is a local owner. And fifth, we actively want overflow work, which makes us easy to say yes to.',
      notesES: 'Estas son las cinco cosas que nos hacen diferentes, y deberias saberlas de memoria. Primero, solo hacemos contenidos. Segundo, somos un proveedor aprobado por seguros. Tercero, nuestra documentacion de Encircle es minuciosa. Cuarto, Matt es un dueno local. Y quinto, activamente queremos trabajo de desbordamiento, lo que nos hace faciles de aceptar.',
    },
    {
      title: '"Contents-Only" — Why Specialization Matters',
      bullets: [
        'General restoration companies spread attention across demo, rebuild, mold, AND contents',
        'Contents often gets treated as an afterthought by generalists',
        'We eat, sleep, and breathe contents — packing, cleaning, storage, pack-back',
        'Our team is trained specifically for handling personal belongings',
        'Specialization = faster response, better documentation, fewer claims issues',
      ],
      notesEN: 'When a general restoration company does contents, it\'s usually the last thing on their priority list. They\'re focused on the mitigation, the demo, the rebuild. Contents is an add-on for them. For us, it\'s everything. That level of specialization means fewer mistakes, better documentation, and happier homeowners.',
      notesES: 'Cuando una empresa de restauracion general hace contenidos, usualmente es lo ultimo en su lista de prioridades. Estan enfocados en la mitigacion, la demolicion, la reconstruccion. Los contenidos son un complemento para ellos. Para nosotros, es todo. Ese nivel de especializacion significa menos errores, mejor documentacion, y propietarios mas contentos.',
    },
    {
      title: 'What NOT to Do — The Three Nevers',
      bullets: [
        '**Never trash-talk a competitor** — "They\'re terrible" is off-limits',
        '**Never compare pricing** — "We\'re cheaper than Cardinal" is a losing game',
        '**Never promise we\'re "better"** — Instead say "We\'d be a great option for you"',
        'If pushed to compare: "I can\'t speak to their process — I can only tell you about ours"',
      ],
      notesEN: 'These are hard rules, not guidelines. Never trash-talk. Never compare pricing. And never say "we\'re better." If someone pushes you to compare, the perfect deflection is: "I really can\'t speak to their process — I can only tell you about ours. And what I can tell you is that we specialize in contents, we document everything through Encircle, and we\'d love to be in your rotation."',
      notesES: 'Estas son reglas estrictas, no sugerencias. Nunca hables mal. Nunca compares precios. Y nunca digas "somos mejores." Si alguien te presiona para comparar, la desviacion perfecta es: "Realmente no puedo hablar sobre su proceso — solo puedo contarte sobre el nuestro. Y lo que puedo decirte es que nos especializamos en contenidos, documentamos todo a traves de Encircle, y nos encantaria estar en tu rotacion."',
    },
    {
      title: 'Handling Common Objections',
      bullets: [
        '"We\'re happy with our current vendor" → "Great! Would it make sense to have a backup for busy times?"',
        '"We\'ve used them for years" → "That relationship is valuable. We\'d love to be an additional resource."',
        '"Why should I switch?" → "I\'m not asking you to switch — I\'m offering a backup option."',
        '"Your competitor offered a better deal" → "Our value is in our specialization and documentation."',
      ],
      notesEN: 'These are the four objections you\'ll hear most often. Notice a pattern? You\'re never attacking their current relationship. You\'re positioning yourself alongside it. The "backup" framing takes all the pressure off the prospect.',
      notesES: 'Estas son las cuatro objeciones que vas a escuchar con mas frecuencia. Notas un patron? Nunca estas atacando su relacion actual. Te estas posicionando al lado de ella. El encuadre de "respaldo" quita toda la presion del prospecto.',
    },
    {
      title: 'Logging Competitor Intelligence',
      bullets: [
        'Always note competitor name in HubSpot under "Intel Gathered"',
        'Record: Which competitor? How long? Happy or stuck? Exclusive or open?',
        'This data helps Matt understand market positioning',
        'Patterns emerge — who\'s losing accounts, who\'s overloaded, where the gaps are',
        'Your intel gathering is just as valuable as setting a meeting',
      ],
      notesEN: 'Every time you hear a competitor\'s name, that\'s valuable market intelligence. Log it. Note which competitor, how long, whether they seem happy or just stuck, and whether they\'re open to alternatives. Matt reviews these notes regularly.',
      notesES: 'Cada vez que escuchas el nombre de un competidor, eso es inteligencia de mercado valiosa. Registrala. Anota cual competidor, cuanto tiempo, si parecen contentos o solo atascados, y si estan abiertos a alternativas. Matt revisa estas notas regularmente.',
    },
    {
      title: 'The Right Mindset',
      bullets: [
        'We don\'t need to "beat" anyone — we need to be known and available',
        'The Phoenix Valley has enough work for multiple contents companies',
        'Respect builds reputation; trash-talk destroys it',
        'Our goal: Be the first call when their primary vendor can\'t respond',
        'Long-term relationships > short-term wins',
      ],
      notesEN: 'This isn\'t a zero-sum game. The Phoenix Valley is a big market with thousands of insurance claims every year. There\'s enough work for us and for our competitors. Our job isn\'t to destroy anyone — it\'s to make sure that when they need contents work done, they think of 1-800-Packouts.',
      notesES: 'Esto no es un juego de suma cero. El Valle de Phoenix es un mercado grande con miles de reclamos de seguro cada ano. Hay suficiente trabajo para nosotros y para nuestros competidores. Nuestro trabajo no es destruir a nadie — es asegurarnos de que cuando necesiten trabajo de contenidos, piensen en 1-800-Packouts.',
    },
    {
      type: 'quiz',
      title: 'Quiz / Reflection',
      bullets: [
        '1. An adjuster says "We already use Better Box for all our contents." What do you say?',
        '2. A PM asks "Why are you guys better than Cardinal?" How do you respond?',
        '3. You hear a competitor dropped the ball. Do you mention it to the next prospect?',
        '4. Name three ways 1-800-Packouts differentiates from general restoration companies.',
        '5. What do you log in HubSpot when you hear a competitor\'s name?',
      ],
      notesEN: 'For question 1, remember the backup/overflow angle. For question 2, the deflection technique. For question 3, the answer is always no. For question 4, think contents-only focus, Encircle documentation, insurance-approved, local owner-operated, overflow capacity. For question 5, log competitor name, relationship length, satisfaction level, and openness to alternatives.',
      notesES: 'Para la pregunta 1, recuerda el angulo de respaldo. Para la pregunta 2, la tecnica de desviacion. Para la pregunta 3, la respuesta siempre es no. Para la pregunta 4, enfoque solo en contenidos, documentacion de Encircle, aprobado por seguros, operado por dueno local, capacidad de desbordamiento. Para la pregunta 5, registra nombre del competidor, duracion de la relacion, nivel de satisfaccion, y apertura a alternativas.',
    },
  ];
}

function getLesson06() {
  return [
    {
      title: 'What Is fireleads.com?',
      bullets: [
        'Monitors fire department dispatch data in Maricopa + Pima counties',
        'Real-time alerts with: address, owner name, phone, incident details',
        'Alerts arrive via Gmail (Fire Leads label) + Google Chat',
        'Check BOTH every morning — first task of the day at 8 AM',
      ],
      notesEN: 'fireleads.com watches fire department dispatches across the Phoenix and Tucson metros. When a structure fire is reported, we get an alert with the homeowner\'s info. These come to your Gmail and Google Chat. Checking these is literally the first thing you do every morning.',
      notesES: 'fireleads.com monitorea los despachos de bomberos en las áreas metropolitanas de Phoenix y Tucson. Cuando se reporta un incendio estructural, recibimos una alerta con la información del propietario. Estas llegan a tu Gmail y Google Chat. Revisar estas alertas es literalmente lo primero que haces cada mañana.',
    },
    {
      title: 'Why Priority 1',
      bullets: [
        '**Speed wins** — first company to call usually gets the job',
        '**Direct-to-homeowner** — no gatekeeper, no vendor list',
        '**High emotional state** — calm, helpful voice stands out',
        '**Less competition** — competitors don\'t have fire lead monitoring',
        'The SLA: call by NOON the next morning. Always.',
      ],
      notesEN: 'Four reasons fire leads are Priority 1. First: speed. The first packout company to reach a homeowner usually wins. Second: no gatekeeper. Third: they\'re in crisis, so a calm voice matters. Fourth: our competitors don\'t have this monitoring. We\'re often the only packout company that calls.',
      notesES: 'Cuatro razones por las que los leads de incendio son Prioridad 1. Primero: velocidad. Segundo: sin intermediarios. Tercero: están en crisis, así que una voz calmada importa. Cuarto: nuestros competidores no tienen este monitoreo. A menudo somos la única compañía de packout que llama.',
    },
    {
      title: 'The Workflow — Steps 1-4',
      bullets: [
        '1. Alert arrives (Gmail + Google Chat)',
        '2. Call next morning by noon — even for 2 AM fires',
        '3. If they answer → Script 1. Lead with "Are you and your family safe?"',
        '4. If voicemail → leave VM script (under 30 seconds)',
      ],
      notesEN: 'The workflow is simple and you follow it every time. Alert comes in, you call the next morning. If they answer, follow Script 1 — empathy first, explain what we do, get their insurance info. If voicemail, leave the scripted VM. Keep it under 30 seconds.',
      notesES: 'El flujo es simple y lo sigues cada vez. Llega la alerta, llamas la mañana siguiente. Si contestan, sigue el Script 1 — empatía primero, explica lo que hacemos, obtén su información de seguro. Si es buzón de voz, deja el VM del script. Mantenlo bajo 30 segundos.',
    },
    {
      title: 'The Workflow — Steps 5-8',
      bullets: [
        '5. ALWAYS send text with azfirehelp.com link — no exceptions',
        '6. Log in HubSpot using full note template',
        '7. If HOT → escalate to Matt IMMEDIATELY via Chat or call',
        '8. Follow up in 2 days if no response. Max 3 attempts over 7 days.',
      ],
      notesEN: 'After every fire lead call or voicemail, you text the azfirehelp.com link. Every time, no exceptions. Then log it in HubSpot with the full template. If the lead is hot, escalate to Matt right now, not at end of day. Then set your follow-up: 2 days later, max 3 attempts total over one week.',
      notesES: 'Después de cada llamada o buzón de voz de lead de incendio, envías por texto el enlace de azfirehelp.com. Cada vez, sin excepciones. Luego regístralo en HubSpot con la plantilla completa. Si el lead está caliente, escala a Matt ahora mismo, no al final del día. Luego programa tu seguimiento: 2 días después, máximo 3 intentos en una semana.',
    },
    {
      title: 'azfirehelp.com',
      bullets: [
        'Homeowner-facing resource website',
        'Fire damage insurance guide + recovery checklist',
        '"Who does what after a fire" explainer',
        'Text template: "Hi [NAME], this is [YOUR NAME] from 1-800-Packouts..."',
        'Builds credibility + keeps us top of mind',
      ],
      notesEN: 'azfirehelp.com is our secret weapon. It gives the homeowner something real to look at — a guide, a checklist, useful information. It builds trust because we\'re not just calling to sell, we\'re providing help. Always send it. The text template is in your Playbook — use it word for word.',
      notesES: 'azfirehelp.com es nuestra arma secreta. Le da al propietario algo real que ver — una guía, una lista de verificación, información útil. Construye confianza porque no solo estamos llamando para vender, estamos brindando ayuda. Siempre envíalo. La plantilla de texto está en tu Playbook — úsala palabra por palabra.',
    },
    {
      title: 'Common Scenarios',
      bullets: [
        '"How did you get my number?" → We monitor fire incidents to offer help',
        'Already have a company → Log competitor, don\'t push',
        'Haven\'t filed claim → "That\'s okay, I\'ll follow up in a few days"',
        'They\'re emotional → Let them talk. "I\'m so sorry you\'re going through this."',
      ],
      notesEN: 'You\'ll encounter these scenarios regularly. The most important one: when someone is emotional, just listen. Don\'t rush, don\'t pivot to your pitch. Be the calm voice in their chaos. The sale takes care of itself when they trust you.',
      notesES: 'Encontrarás estos escenarios regularmente. El más importante: cuando alguien está emocional, solo escucha. No te apresures, no cambies a tu argumento. Sé la voz calmada en su caos. La venta se cuida sola cuando confían en ti.',
    },
    {
      type: 'quiz',
      title: 'Reflection — Walk Through It',
      bullets: [
        'It\'s 8:05 AM. You check Gmail and see a fire lead from last night —',
        'structure fire at 123 Oak St, owner Jane Smith.',
        '',
        'What do you do, step by step?',
        '',
        '(Think through ALL 8 steps before checking the speaker notes)',
      ],
      notesEN: 'The answer: Call Jane by noon. Follow Script 1 — empathy first. If she answers, get insurance carrier, adjuster, competitor check. If voicemail, leave the VM script under 30 seconds. Either way, text azfirehelp.com immediately after. Log everything in HubSpot. If she\'s hot, message Matt on Chat right now. Set follow-up for 2 days out.',
      notesES: 'La respuesta: Llama a Jane antes del mediodía. Sigue el Script 1 — empatía primero. Si contesta, obtén aseguradora, ajustador, verificación de competidor. Si es buzón de voz, deja el VM del script en menos de 30 segundos. De cualquier forma, envía azfirehelp.com por texto inmediatamente después. Registra todo en HubSpot. Si está interesada, mensaje a Matt por Chat ahora mismo. Programa seguimiento para 2 días.',
    },
  ];
}

function getLesson07() {
  return [
    {
      title: 'Why It Matters',
      bullets: [
        'Matt uses your notes to decide which leads to follow up on',
        'Matt prepares for meetings using your intel',
        'Pipeline and activity tracking depends on your notes',
        'Matt spot-checks quality weekly',
        '**If a call doesn\'t have a note, it didn\'t happen**',
      ],
      notesEN: 'Your HubSpot notes are not busywork. They\'re the raw material Matt uses to close deals. When Matt meets with a GC or adjuster, he pulls up your notes to see what you learned. When he reviews your pipeline, he reads your notes. This is how he knows what\'s happening in the field.',
      notesES: 'Tus notas en HubSpot no son trabajo innecesario. Son la materia prima que Matt usa para cerrar tratos. Cuando Matt se reúne con un contratista o ajustador, revisa tus notas para ver qué aprendiste. Cuando revisa tu pipeline, lee tus notas. Así es como sabe qué está pasando en el campo.',
    },
    {
      title: 'The Note Template — Header',
      bullets: [
        '**Call Type**: Fire Lead / Cold - GC / Cold - Adjuster / Cold - PM / Follow-Up',
        '**Outcome**: Live Conversation / Voicemail / No Answer / Wrong Number / Gatekeeper',
        '**Contact**: Name, title if known',
        '**Company**: Company name if applicable',
      ],
      notesEN: 'The first four fields set the context. Call Type tells Matt what kind of lead this is. Outcome tells him whether you actually talked to someone. Contact and Company identify who. Use this exact structure every time — consistency matters because Matt reads dozens of these per week.',
      notesES: 'Los primeros cuatro campos establecen el contexto. Tipo de Llamada le dice a Matt qué tipo de prospecto es. Resultado le dice si realmente hablaste con alguien. Contacto y Compañía identifican quién. Usa esta estructura exacta cada vez — la consistencia importa porque Matt lee docenas de estas por semana.',
    },
    {
      title: 'The Intel Section',
      bullets: [
        'Current packout vendor: [name or "none"]',
        'Volume: [X jobs/month or "unknown"]',
        'Contract status: [locked in / job-by-job / unknown]',
        'Decision maker: [name + title]',
        'Insurance carrier: [name if applicable]',
        'Adjuster: [name if applicable]',
        'Interest level: [cold / lukewarm / warm / hot]',
      ],
      notesEN: 'This is the most valuable part. Every field gives Matt ammunition. "Unknown" is a valid answer — it tells Matt what to dig into next time. Interest level is your gut read: cold means they\'re not interested, hot means escalate right now. Be honest in your assessment.',
      notesES: 'Esta es la parte más valiosa. Cada campo le da a Matt información útil. "Desconocido" es una respuesta válida — le dice a Matt qué investigar la próxima vez. El nivel de interés es tu evaluación: frío significa que no están interesados, caliente significa escalar ahora. Sé honesta en tu evaluación.',
    },
    {
      title: 'Next Steps',
      bullets: [
        'ALWAYS include specific action + specific date',
        'Good: "Follow up Wednesday 3/19, ask about adjuster assignment"',
        'Bad: "Follow up later"',
        'If hot: "Escalate to Matt — warm lead, asking about pricing"',
        'If dead: "No interest, remove from active list"',
      ],
      notesEN: 'Next Steps is where most people get lazy. Don\'t be vague. "Follow up later" is useless — when? About what? Always include a date and a reason. This is how you build a follow-up system that actually works.',
      notesES: 'Próximos Pasos es donde la mayoría se pone perezosa. No seas vaga. "Dar seguimiento después" es inútil — ¿cuándo? ¿sobre qué? Siempre incluye una fecha y una razón. Así es como construyes un sistema de seguimiento que realmente funciona.',
    },
    {
      title: 'Contact Property Updates',
      bullets: [
        'Update Lead Status after every interaction (New → Attempted → Connected → Qualified)',
        'Update phone if they gave a better number',
        'Associate contact with company record',
        'Notes field on contact = quick summary only, not call logs',
      ],
      notesEN: 'After logging your call note, also update the contact record itself. Lead Status should reflect where they are. If they gave you a cell phone instead of their office line, update the phone. Associate them with their company so Matt can see the full relationship.',
      notesES: 'Después de registrar tu nota de llamada, también actualiza el registro del contacto. El Estado del Lead debe reflejar dónde están. Si te dieron un celular en vez de su línea de oficina, actualiza el teléfono. Asócialos con su compañía para que Matt pueda ver la relación completa.',
    },
    {
      title: 'Common Mistakes',
      bullets: [
        'Logging hours later — log immediately while it\'s fresh',
        'Vague next steps — always include date + action + reason',
        'Missing intel fields — even "unknown" is valuable',
        'Not logging voicemails — VMs get logged too',
        'Editing someone else\'s notes — NEVER. Only add your own.',
      ],
      notesEN: 'These are the five mistakes every new SDR makes. The biggest one is logging late. Right after you hang up, before you dial the next number, log the call. Even quick notes are better than detailed notes written from memory three hours later. And never, ever edit someone else\'s notes.',
      notesES: 'Estos son los cinco errores que cada nuevo SDR comete. El más grande es registrar tarde. Justo después de colgar, antes de marcar el siguiente número, registra la llamada. Incluso notas rápidas son mejores que notas detalladas escritas de memoria tres horas después. Y nunca, nunca edites las notas de otra persona.',
    },
    {
      type: 'quiz',
      title: 'Practice — Log This Call',
      bullets: [
        'You called a GC named Mike Torres at Desert Restoration LLC.',
        'He answered. They use Better Box for packout, ~4 jobs/month, job-by-job.',
        'He\'s the decision maker. Said they might need overflow help in summer.',
        'Seemed lukewarm. You said Matt would reach out.',
        '',
        'Write the full HubSpot note using the template.',
        '(Check speaker notes for the answer)',
      ],
      notesEN: 'Call Type: Cold - GC. Outcome: Live Conversation. Contact: Mike Torres, decision maker. Company: Desert Restoration LLC. Intel: vendor Better Box, 4 jobs/month, job-by-job, interested in overflow. Interest: lukewarm. Next Steps: Matt to reach out this week, follow up in 5 days.',
      notesES: 'Tipo de Llamada: Frío - CG. Resultado: Conversación en Vivo. Contacto: Mike Torres, tomador de decisiones. Compañía: Desert Restoration LLC. Intel: proveedor Better Box, 4 trabajos/mes, por trabajo, interesado en desbordamiento. Interés: tibio. Próximos Pasos: Matt contactar esta semana, seguimiento en 5 días.',
    },
  ];
}
