import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node split_comparative_report.mjs <comparative-report.md> [output-directory]');
  process.exit(2);
}

const absoluteInput = path.resolve(inputPath);
const outputDirectory = path.resolve(process.argv[3] || path.dirname(absoluteInput));
const markdown = fs.readFileSync(absoluteInput, 'utf8');
const cutOff = markdown.match(/^\*\*Evidence cut-off:\*\*\s*(.+)$/m)?.[1]?.trim() || 'Not stated';
const method = markdown.match(/^\*\*Method:\*\*\s*(.+)$/m)?.[1]?.trim() || 'Evidence-bounded WealthOS research';
const dateMatch = path.basename(absoluteInput).match(/(\d{4}-\d{2}-\d{2})/);
const reportDate = dateMatch?.[1] || new Date().toISOString().slice(0, 10);

const questionMatches = [...markdown.matchAll(/^## (\d+)\.\s*(.+?)\s*$\r?\n([\s\S]*?)(?=^## \d+\.|^---\s*$)/gm)];
if (questionMatches.length !== 29) {
  throw new Error(`Expected 29 questions; found ${questionMatches.length}`);
}

const executiveBlock = markdown.match(/## Executive assessment\s+([\s\S]*?)(?=\n---\s*\n)/)?.[1] || '';
const executiveParagraphs = executiveBlock.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
const sourcesBlock = markdown.match(/## (?:Principal sources|Primary evidence used)\s+([\s\S]*)$/)?.[1] || '';

const evidence = {
  AZAD: [
    '🟢 Supportive, with short-term overheating risk.', '🟢 Supportive.', '🟢 Supportive.',
    '🟠 Mixed-Watch: customer and segment concentration are material.', '🟠 Mixed-Watch.',
    '🟢 Supportive, while external TAM estimates still require independent validation.',
    '🟠 Mixed-Watch: execution and cash conversion must validate the investment.', '🟠 Mixed-Watch.',
    '🟢 Supportive, with elevated execution and valuation risk.', '🟢 Supportive.', '🟢 Supportive.',
    '🟢 Growth remains evident; cash conversion is the next confirmation.', '🟢 Supportive.',
    '🟢 Core earnings supported, with explicit normalisation items.',
    '🔴 Concern until operating cash flow and working capital reverse.',
    '🟠 Mixed-Watch: capital conversion remains pending.', '🔴 Valuation-sensitive.', '🟢 Generally supportive.',
    '🟢 Supportive, subject to continuing forensic review.', '🟢 Stable ownership with FII-to-DII rotation.',
    '🟢 Supportive.', '🟠 Material risks require active monitoring.', '🟠 Actionable watchlist established.',
    '⚪ Exact floating-rate split remains pending.', '🔴 Working-capital cycle is stretched.',
    '🟢 Comfortable leverage and coverage.', '🟠 Monitor rising related-party purchases.',
    '🟢 Liquid for normal portfolio sizes.', '🟠 Bullish but extended.',
  ],
  RRKABEL: [
    '🟢 Supportive, with short-term overheating risk.', '🟢 Supportive.', '🟢 Supportive.',
    '🟢 Supportive: distribution is diversified.', '🟠 Mixed-Watch.',
    '🟢 Supportive, while external TAM estimates still require independent validation.',
    '🟢 Internally supportable reinvestment runway.', '🟢 Supportive.', '🟢 Supportive.',
    '🟢 Supportive.', '🟢 Supportive.', '🟢 Recovery confirmed, subject to sustainability.',
    '🟢 Supportive.', '🟢 Core earnings supported, with explicit normalisation items.',
    '🟠 Mixed-Watch: positive but inventory-heavy cash conversion.', '🟢 Balanced capital deployment.',
    '🟠 Valuation is demanding but better supported.', '🟢 Generally supportive.',
    '🟢 Supportive, subject to continuing forensic review.', '🟢 Stable ownership.', '🟢 Supportive.',
    '🟠 Manageable but material risks.', '🟠 Actionable watchlist established.', '🟢 Low interest-rate sensitivity.',
    '🟠 Manageable but inventory-heavy working capital.', '🟢 Comfortable leverage and coverage.',
    '🟢 Low operating related-party leakage.', '🟢 Liquid for normal portfolio sizes.', '🟠 Bullish but extended.',
  ],
};

const conclusions = {
  AZAD: 'AZAD offers a strong structural moat, exceptional order visibility and a high-margin precision-engineering model. The investment case now depends less on new contract headlines and more on converting the order book into shipments, operating cash flow and improving asset utilisation. Customer and segment concentration, 244 working-capital days, negative canonical operating cash flow, heavy capex and a demanding valuation keep the evidence state at **🟠 Mixed-Watch / high-growth execution case**. This is not a buy/sell instruction or target price.',
  RRKABEL: 'RRKABEL combines a diversified distribution base, improving wire-and-cable margins, high current ROCE, positive operating cash flow and an emerging FMEG turnaround. The decisive tests are sustaining recent volume and margin gains, controlling inventory while executing the ₹1,200 crore capacity programme and turning FMEG breakeven into recurring profit. The evidence state is **🟢 Supportive with valuation and commodity-cycle monitoring**. This is not a buy/sell instruction or target price.',
};

function selectedParagraph(body, symbol) {
  const other = symbol === 'AZAD' ? 'RRKABEL' : 'AZAD';
  const blocks = body.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  const block = blocks.find((part) => part.startsWith(`**${symbol}.**`));
  if (!block) throw new Error(`No ${symbol} paragraph found`);
  return block
    .replace(new RegExp(`^\\*\\*${symbol}\\.\\*\\*\\s*`), '')
    .replace(/\s*\*\*Evidence state:[\s\S]*?\*\*\s*$/, '')
    .trim();
}

function build(symbol, companyName) {
  const executive = executiveParagraphs.find((paragraph) => paragraph.startsWith(symbol)) || '';
  const companySources = sourcesBlock
    .split(/\r?\n/)
    .filter((line) => line.includes(symbol) || line.includes('WealthOS'))
    .join('\n');
  const sections = questionMatches.map((match) => {
    const number = Number(match[1]);
    const answer = selectedParagraph(match[3], symbol);
    return `## ${number}. ${match[2]}\n\n**${symbol} analysis.** ${answer}\n\n**Evidence state: ${evidence[symbol][number - 1]}**`;
  }).join('\n\n');

  return `# Institutional 29-Question Analysis — ${companyName}\n\n` +
    `**Companies:** ${companyName} (NSE: ${symbol})  \n` +
    `**Evidence cut-off:** ${cutOff}  \n` +
    `**Method:** ${method}\n\n` +
    `## Executive assessment\n\n${executive}\n\n---\n\n${sections}\n\n---\n\n` +
    `## Final conclusion\n\n${conclusions[symbol]}\n\n## Principal sources\n\n${companySources}\n`;
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [symbol, companyName] of [['AZAD', 'Azad Engineering Limited'], ['RRKABEL', 'R R Kabel Limited']]) {
  const outputPath = path.join(outputDirectory, `Institutional_29_Question_Analysis_${symbol}_${reportDate}.md`);
  fs.writeFileSync(outputPath, build(symbol, companyName), 'utf8');
  console.log(outputPath);
}
