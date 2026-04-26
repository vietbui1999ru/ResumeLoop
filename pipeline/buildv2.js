/**
 * Resume Builder v2.3 — March 2026
 *
 * Changes from v2.2:
 *   - TL() exported — tagline hard limit: 76 chars WITH spaces (1-line at 12pt Calibri)
 *   - ph() validates project header line ≤116 chars (name + ' | ' + stack + GitHub + date)
 *   - WORK_META lookup table — data.work = [{id, bullets[]}] replaces data.carb/data.udra
 *   - makeDoc supports variable work entries and variable bullets per project
 *   - Para count computed dynamically (no hard 38 assertion; prints actual count)
 *   - Backward compat: data.carb + data.udra still work (2-job legacy mode)
 *
 * DATA SHAPE (v2.3):
 *   { file, tagline, work[{id,bullets[]}], projects[{name,url,stack,date,bullets[]}], skills[{label,vals}] }
 *   OR legacy: { file, tagline, carb[5], udra[5], projects[...], skills[...] }
 *
 * WORK_META IDs: 'gitlab' | 'carboncopies' | 'udayton' | 'augustana'
 *
 * PARA COUNT formula (dynamic):
 *   3  header   : name + contact + tagline
 *   3  edu      : sh + 2 compact "School - Degree" lines
 *   1+N*(1+B_w) work    : sh + N*(wl + B_w bullets)
 *   1+P*(1+B_p) projects: sh + P*(ph + B_p bullets)
 *   1+5         skills  : sh + 5 skill rows
 *
 * TYPICAL COMBOS:
 *   2-job x 5b + 3-proj x 3b = 38  (v2.2 baseline)
 *   2-job x 5b + 3-proj x 4b = 41  (test overflow)
 *   3-job x 5b + 3-proj x 3b = 44  (3-job layout)
 *   3-job x 5b + 3-proj x 4b = 47  (likely 2-page)
 */

const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink,
  AlignmentType, TabStopType, LevelFormat, BorderStyle, ShadingType
} = require('docx');
const fs = require('fs'), path = require('path');

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const F   = 'Calibri';
const SZ  = 22;      // body: 11pt (half-points)
const SN  = 56;      // name: 28pt
const SC  = 22;      // contact row: 11pt
const SH  = 24;      // section headers + tagline: 12pt
const COL = '222A35';
const SP  = 30;
const LN  = 252;     // line spacing twips
const TAB = 10710;
const MG  = 648;     // margins ~0.45"
const BG  = 'F1F1F5';
const OUT = '/sessions/bold-dazzling-hopper/mnt/Resume Templates';

// ── WORK METADATA LOOKUP ─────────────────────────────────────────────────────
// To add employer: add entry here + bullets in master_resume_data.json
const WORK_META = {
  gitlab: {
    title:    'Open Source Contributor',
    company:  'GitLab / CodePath',
    location: 'Remote, US',
    dates:    'Feb. 2026 \u2013 Present'
  },
  carboncopies: {
    title:    'Complex Systems Research Engineer',
    company:  'Carboncopies Foundation',
    location: 'Remote, US',
    dates:    'Jul. 2025 \u2013 Present'
  },
  udayton: {
    title:    'Graduate Research Assistant',
    company:  'University of Dayton',
    location: 'Dayton, OH',
    dates:    'Aug. 2023 \u2013 Aug. 2025'
  },
  augustana: {
    title:    'Research Assistant & Peer Tutor',
    company:  'Augustana College',
    location: 'Rock Island, IL',
    dates:    'Aug. 2020 \u2013 May 2023'
  }
};

// ── VALIDATORS (all exported) ─────────────────────────────────────────────────
// T()  — bullet hard cap: 116 chars WITH spaces
const T = s => {
  if (typeof s !== 'string') throw new Error(`T() expects string, got ${typeof s}`);
  if (s.length > 116) throw new Error(`OVER 116 (${s.length}c): "${s}"`);
  return s;
};

// TL() — tagline hard cap: 76 chars WITH spaces
const TL = s => {
  if (typeof s !== 'string') throw new Error(`TL() expects string, got ${typeof s}`);
  if (s.length > 76) throw new Error(`Tagline OVER 76 (${s.length}c): "${s}"`);
  return s;
};

// ── PARAGRAPH HELPERS ────────────────────────────────────────────────────────
const nh = n => new Paragraph({
  children: [new TextRun({text: n, font: F, size: SN, bold: true})],
  alignment: AlignmentType.CENTER,
  spacing: {after: 0}
});

const cl = r => new Paragraph({
  children: r,
  alignment: AlignmentType.CENTER,
  shading: {type: ShadingType.CLEAR, fill: BG},
  spacing: {after: 80, line: LN, lineRule: 'auto'}
});

const tl = t => new Paragraph({
  children: [new TextRun({text: t, font: F, size: SH, color: COL, characterSpacing: SP})],
  alignment: AlignmentType.CENTER,
  spacing: {after: 40, line: LN, lineRule: 'auto'}
});

const sh = t => new Paragraph({
  children: [new TextRun({text: t.toUpperCase(), font: F, size: SH, bold: true, color: COL, characterSpacing: SP})],
  spacing: {before: 80, after: 40, line: LN, lineRule: 'auto'},
  border: {bottom: {style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1}}
});

// Education line: bold text + right-aligned bold dates
const el = (text, dates, after = 0) => new Paragraph({
  children: [
    new TextRun({text, font: F, size: SZ, bold: true}),
    new TextRun({text: '\t', font: F, size: SZ}),
    new TextRun({text: dates, font: F, size: SZ, bold: true})
  ],
  tabStops: [{type: TabStopType.RIGHT, position: TAB}],
  spacing: {before: 30, after, line: LN, lineRule: 'auto'}
});

// Combined work line: "Bold Title | Company — Location    Bold Dates"
const wl = (title, company, loc, dates) => new Paragraph({
  children: [
    new TextRun({text: title, font: F, size: SZ, bold: true}),
    new TextRun({text: ` | ${company} \u2014 ${loc}`, font: F, size: SZ}),
    new TextRun({text: '\t', font: F, size: SZ}),
    new TextRun({text: dates, font: F, size: SZ, bold: true})
  ],
  tabStops: [{type: TabStopType.RIGHT, position: TAB}],
  spacing: {before: 50, after: 0, line: LN, lineRule: 'auto'}
});

// Project header: "Bold Name | stack    [GitHub hyperlink]  date"
// Validates full visible line (excl. tab) <= 116 chars
const ph = (name, url, stack, date) => {
  const lineText = `${name} | ${stack}${url ? '  GitHub  ' : '  '}${date}`;
  if (lineText.length > 116)
    throw new Error(`Project header OVER 116 (${lineText.length}c): "${lineText}"`);

  const children = [
    new TextRun({text: name, font: F, size: SZ, bold: true}),
    new TextRun({text: ' | ', font: F, size: SZ}),
    new TextRun({text: stack, font: F, size: SZ}),
    new TextRun({text: '\t', font: F, size: SZ}),
  ];
  if (url) {
    children.push(new ExternalHyperlink({
      link: url,
      children: [new TextRun({text: 'GitHub', font: F, size: SZ, style: 'Hyperlink'})]
    }));
    children.push(new TextRun({text: '  ', font: F, size: SZ}));
  }
  children.push(new TextRun({text: date, font: F, size: SZ}));
  return new Paragraph({
    children,
    tabStops: [{type: TabStopType.RIGHT, position: TAB}],
    spacing: {before: 50, after: 30, line: LN, lineRule: 'auto'}
  });
};

// Bullet point
const bl = t => new Paragraph({
  children: [new TextRun({text: t, font: F, size: SZ})],
  numbering: {reference: 'bullets', level: 0},
  spacing: {after: 20, line: LN, lineRule: 'auto'}
});

// Skill row: "Bold Label | values"
const sl = (l, t) => new Paragraph({
  children: [
    new TextRun({text: l, font: F, size: SZ, bold: true}),
    new TextRun({text: ' | ' + t, font: F, size: SZ})
  ],
  spacing: {after: 0, line: LN, lineRule: 'auto'}
});

// ── CONTACT ROW (static) ─────────────────────────────────────────────────────
const contactRuns = [
  new TextRun({text: '309 631 4531', font: F, size: SC}),
  new TextRun({text: ' | ', font: F, size: SC}),
  new TextRun({text: 'buiquocviet99@gmail.com', font: F, size: SC}),
  new TextRun({text: ' | ', font: F, size: SC}),
  new ExternalHyperlink({
    link: 'https://www.linkedin.com/in/vietbui99',
    children: [new TextRun({text: 'LinkedIn', font: F, size: SC, style: 'Hyperlink'})]
  }),
  new TextRun({text: ' | ', font: F, size: SC}),
  new ExternalHyperlink({
    link: 'https://vietbui1999ru.github.io/',
    children: [new TextRun({text: 'Portfolio', font: F, size: SC, style: 'Hyperlink'})]
  }),
];

// ── PROJECT METADATA LOOKUP (from master_resume_data.json) ───────────────────
let _PROJECT_LOOKUP = null;
function getProjectLookup() {
  if (!_PROJECT_LOOKUP) {
    const mPath = path.join(__dirname, 'master_resume_data.json');
    const master = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    _PROJECT_LOOKUP = {};
    master.projects.forEach(p => { _PROJECT_LOOKUP[p.id] = p; });
  }
  return _PROJECT_LOOKUP;
}

// ── DOCUMENT BUILDER ─────────────────────────────────────────────────────────
function makeDoc(data) {
  const {tagline, projects, skills} = data;

  // Work entries: new format preferred, legacy fallback
  let workEntries;
  if (data.work) {
    workEntries = data.work;
    workEntries.forEach((w, i) => {
      if (!WORK_META[w.id])
        throw new Error(`Unknown work id "${w.id}". Valid: ${Object.keys(WORK_META).join(', ')}`);
      if (!Array.isArray(w.bullets) || w.bullets.length === 0)
        throw new Error(`work[${i}] (${w.id}) must have at least 1 bullet`);
    });
  } else {
    // Legacy: carb = carboncopies, udra = udayton
    if (!data.carb || !data.udra) throw new Error('Provide data.work OR data.carb + data.udra');
    if (data.carb.length !== 5) throw new Error(`carb must have 5 bullets, got ${data.carb.length}`);
    if (data.udra.length !== 5) throw new Error(`udra must have 5 bullets, got ${data.udra.length}`);
    workEntries = [
      {id: 'carboncopies', bullets: data.carb},
      {id: 'udayton',      bullets: data.udra}
    ];
  }

  // Validate all bullets <= 116 chars
  workEntries.forEach(w => w.bullets.forEach(b => T(b)));
  projects.forEach((p, i) => {
    if (!Array.isArray(p.bullets) || p.bullets.length === 0)
      throw new Error(`project[${i}] must have bullets array`);
    p.bullets.forEach(b => T(b));
  });

  const children = [
    // HEADER (3)
    nh('Quoc-Viet Bui'),
    cl(contactRuns),
    tl(TL(tagline)),

    // EDUCATION (3)
    sh('Education'),
    el('University of Dayton \u2013 Master of Science in Computer Science',    'Aug. 2023 \u2013 Dec. 2025'),
    el('Augustana College \u2013 B.A. Applied Mathematics & Computer Science', 'Aug. 2019 \u2013 May 2023', 40),

    // WORK EXPERIENCE
    sh('Work Experience'),
    ...workEntries.flatMap(w => {
      const m = WORK_META[w.id];
      return [wl(m.title, m.company, m.location, m.dates), ...w.bullets.map(bl)];
    }),

    // PROJECTS — supports {id, bullets} (id-lookup) or {name, url, stack, date, bullets} (explicit)
    sh('Relevant Projects'),
    ...projects.flatMap((p, i) => {
      let name, url, stack, date;
      if (p.id) {
        const meta = getProjectLookup()[p.id];
        if (!meta) throw new Error(`Unknown project id "${p.id}". Available: ${Object.keys(getProjectLookup()).join(', ')}`);
        name  = meta.name;
        url   = meta.url   || null;
        stack = meta.short_stack && meta.short_stack !== 'undefined' ? meta.short_stack : '';
        date  = meta.dates || '';
      } else {
        name = p.name; url = p.url || null; stack = p.stack || ''; date = p.date || '';
      }
      if (!name) throw new Error(`project[${i}]: missing name (pass id or explicit name)`);
      return [ph(name, url, stack, date), ...p.bullets.map(bl)];
    }),

    // SKILLS — supports plain strings 'A · B · C' or legacy {label, vals} objects
    sh('Technical Skills'),
    ...skills.map(s => typeof s === 'string'
      ? new Paragraph({children: [new TextRun({text: s, font: F, size: SZ})], spacing: {after: 0, line: LN, lineRule: 'auto'}})
      : sl(s.label, s.vals)),
  ];

  // Para count: computed, informational only
  const paraCount = children.length;
  const workDesc  = workEntries.map(w => `${w.id}(${w.bullets.length}b)`).join('+');
  const projDesc  = `${projects.length}proj x ${projects[0].bullets.length}b`;
  console.log(`  Paras: ${paraCount} [${workDesc} | ${projDesc}]`);

  return new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {paragraph: {indent: {left: 180, hanging: 180}}}
        }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: {width: 12240, height: 15840},
          margin: {top: MG, right: MG, bottom: MG, left: MG}
        }
      },
      children
    }]
  });
}

// ── BUILD HELPERS ─────────────────────────────────────────────────────────────
function build(data) {
  fs.mkdirSync(OUT, {recursive: true});
  const doc = makeDoc(data);
  return Packer.toBuffer(doc).then(buf => {
    const fp = path.join(OUT, data.file + '.docx');
    fs.writeFileSync(fp, buf);
    console.log(`\u2713 ${data.file} (${(buf.length / 1024).toFixed(1)}KB) \u2192 ${fp}`);
  });
}

function buildMany(resumes) {
  return Promise.all(resumes.map(build))
    .then(() => console.log(`\nDone. ${resumes.length} resume(s) written to ${OUT}`));
}

module.exports = {makeDoc, build, buildMany, OUT, T, TL, WORK_META, getProjectLookup};

if (require.main === module) {
  const resumes = [];
  if (resumes.length === 0) {
    console.log('No resumes defined. Add data objects to resumes array.');
    process.exit(0);
  }
  buildMany(resumes).catch(console.error);
}
