function parseYearFromDateString(s) {
  const m = String(s || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

export function estimateExperienceYears(experience) {
  if (!Array.isArray(experience) || experience.length === 0) return 0;
  let total = 0;
  experience.forEach((exp) => {
    const dates = exp && exp.dates ? String(exp.dates) : '';
    const parts = dates.split(/\s*(?:-|–|—|to)\s*/i).map((p) => p.trim()).filter(Boolean);
    const start = parseYearFromDateString(parts[0]);
    if (!start) return;
    let end;
    if (parts.length >= 2) {
      if (/present|current|now|en cours|aujourd/i.test(parts[parts.length - 1])) {
        end = new Date().getFullYear();
      } else {
        end = parseYearFromDateString(parts[parts.length - 1]);
      }
    } else {
      end = start;
    }
    if (end && end >= start) total += end - start + 1;
  });
  return total;
}

export function shouldSkillsFirst(cv) {
  return estimateExperienceYears(cv && cv.experience) < 5;
}
