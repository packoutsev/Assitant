// Maps keywords found in task text or notes to actionable URLs
// Supports external URLs and in-app navigation (#view:viewId)

export interface ActionLink {
  label: string;
  url: string;
  icon?: 'external' | 'play' | 'form' | 'tool';
}

const toolUrls: Record<string, ActionLink> = {
  'hubspot': { label: 'Open HubSpot', url: 'https://app.hubspot.com', icon: 'tool' },
  'linkedin sales nav': { label: 'Open Sales Navigator', url: 'https://www.linkedin.com/sales', icon: 'tool' },
  'sales navigator': { label: 'Open Sales Navigator', url: 'https://www.linkedin.com/sales', icon: 'tool' },
  'openphone': { label: 'Open Quo/OpenPhone', url: 'https://my.openphone.com', icon: 'tool' },
  'quo': { label: 'Open Quo/OpenPhone', url: 'https://my.openphone.com', icon: 'tool' },
  'encircle': { label: 'Open Encircle', url: 'https://app.encircleapp.com', icon: 'tool' },
  'sagan': { label: 'Open Sagan', url: 'https://community.saganpassport.com/c/async-courses/', icon: 'tool' },
  'google workspace': { label: 'Open Gmail', url: 'https://mail.google.com', icon: 'tool' },
  'google chat': { label: 'Open Google Chat', url: 'https://chat.google.com', icon: 'tool' },
  'azfirehelp': { label: 'Visit azfirehelp.com', url: 'https://azfirehelp.com', icon: 'external' },
  'fireleads': { label: 'fireleads.com', url: 'https://fireleads.com', icon: 'external' },
  'playbook': { label: 'Open Playbook', url: '#view:playbook', icon: 'play' },
  'sdr playbook': { label: 'Open Playbook', url: '#view:playbook', icon: 'play' },
  'sdr-playbook': { label: 'Open Playbook', url: '#view:playbook', icon: 'play' },
  'industry deep-dive': { label: 'Open Lessons', url: '#view:learn', icon: 'play' },
  'industry education': { label: 'Open Lessons', url: '#view:learn', icon: 'play' },
  'competitive landscape': { label: 'Open Lessons', url: '#view:learn', icon: 'play' },
  'fire leads deep-dive': { label: 'Open Lessons', url: '#view:learn', icon: 'play' },
  'daily summary template': { label: 'View Templates', url: '#view:playbook', icon: 'play' },
  'daily summary': { label: 'View Template', url: '#view:playbook', icon: 'play' },
};

const urlRegex = /(?:https?:\/\/)?(?:[\w-]+\.)+[\w]{2,}(?:\/[\w.,@?^=%&:/~+#-]*)?/gi;

function normalizeUrl(raw: string): string {
  if (raw.startsWith('http')) return raw;
  return 'https://' + raw;
}

export function extractLinks(taskText: string, notes: string): ActionLink[] {
  const links: ActionLink[] = [];
  const seen = new Set<string>();
  const combined = (taskText + ' ' + notes).toLowerCase();

  for (const [keyword, link] of Object.entries(toolUrls)) {
    if (combined.includes(keyword) && !seen.has(link.url)) {
      links.push(link);
      seen.add(link.url);
    }
  }

  const rawUrls = notes.match(urlRegex) || [];
  for (const raw of rawUrls) {
    const url = normalizeUrl(raw);
    if (!seen.has(url) && !url.includes('sdr-playbook') && !url.includes('sdr-onboard')) {
      let label = 'Open Link';
      if (raw.includes('jotform')) label = 'Open Jotform Application';
      else if (raw.includes('podia')) label = 'Open Podia Course';
      else if (raw.includes('google.com/spreadsheets')) label = 'Open Sheet';
      else if (raw.includes('docs.google')) label = 'Open Document';

      links.push({ label, url, icon: 'external' });
      seen.add(url);
    }
  }

  return links;
}
