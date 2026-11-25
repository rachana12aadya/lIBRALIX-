import { BLUEPRINT_LIMITS, clampString, clampStringArray } from './validation.ts';

export interface ParsedResearchOutput {
  summary: string;
  keyFindings: string[];
}

export function parseResearchMarkdown(rawText: string): ParsedResearchOutput {
  const cleaned = rawText.trim();
  if (!cleaned) {
    return {
      summary: 'No research output was returned.',
      keyFindings: [],
    };
  }

  const findingsMatch = cleaned.match(/##\s*Key Findings\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const summaryMatch = cleaned.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##\s*Key Findings|$)/i);

  let summaryText = summaryMatch ? summaryMatch[1].trim() : '';
  const findings: string[] = [];

  if (findingsMatch) {
    const lines = findingsMatch[1].split('\n');
    for (const line of lines) {
      const stripped = line.replace(/^\s*[-*•\d.]+\s*/, '').trim();
      if (stripped) {
        findings.push(stripped);
      }
    }
  }

  if (!summaryText) {
    // Strip Key Findings section if present, use remainder as summary
    summaryText = cleaned.replace(/##\s*Key Findings[\s\S]*/i, '').trim();
  }

  return {
    summary: clampString(summaryText || cleaned, BLUEPRINT_LIMITS.researchSummaryMax),
    keyFindings: clampStringArray(
      findings,
      BLUEPRINT_LIMITS.researchFindingsMaxItems,
      BLUEPRINT_LIMITS.researchFindingItemMax
    ),
  };
}

export function formatSourceEntry(title: string, url: string): string {
  const safeTitle = clampString(title || url, 160).replace(/\|\|/g, '-');
  const safeUrl = clampString(url, 320);
  if (!safeUrl) return '';
  return `${safeTitle} || ${safeUrl}`.slice(0, BLUEPRINT_LIMITS.researchSourceItemMax);
}

export function parseSourceEntry(entry: string): { title: string; url: string } {
  const parts = entry.split('||').map((p) => p.trim());
  if (parts.length >= 2) {
    return { title: parts[0] || parts[1], url: parts[1] };
  }
  return { title: entry, url: entry.startsWith('http') ? entry : '' };
}
