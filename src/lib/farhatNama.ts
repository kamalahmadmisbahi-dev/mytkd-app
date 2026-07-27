import { toPng } from 'html-to-image';
import { loadAllFonts } from './fontLoader';

export interface FarhatNamaData {
  teacherName: string;
  semesterTitle: string;
  semesterYear: number | string;
  semesterDateRange: string;
  institutionName: string;
  institutionLocation: string;
  nazimLabel: string;
  sealLabel: string;
}

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));

function buildStyles(kitabFont: string | null): string {
  const fontSrc = kitabFont
    ? `src: url('${kitabFont}') format('truetype');`
    : `src: url('https://www.services.siraatpublications.com/fonts/Kitab-Bold.ttf') format('truetype');`;
  return `
  @font-face {
    font-family: 'Kitab';
    ${fontSrc}
    font-weight: bold; font-style: normal; font-display: block;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .certificate {
    width: 1123px; min-height: 1587px; background: #ffffff;
    font-family: 'Kitab', 'Traditional Arabic', 'Scheherazade New', serif;
    direction: rtl; text-align: right; color: #1a1a1a; position: relative;
    padding: 70px 80px;
  }
  .cert-border-outer {
    position: absolute; top: 24px; left: 24px; right: 24px; bottom: 24px;
    border: 4px solid #0b3d2c; border-radius: 12px;
  }
  .cert-border-inner {
    position: absolute; top: 36px; left: 36px; right: 36px; bottom: 36px;
    border: 2px solid #c9a14a; border-radius: 8px;
  }
  .cert-corner {
    position: absolute; width: 60px; height: 60px;
    border: 3px solid #c9a14a; border-radius: 6px;
  }
  .corner-tl { top: 48px; right: 48px; border-bottom: none; border-left: none; }
  .corner-tr { top: 48px; left: 48px; border-bottom: none; border-right: none; }
  .corner-bl { bottom: 48px; right: 48px; border-top: none; border-left: none; }
  .corner-br { bottom: 48px; left: 48px; border-top: none; border-right: none; }
  .cert-content { position: relative; z-index: 2; }
  .cert-header { text-align: center; margin-bottom: 30px; }
  .cert-title {
    font-size: 42px; font-weight: bold; color: #0b3d2c;
    line-height: 1.6; margin-bottom: 8px;
    text-shadow: 0 1px 2px rgba(11, 61, 44, 0.1);
  }
  .cert-bismillah {
    font-size: 32px; font-weight: bold; color: #0b3d2c;
    text-align: center; margin-bottom: 24px; line-height: 1.8;
  }
  .cert-hamd {
    font-size: 22px; line-height: 2.2; text-align: center;
    color: #333; margin-bottom: 20px;
  }
  .cert-body { font-size: 22px; line-height: 2.4; color: #1a1a1a; }
  .cert-body p { margin-bottom: 18px; text-align: justify; }
  .teacher-name-line {
    font-size: 24px; font-weight: bold; color: #0b3d2c;
    margin: 8px 0 4px; display: inline-block;
    border-bottom: 2px dotted #0b3d2c; padding: 0 20px; min-width: 400px;
    text-align: center;
  }
  .cert-footer {
    margin-top: 40px; display: grid;
    grid-template-columns: 1fr 1fr 1fr; gap: 24px;
  }
  .cert-field { text-align: center; }
  .cert-field-label { font-size: 18px; font-weight: bold; color: #0b3d2c; margin-bottom: 30px; }
  .cert-field-line { border-bottom: 1.5px solid #555; margin-bottom: 6px; min-height: 24px; }
  .cert-institution-footer {
    text-align: center; margin-top: 30px;
    font-size: 18px; color: #6b7280; line-height: 1.8;
  }
  .cert-seal-area {
    text-align: center; margin-top: 12px;
  }
  .cert-seal-circle {
    width: 100px; height: 100px; border: 3px double #c9a14a;
    border-radius: 50%; margin: 0 auto; display: flex;
    align-items: center; justify-content: center;
    font-size: 12px; color: #c9a14a; text-align: center;
    line-height: 1.4;
  }
`;
}

function buildCertificateHtml(data: FarhatNamaData): string {
  return `
  <div class="certificate">
    <div class="cert-border-outer"></div>
    <div class="cert-border-inner"></div>
    <div class="cert-corner corner-tl"></div>
    <div class="cert-corner corner-tr"></div>
    <div class="cert-corner corner-bl"></div>
    <div class="cert-corner corner-br"></div>

    <div class="cert-content">
      <div class="cert-header">
        <div class="cert-title">شهادة شكر وتقدير</div>
      </div>

      <div class="cert-bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>

      <div class="cert-hamd">
        الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ، وَالصَّلَاةُ وَالسَّلَامُ عَلَى سَيِّدِنَا مُحَمَّدٍ، وَعَلَى آلِهِ وَصَحْبِهِ أَجْمَعِينَ.
      </div>

      <div class="cert-body">
        <p>تتقدم إدارة ${escapeHtml(data.institutionName)}، ${escapeHtml(data.institutionLocation)} بخالص الشكر وجزيل التقدير إلى</p>

        <p style="text-align: center; margin: 16px 0;">
          فضيلة الأستاذ: <span class="teacher-name-line">${escapeHtml(data.teacherName)}</span>
        </p>

        <p>تقديرا لجهوده المباركة، وعطائه العلمي والتربوي المتميز، وإخلاصه في أداء رسالته التعليمية، وحرصه على تعليم الطلاب وتربيتهم وتوجيههم.</p>

        <p>وقد أتم فضيلته ـ بحمد الله تعالى وتوفيقه ـ تدريس المنهج الدراسي المقرر وإكمال نصابه على الوجه المطلوب، ملتزما بالأمانة العلمية، والجد والاجتهاد، وحسن الأداء.</p>

        <p>وإن إدارة الجامعة إذ تثمن هذه الجهود الطيبة، لتسأل الله تعالى أن يجزيه خير الجزاء، وأن يبارك في علمه وعمله وعمره، وأن يجعل ما قدمه في ميزان حسناته، وأن يوفقه لمزيد من العطاء وخدمة العلم والدين.</p>

        <p>جزاه الله تعالى عن العلم وطلابه خير الجزاء، وبارك في جهوده ومساعيه.</p>

        <p>حررت هذه الشهادة تقديرا لجهوده وعرفانا بعطائه.</p>
      </div>

      <div class="cert-footer">
        <div class="cert-field">
          <div class="cert-field-label">التاريخ</div>
          <div class="cert-field-line"></div>
        </div>
        <div class="cert-field">
          <div class="cert-field-label">مدير الجامعة</div>
          <div class="cert-field-line"></div>
        </div>
        <div class="cert-field">
          <div class="cert-field-label">الختم والتوقيع</div>
          <div class="cert-seal-area">
            <div class="cert-seal-circle">${escapeHtml(data.institutionName)}</div>
          </div>
        </div>
      </div>

      <div class="cert-institution-footer">
        ${escapeHtml(data.institutionName)}، ${escapeHtml(data.institutionLocation)}
      </div>
    </div>
  </div>`;
}

const A4_WIDTH = 794;

export async function downloadFarhatNama(data: FarhatNamaData, filename: string): Promise<void> {
  const fonts = await loadAllFonts();
  const styles = buildStyles(fonts.kitab);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '9999';
  container.style.background = '#ffffff';
  container.style.padding = '0';
  container.style.width = `${A4_WIDTH}px`;
  container.dir = 'rtl';
  container.innerHTML = `<style>${styles}</style>` + buildCertificateHtml(data);
  document.body.appendChild(container);

  const scale = A4_WIDTH / 1123;
  const certEl = container.querySelector<HTMLElement>('.certificate');
  if (certEl) {
    certEl.style.transform = `scale(${scale})`;
    certEl.style.transformOrigin = 'top left';
    certEl.style.width = '1123px';
  }

  try {
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));
    const dataUrl = await toPng(container, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: A4_WIDTH,
      style: { transform: 'none' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename.replace(/\.pdf$/, '.png');
    a.click();
  } finally {
    if (container.parentNode) document.body.removeChild(container);
  }
}
