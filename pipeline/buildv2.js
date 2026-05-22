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
 * WORK_META IDs: add employer id→metadata entries here for legacy id-only scripts (v2.3+ scripts carry inline metadata)
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
const OUT = path.join(process.cwd(), 'output');

// ── WORK METADATA LOOKUP ─────────────────────────────────────────────────────
// To add employer: add entry here + bullets in master_resume_data.json.
// haiku_generate.js scripts use {id, bullets} only — metadata resolved here.
// Inline metadata in the data object always takes priority (backward compat).
// Replace id keys and values with your real employer data in your local environment.
// These match the work IDs in master_resume_data.json.
const WORK_META = {
  job1: {
    title:    'Open Source Contributor',
    company:  'OpenDev / TechPath',
    location: 'Remote, US',
    dates:    'Feb. 2025 – Present'
  },
  job2: {
    title:    'Research Software Engineer',
    company:  'SimLab Foundation',
    location: 'Remote, US',
    dates:    'Jul. 2024 – Present'
  },
  job3: {
    title:    'Graduate Research Assistant',
    company:  'State University',
    location: 'Anytown, OH',
    dates:    'Aug. 2022 – Aug. 2024'
  },
  job4: {
    title:    'Research Assistant & Peer Tutor',
    company:  'Liberal Arts College',
    location: 'Anytown, IL',
    dates:    'Aug. 2018 – May 2022'
  }
};

// ── CANDIDATE DEFAULTS ───────────────────────────────────────────────────────
// Used when data.contact / data.education / data.name are not supplied
// (e.g. haiku_generate.js scripts that only set file/tagline/work/projects/skills).
// Replace with real candidate data in your local environment — do not commit PII.
const DEFAULT_CONTACT = {
  phone:     '555-555-0100',
  email:     'alex.chen@example.com',
  linkedin:  'https://linkedin.com/in/alexchen',
  portfolio: 'https://alexchen.dev'
};
const DEFAULT_NAME = 'Alex Chen';
const DEFAULT_EDUCATION = [
  { line: 'State University – Master of Science in Computer Science',      dates: 'Aug. 2022 – Dec. 2024' },
  { line: 'Liberal Arts College – B.A. Applied Mathematics & Computer Science', dates: 'Aug. 2018 – May 2022' }
];

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

// ── CONTACT ROW (dynamic) ─────────────────────────────────────────────────────
function buildContactRuns(c) {
  const runs = [];
  const sep = () => new TextRun({text: ' | ', font: F, size: SC});
  const addText = txt => { if (runs.length) runs.push(sep()); runs.push(new TextRun({text: txt, font: F, size: SC})); };
  const addLink = (label, href) => {
    const full = href && !href.startsWith('http') ? `https://${href}` : (href || '');
    if (runs.length) runs.push(sep());
    if (full) {
      runs.push(new ExternalHyperlink({link: full, children: [new TextRun({text: label, font: F, size: SC, style: 'Hyperlink'})]}));
    } else {
      runs.push(new TextRun({text: label, font: F, size: SC}));
    }
  };
  if (c.phone)     addText(c.phone);
  if (c.email)     addText(c.email);
  if (c.linkedin)  addLink('LinkedIn',  c.linkedin);
  if (c.portfolio) addLink('Portfolio', c.portfolio);
  return runs;
}

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
      const hasMeta = (w.title && w.company) || WORK_META[w.id];
      if (!hasMeta)
        throw new Error(`work[${i}] "${w.id}": provide title+company+location+dates inline, or add id to WORK_META`);
      if (!Array.isArray(w.bullets) || w.bullets.length === 0)
        throw new Error(`work[${i}] (${w.id}) must have at least 1 bullet`);
    });
  } else {
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

  // Education: data.education takes priority; fall back to DEFAULT_EDUCATION for haiku-generated scripts
  const eduData = data.education ?? DEFAULT_EDUCATION;
  const eduLines = eduData.map((e, i) =>
    el(e.line || e.display, e.dates, i === eduData.length - 1 ? 40 : 0)
  );

  const children = [
    // HEADER — defaults used when haiku-generated scripts omit name/contact
    nh(data.name || DEFAULT_NAME),
    cl(buildContactRuns(data.contact || DEFAULT_CONTACT)),
    tl(TL(tagline)),

    // EDUCATION
    sh('Education'),
    ...eduLines,

    // WORK EXPERIENCE
    sh('Work Experience'),
    ...workEntries.flatMap(w => {
      // Inline metadata takes priority; fall back to WORK_META for legacy IDs
      const m = WORK_META[w.id] || {};
      const title    = w.title    || m.title;
      const company  = w.company  || m.company;
      const location = w.location || m.location;
      const dates    = w.dates    || m.dates;
      return [wl(title, company, location, dates), ...w.bullets.map(bl)];
    }),

    // PROJECTS — inline name takes priority; ID-based lookup as fallback
    sh('Relevant Projects'),
    ...projects.flatMap((p, i) => {
      let name, url, stack, date;
      if (p.name) {
        // Inline metadata — generated scripts always use this path
        name = p.name; url = p.url || null; stack = p.stack || ''; date = p.date || '';
      } else if (p.id) {
        const meta = getProjectLookup()[p.id];
        if (!meta) throw new Error(`Unknown project id "${p.id}". Available: ${Object.keys(getProjectLookup()).join(', ')}`);
        name  = meta.name;
        url   = meta.url   || null;
        stack = meta.short_stack && meta.short_stack !== 'undefined' ? meta.short_stack : '';
        date  = meta.dates || '';
      }
      if (!name) throw new Error(`project[${i}]: missing name (pass name inline or id for lookup)`);
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
