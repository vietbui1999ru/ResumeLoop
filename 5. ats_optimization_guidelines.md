# ATS Optimization Guidelines (v2 — Updated 2026-03-25)

**Source:** "I spent 8 months testing how ATS systems actually parse resumes" (2026-02-12)
**Tested Against:** Workday, Greenhouse, Lever, iCIMS, Taleo

This file is a REQUIRED pre-flight checklist. The agent MUST read and apply these rules before generating any resume.

---

## Rule 1: Exact Job Title in Tagline (10.6x callback improvement)

- The **exact job title** from the job posting MUST appear in the one-line tagline under the candidate name
- Format: `{Exact Job Title} | Tech1 · Tech2 · Tech3 · Tech4 · Tech5`
- Not a synonym. Not a creative interpretation. The exact title from the posting
- **NO Professional Summary section** — it wastes space. The tagline replaces it

## Rule 2: Single-Column Layout

- No two-column layouts (ATS reads top-to-bottom in a single stream)
- No tables for layout
- No text boxes, shapes, or graphics
- Jake's Calibri A4 DOCX template already complies

## Rule 3: Standard Section Headers

Use ONLY these section headers in this order:
1. **Education**
2. **Work Experience** (not "Experience", not "My Journey")
3. **Relevant Projects** (not "Projects", not "Portfolio")
4. **Technical Skills** (not "Skills", not "Toolkit")

**No Professional Summary section.** ATS parsers map content to database fields based on these headers. Non-standard headers cause content to be dumped into miscellaneous fields that recruiters never search.

## Rule 4: Contact Info in Body

- Contact info (name, email, phone, LinkedIn, portfolio) MUST be in the document body
- NEVER place contact info in document headers or footers
- Most ATS systems ignore header/footer content entirely

## Rule 5: Keyword Density (25-35 keywords)

- Include 25-35 role-specific keywords from the job posting
- Keywords must be naturally woven into bullet points — not listed separately
- Use the EXACT terms from the job posting (not synonyms unless the posting uses them)
- **Front-load buzzwords:** Most important keywords at the start of each bullet
- Cross-reference with `ats_keywords_*.md` files for baseline keywords per resume type

### Keyword Validation Step

After generating the resume, count unique keywords from the JD that appear in the resume:
- **Below 25:** Add more keywords naturally to bullet points
- **25-35:** Optimal range, proceed
- **Above 35:** Review for keyword stuffing, remove unnecessary repetition

## Rule 6: Consistent Date Format

- Use "Mon. YYYY" format everywhere (e.g., "Jan. 2020 -- Mar. 2023")
- NEVER mix formats
- Inconsistent formats cause ATS to miscalculate total experience

## Rule 7: Format Priority

- **DOCX is the primary submission format** — parses reliably across every ATS system tested
- PDF is secondary — use only when the application specifically requests it

## Rule 8: Anti-Patterns (NEVER do these)

- **No "new grad" language** — position as experienced engineer
- **No professional summary section** — replaced by tagline
- **No white-text keyword stuffing** — AI screening catches and penalizes it
- **No icons or emojis** — ATS sees Unicode codepoints or blanks
- **No fancy fonts** — Stick to standard serif/sans-serif (Calibri is safe)
- **No decorative elements** — Lines, borders, images waste space
- **No headers/footers for content** — ATS ignores them

## Rule 9: Bullet Point Formula

Every bullet MUST follow:
```
[Built/Designed/Architected] [what] using [tech], [action/process], [metric/impact]
```

- Front-load with the most important keyword or technology
- Include measurable impact (%, time saved, throughput, users served)
- Tell a story a non-technical hiring manager can understand
- Keep under 130 characters per bullet

## Rule 10: Skills Section Strategy

- Only list skills that match the target position
- Push important/high-demand skills to the top/front of each row
- Omit non-relevant skills to save space
- Don't self-limit — include skills even if not deeply experienced (need to pass ATS screening first)

## Rule 11: Education Compact Format

- Format: `School - Degree` on one line, dates right-aligned
- Example: `University of Dayton - Master of Science in Computer Science    Aug. 2023 -- Dec. 2025`
- Saves vertical space vs. separate school/degree lines

## Rule 12: Work Experience — Tools and Research

- List tools_used per role (what technologies were actually used on the job)
- Mention tools in context within bullets, not as a separate line
- For research roles: state **PURPOSE** of research, what was **ACHIEVED**, and what **IMPACT** it produced
- Frame security research as: "Improved security/safety of systems through research and experimentation"
- Co-authored papers: always mention publication venue + purpose + potential impact/goal

## Rule 13: Tagline Natural Sentence Format

- Tagline is a natural sentence, not pipe-separated keywords
- Format: `{Exact Job Title} experienced in GenAI, Go, Distributed Systems, and Linux`
- Replace technology list with 3-4 most relevant technologies from the JD

---

## Pre-Generation Checklist

Before saving any generated resume, verify:

- [ ] NO professional summary section exists
- [ ] NO "new grad" language anywhere in the document
- [ ] Tagline is natural sentence with EXACT job title from posting (Rule 13)
- [ ] Education uses compact `School - Degree` format (Rule 11)
- [ ] Work experience lists tools used and mentions them in bullet context (Rule 12)
- [ ] Research bullets state purpose + achievement + impact (Rule 12)
- [ ] All section headers match Rule 3 exactly
- [ ] Contact info is in the body (not header/footer)
- [ ] Date format is consistently "Mon. YYYY" throughout
- [ ] Keyword count is in the 25-35 range
- [ ] All bullets follow the storytelling formula (Rule 9)
- [ ] Buzzwords are front-loaded in bullets and skills
- [ ] Skills section only contains position-relevant skills
- [ ] DOCX generated as primary format
