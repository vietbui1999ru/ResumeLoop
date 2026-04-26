# 1. Parse the JD
# 2. Run visa eligibility check against CLAUDE.md rules
# 3. Map role → role-track table → select projects + work IDs + variant
# 4. Validate all bullets from master_resume_data.json (exact text, 110-116c)
# 5. Generate tagline (validate ≤76c)
# 6. Create build script (.js file)
# 7. Run: cd batch-build && node [script].js
# 8. Verify output DOCX exists
# 9. Draft outreach messages (using templates + special context)
# 10. Output summary: fit%, contact strategy, next steps
