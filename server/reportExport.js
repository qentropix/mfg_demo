const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN_X = 48;
const PDF_START_Y = 744;
const PDF_LINE_HEIGHT = 14;
const PDF_LINES_PER_PAGE = 48;

function normalizeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function csvEscape(value) {
  const text = normalizeCell(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildMetricRows(historyDay) {
  return [
    ['metric', 'overall_oee_percent', historyDay?.overallOee ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'total_output_units', historyDay?.totalOutput ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'good_parts_units', historyDay?.goodParts ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'downtime_minutes', historyDay?.downtimeMinutes ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'quality_rate_percent', historyDay?.qualityRate ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'active_alerts', historyDay?.activeAlerts ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'critical_alerts', historyDay?.criticalAlerts ?? '', '', '', '', '', '', '', '', ''],
    ['metric', 'warning_alerts', historyDay?.warningAlerts ?? '', '', '', '', '', '', '', '', '']
  ];
}

export function buildReportCsv({ shiftName, reportDate, historyDay, reportDayEvents = [], reportText = '' }) {
  const rows = [
    ['section', 'field', 'value', 'metric_date', 'event_time', 'event_type', 'severity', 'title', 'details', 'machine', 'metric_value'],
    ['metadata', 'shift_name', shiftName, reportDate, '', '', '', '', '', '', ''],
    ['metadata', 'report_date', reportDate, reportDate, '', '', '', '', '', '', ''],
    ...buildMetricRows(historyDay),
    ...reportDayEvents.map((event) => [
      'event',
      event.eventType || '',
      '',
      event.metricDate || reportDate,
      event.eventTime || '',
      event.eventType || '',
      event.severity || '',
      event.title || '',
      event.details || '',
      event.machineName || '',
      event.metricValue ?? ''
    ]),
    ['report', 'text', reportText, reportDate, '', '', '', '', '', '', '']
  ];

  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}\r\n`;
}

function toPdfSafeText(value) {
  return normalizeCell(value)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value) {
  return toPdfSafeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(line, width = 92) {
  const text = toPdfSafeText(line);
  if (text.length <= width) {
    return [text];
  }

  const words = text.split(' ');
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function chunkLines(lines) {
  const pages = [];
  for (let index = 0; index < lines.length; index += PDF_LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + PDF_LINES_PER_PAGE));
  }

  return pages.length ? pages : [[]];
}

function buildPdfLines({ shiftName, reportDate, historyDay, reportDayEvents = [], reportText = '' }) {
  const lines = [
    'Daily Shift Report',
    `Shift: ${shiftName}`,
    `Report Date: ${reportDate}`,
    '',
    'Key Metrics',
    `OEE: ${historyDay?.overallOee ?? '-'}%`,
    `Total Output: ${historyDay?.totalOutput ?? '-'} units`,
    `Good Parts: ${historyDay?.goodParts ?? '-'} units`,
    `Downtime: ${historyDay?.downtimeMinutes ?? '-'} minutes`,
    `Quality Rate: ${historyDay?.qualityRate ?? '-'}%`,
    `Alerts: ${historyDay?.activeAlerts ?? '-'} total, ${historyDay?.criticalAlerts ?? '-'} critical, ${historyDay?.warningAlerts ?? '-'} warning`,
    '',
    'Report Narrative'
  ];

  reportText.split(/\r?\n/).forEach((line) => {
    lines.push(...wrapLine(line));
  });

  lines.push('', 'Historical Events');

  if (reportDayEvents.length === 0) {
    lines.push('No events recorded for this date.');
  } else {
    reportDayEvents.forEach((event, index) => {
      const parts = [
        `${index + 1}. ${event.title || 'Event'}`,
        event.severity ? `severity: ${event.severity}` : '',
        event.eventType ? `type: ${event.eventType}` : '',
        event.machineName ? `machine: ${event.machineName}` : '',
        event.eventTime ? `time: ${event.eventTime}` : ''
      ].filter(Boolean);
      lines.push(...wrapLine(parts.join(' | ')));
      if (event.details) {
        lines.push(...wrapLine(`Details: ${event.details}`));
      }
    });
  }

  return lines;
}

function makePdfDocument(lines) {
  const pages = chunkLines(lines);
  const objects = [];
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = '';
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  const pageRefs = [];
  pages.forEach((pageLines) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const contentLines = [
      'BT',
      '/F1 10 Tf',
      `${PDF_MARGIN_X} ${PDF_START_Y} Td`,
      `${PDF_LINE_HEIGHT} TL`,
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      'ET'
    ];
    const content = contentLines.join('\n');

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

export function buildReportPdf(payload) {
  return makePdfDocument(buildPdfLines(payload));
}
