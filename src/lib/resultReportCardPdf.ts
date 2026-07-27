import { toPng } from 'html-to-image';
import { loadAllFonts } from './fontLoader';

export interface ResultCardBookRow {
  bookName: string;
  className: string;
  totalPresent: number;
  totalFailed: number;
  percentage: number;
  quality: string;
}

export interface ResultCardClassRow {
  className: string;
  totalStudents: number;
  present: number;
  absent: number;
  mumtazMaSharaf: number;
  mumtaz: number;
  jaidJuda: number;
  jaid: number;
  maqbool: number;
  nakam: number;
  percentage: number;
  quality: string;
}

export interface ResultReportCardData {
  institutionName: string;
  institutionSubtitle: string;
  semesterTitle: string;
  semesterYear: number | string;
  semesterDateRange: string;
  teacherName: string;
  reportType: 'semester_first' | 'semester_second';
  mode: 'teacher' | 'class';
  bookRows?: ResultCardBookRow[];
  classRows?: ResultCardClassRow[];
  grandTotalPercentage: number;
  grandTotalQuality: string;
  nazimLabel: string;
  sealLabel: string;
  teacherSignatureLabel: string;
}

const qualityClass = (q: string): string => {
  switch (q) {
    case 'ممتاز': return 'q-excellent';
    case 'بہتر': return 'q-good';
    case 'مناسب': return 'q-fair';
    case 'کمزور': return 'q-poor';
    default: return 'q-fair';
  }
};

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));

function buildStyles(payamiFont: string | null): string {
  const fontSrc = payamiFont
    ? `src: url('${payamiFont}') format('truetype');`
    : `src: url('https://www.services.siraatpublications.com/fonts/Payami-Web.ttf') format('truetype');`;
  return `
  @font-face {
    font-family: 'Payami Web';
    ${fontSrc}
    font-weight: normal; font-style: normal; font-display: block;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .card {
    width: 1123px; background: #ffffff; padding: 40px; font-family: 'Payami Web', 'Segoe UI', Tahoma, sans-serif;
    color: #1f2937; direction: rtl; text-align: right;
  }
  .top-border { height: 30px; background: linear-gradient(90deg, #0b3d2c 0%, #107a57 50%, #0b3d2c 100%); border-radius: 4px 4px 0 0; }
  .gold-line { height: 6px; background: #c9a14a; }
  .header { text-align: center; padding: 24px 0 12px; }
  .inst-name { font-size: 30px; font-weight: 700; color: #0b3d2c; line-height: 2.2; }
  .inst-sub { font-size: 17px; color: #6b7280; margin-top: 2px; font-weight: 400; line-height: 1.8; }
  .header-divider { margin: 12px auto 0; width: 70%; height: 2px; background: linear-gradient(90deg, transparent, #107a57, transparent); }
  .title-row { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; }
  .title-text { font-size: 21px; font-weight: 700; color: #107a57; line-height: 1.8; }
  .semester-info { font-size: 14px; color: #374151; line-height: 1.8; }
  .semester-info b { color: #0b3d2c; font-weight: 700; }
  .teacher-box { margin-top: 16px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; }
  .teacher-name { font-size: 21px; font-weight: 700; color: #0b3d2c; line-height: 1.8; }
  .table-wrap { margin-top: 16px; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  thead th { background: linear-gradient(180deg, #107a57, #0b5e44); color: #fff; font-weight: 700; padding: 8px 4px; border: 1px solid #0b5e44; text-align: center; font-size: 14px; line-height: 1.6; }
  tbody td { padding: 7px 4px; border: 1px solid #e5e7eb; text-align: center; color: #1f2937; line-height: 1.6; }
  .td-num { width: 32px; color: #6b7280; font-weight: 700; }
  .td-book { text-align: right; font-weight: 700; padding-right: 10px; }
  .td-class { color: #4b5563; }
  .td-pages { color: #6b7280; }
  .td-overall { font-weight: 700; background: #f0fdf4; }
  .td-quality { font-weight: 700; }
  .row-alt { background: #f9fafb; }
  .q-excellent { color: #047857; background: #d1fae5; border-radius: 4px; padding: 2px 6px; }
  .q-good { color: #0369a1; background: #dbeafe; border-radius: 4px; padding: 2px 6px; }
  .q-fair { color: #b45309; background: #fef3c7; border-radius: 4px; padding: 2px 6px; }
  .q-poor { color: #be123c; background: #ffe4e6; border-radius: 4px; padding: 2px 6px; }
  .grand-row td { background: linear-gradient(90deg, #ecfdf5, #d1fae5); font-weight: 700; font-size: 16px; color: #065f46; border-top: 2px solid #107a57; line-height: 1.8; }
  .grand-row .grand-label { text-align: right; padding-right: 10px; }
  .grand-row .grand-pct { font-size: 16px; color: #0b3d2c; }
  .grand-row .grand-quality { font-size: 16px; }
  .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; text-align: center; }
  .sig-col { display: flex; flex-direction: column; align-items: center; }
  .sig-placeholder { height: 56px; width: 140px; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 11px; margin-bottom: 8px; }
  .seal-placeholder { height: 88px; width: 112px; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 11px; margin-bottom: 8px; }
  .sig-line { width: 60%; height: 1px; background: #1f2937; margin: 4px auto 8px; }
  .sig-label { font-size: 16px; font-weight: 700; color: #1f2937; line-height: 1.6; }
  .footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px; text-align: center; font-size: 13px; color: #9ca3af; line-height: 1.6; }
`;
}

function buildCardHtml(data: ResultReportCardData): string {
  const semesterLabel =
    data.reportType === 'semester_first' ? 'ششماہی اول' : 'ششماہی آخر';

  let tableHtml = '';

  if (data.mode === 'teacher' && data.bookRows) {
    const rows = data.bookRows
      .map((row, idx) => `
        <tr class="${idx % 2 === 1 ? 'row-alt' : ''}">
          <td class="td-num">${idx + 1}</td>
          <td class="td-book">${escapeHtml(row.bookName)}</td>
          <td class="td-class">${escapeHtml(row.className)}</td>
          <td class="td-pages">${row.totalPresent}</td>
          <td class="td-pages">${row.totalFailed}</td>
          <td class="td-overall">${row.percentage}%</td>
          <td class="td-quality ${qualityClass(row.quality)}">${escapeHtml(row.quality)}</td>
        </tr>`)
      .join('');

    tableHtml = `
      <table>
        <thead>
          <tr>
            <th class="th-num">شمار</th>
            <th class="th-book">کتاب کا نام</th>
            <th class="th-class">درجہ</th>
            <th class="th-pages">امتحان میں حاضر کل طلبہ</th>
            <th class="th-pages">ناکام طلبہ</th>
            <th class="th-overall">فیصد</th>
            <th class="th-quality">کیفیت</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="grand-row">
            <td class="grand-label" colspan="5">مجموعی فیصد</td>
            <td class="grand-pct">${data.grandTotalPercentage}%</td>
            <td class="grand-quality ${qualityClass(data.grandTotalQuality)}">${escapeHtml(data.grandTotalQuality)}</td>
          </tr>
        </tbody>
      </table>`;
  } else if (data.mode === 'class' && data.classRows) {
    const rows = data.classRows
      .map((row, idx) => `
        <tr class="${idx % 2 === 1 ? 'row-alt' : ''}">
          <td class="td-num">${idx + 1}</td>
          <td class="td-book">${escapeHtml(row.className)}</td>
          <td class="td-pages">${row.totalStudents}</td>
          <td class="td-pages">${row.present}</td>
          <td class="td-pages">${row.absent}</td>
          <td class="td-pages">${row.mumtazMaSharaf}</td>
          <td class="td-pages">${row.mumtaz}</td>
          <td class="td-pages">${row.jaidJuda}</td>
          <td class="td-pages">${row.jaid}</td>
          <td class="td-pages">${row.maqbool}</td>
          <td class="td-pages">${row.nakam}</td>
          <td class="td-overall">${row.percentage}%</td>
          <td class="td-quality ${qualityClass(row.quality)}">${escapeHtml(row.quality)}</td>
        </tr>`)
      .join('');

    const totals = data.classRows.reduce((acc, r) => ({
      totalStudents: acc.totalStudents + r.totalStudents,
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      mumtazMaSharaf: acc.mumtazMaSharaf + r.mumtazMaSharaf,
      mumtaz: acc.mumtaz + r.mumtaz,
      jaidJuda: acc.jaidJuda + r.jaidJuda,
      jaid: acc.jaid + r.jaid,
      maqbool: acc.maqbool + r.maqbool,
      nakam: acc.nakam + r.nakam,
    }), { totalStudents: 0, present: 0, absent: 0, mumtazMaSharaf: 0, mumtaz: 0, jaidJuda: 0, jaid: 0, maqbool: 0, nakam: 0 });

    tableHtml = `
      <table>
        <thead>
          <tr>
            <th class="th-num">شمار</th>
            <th class="th-book">درجہ</th>
            <th class="th-pages">کل طلبہ</th>
            <th class="th-pages">حاضر</th>
            <th class="th-pages">غیر حاضر</th>
            <th class="th-pages">ممتاز مع الشرف</th>
            <th class="th-pages">ممتاز</th>
            <th class="th-pages">جید جدا</th>
            <th class="th-pages">جید</th>
            <th class="th-pages">مقبول</th>
            <th class="th-pages">ناکام</th>
            <th class="th-overall">فیصد</th>
            <th class="th-quality">کیفیت</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="grand-row">
            <td class="grand-label" colspan="2">مجموعی</td>
            <td class="grand-pct">${totals.totalStudents}</td>
            <td class="grand-pct">${totals.present}</td>
            <td class="grand-pct">${totals.absent}</td>
            <td class="grand-pct">${totals.mumtazMaSharaf}</td>
            <td class="grand-pct">${totals.mumtaz}</td>
            <td class="grand-pct">${totals.jaidJuda}</td>
            <td class="grand-pct">${totals.jaid}</td>
            <td class="grand-pct">${totals.maqbool}</td>
            <td class="grand-pct">${totals.nakam}</td>
            <td class="grand-pct">${data.grandTotalPercentage}%</td>
            <td class="grand-quality ${qualityClass(data.grandTotalQuality)}">${escapeHtml(data.grandTotalQuality)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  const titleText = `رزلٹ کارڈ — ${escapeHtml(semesterLabel)}`;

  return `
  <div class="card">
    <div class="top-border"></div>
    <div class="gold-line"></div>

    <div class="header">
      <div class="inst-name">${escapeHtml(data.institutionName)}</div>
      <div class="inst-sub">${escapeHtml(data.institutionSubtitle)}</div>
      <div class="header-divider"></div>
    </div>

    <div class="title-row">
      <div class="title-text">${escapeHtml(titleText)}</div>
      <div class="semester-info">
        <b>سمسٹر:</b> ${escapeHtml(String(data.semesterTitle))} |
        <b>سال:</b> ${escapeHtml(String(data.semesterYear))} |
        <b>دورانیہ:</b> ${escapeHtml(data.semesterDateRange)}
      </div>
    </div>

    <div class="teacher-box">
      <div class="teacher-details">
        <div class="teacher-name">${escapeHtml(data.teacherName)}</div>
      </div>
    </div>

    <div class="table-wrap">
      ${tableHtml}
    </div>

    <div class="signatures">
      <div class="sig-col">
        <div class="sig-placeholder">${escapeHtml(data.nazimLabel)}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${escapeHtml(data.nazimLabel)}</div>
      </div>
      <div class="sig-col">
        <div class="seal-placeholder">${escapeHtml(data.sealLabel)}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${escapeHtml(data.sealLabel)}</div>
      </div>
      <div class="sig-col">
        <div class="sig-placeholder">${escapeHtml(data.teacherSignatureLabel)}</div>
        <div class="sig-line"></div>
        <div class="sig-label">${escapeHtml(data.teacherSignatureLabel)}</div>
      </div>
    </div>

    <div class="footer">
      ${escapeHtml(data.institutionName)} — رزلٹ کارڈ | ${new Date().toLocaleDateString('en-GB')}
    </div>
  </div>`;
}

const A4_WIDTH = 794;

async function renderCardsToImage(cards: ResultReportCardData[], filename: string): Promise<void> {
  const fonts = await loadAllFonts();
  const styles = buildStyles(fonts.payami);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '9999';
  container.style.background = '#ffffff';
  container.style.padding = '0';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '0';
  container.style.width = `${A4_WIDTH}px`;
  container.dir = 'rtl';
  container.innerHTML = `<style>${styles}</style>` + cards.map(buildCardHtml).join('');
  document.body.appendChild(container);

  const scale = A4_WIDTH / 1123;
  const cardsElements = container.querySelectorAll<HTMLElement>('.card');
  cardsElements.forEach(el => {
    el.style.transform = `scale(${scale})`;
    el.style.transformOrigin = 'top left';
    el.style.width = '1123px';
  });

  try {
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 200));
    const dataUrl = await toPng(container, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: A4_WIDTH,
      style: { transform: 'none' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  } finally {
    if (container.parentNode) document.body.removeChild(container);
  }
}

export async function downloadResultReportCardPdf(data: ResultReportCardData, filename: string) {
  await renderCardsToImage([data], filename.replace(/\.pdf$/, '.png'));
}

export async function downloadResultReportCardsPdf(cards: ResultReportCardData[], filename: string) {
  await renderCardsToImage(cards, filename.replace(/\.pdf$/, '.png'));
}
