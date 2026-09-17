export interface SocialMediaItem {
  platform: 'YOUTUBE' | 'TWITTER' | 'REDDIT' | 'TRENDLYNE' | 'NEWS';
  title: string;
  url: string;
  source: string;
  published_at?: string;
  snippet?: string;
}

export class SocialMediaService {
  private static instance: SocialMediaService;

  public static getInstance(): SocialMediaService {
    if (!SocialMediaService.instance) {
      SocialMediaService.instance = new SocialMediaService();
    }
    return SocialMediaService.instance;
  }

  public getSocialCoverageForScrip(symbol: string, companyName?: string): SocialMediaItem[] {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const name = companyName || cleanSym;

    const items: SocialMediaItem[] = [
      {
        platform: 'YOUTUBE',
        title: `${name} (${cleanSym}) Latest Stock Analysis & Quarterly Results Review`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' ' + cleanSym + ' stock analysis latest concall')}`,
        source: 'YouTube Financial Channels',
        snippet: 'Watch deep dive stock research, concall recaps, and quarterly result analyses.'
      },
      {
        platform: 'YOUTUBE',
        title: `${name} Concall Highlights & Management Guidance Video`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' concall highlights quarterly results guidance')}`,
        source: 'YouTube Earnings Recaps',
        snippet: 'Key takeaways from the latest investor conference call.'
      },
      {
        platform: 'TWITTER',
        title: `$${cleanSym} Twitter/X Live Discussion Threads & Market Sentiment`,
        url: `https://twitter.com/search?q=${encodeURIComponent('$' + cleanSym + ' OR "' + name + '" stock')}&f=live`,
        source: 'Twitter / X Finance',
        snippet: 'Real-time trader commentary, breaking news disclosures, and chart setups.'
      },
      {
        platform: 'REDDIT',
        title: `Reddit Research & Discussions for ${name} ($${cleanSym})`,
        url: `https://www.reddit.com/search/?q=${encodeURIComponent(name + ' ' + cleanSym + ' stock')}&sort=new`,
        source: 'Reddit (r/IndianStockMarket, r/stocks)',
        snippet: 'Community discussions, valuation debates, and fundamental thesis threads.'
      },
      {
        platform: 'TRENDLYNE',
        title: `${name} Trendlyne Superstars, Delivery Volume & Analyst Calls`,
        url: `https://trendlyne.com/equity/${encodeURIComponent(cleanSym)}/`,
        source: 'Trendlyne Financials',
        snippet: 'Institutional delivery volumes, superstar investor holdings, and target prices.'
      }
    ];

    return items;
  }
}
