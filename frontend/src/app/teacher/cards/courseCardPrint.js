export async function printCourseCards(popup, model) {
  if (popup.closed) return;
  const doc = popup.document;
  doc.title = `${model.title} · ${model.monthKey}积分卡`;
  doc.documentElement.lang = 'zh-CN';
  const style = doc.createElement('style');
  style.textContent = `
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font:13px "PingFang SC","Microsoft YaHei",sans-serif;color:#214b3c;background:white}
    .print-toolbar{padding:16px;border-bottom:1px solid #ddd;display:flex;align-items:center;justify-content:space-between;gap:12px}button{font:inherit;padding:10px 20px;background:#24634f;color:white;border:0;border-radius:6px;cursor:pointer}
    .print-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5mm;padding:12px}.print-card{display:flex;align-items:center;border:1px dashed #b9c8bb;border-radius:8px;padding:4mm;height:48mm;break-inside:avoid;page-break-inside:avoid;gap:3mm}
    .print-card img{width:31mm;height:31mm;flex-shrink:0}.print-card h2{font-size:17px;margin:0 0 6px}.print-card p{font-size:12px;line-height:1.7;margin:0}.print-card small{font-size:10px;color:#627666}
    @media print{.print-toolbar{display:none}.print-grid{padding:0}.print-card{border-color:#777}}
    @media screen{body{max-width:900px;margin:auto}}
  `;
  doc.head.append(style);
  doc.body.replaceChildren();
  const toolbar = doc.createElement('div'); toolbar.className = 'print-toolbar';
  const title = doc.createElement('strong'); title.textContent = `${model.title} · ${model.monthKey} · ${model.rows.length} 张`;
  const button = doc.createElement('button'); button.textContent = '打印'; button.onclick = () => popup.print();
  toolbar.append(title, button); doc.body.append(toolbar);
  const grid = doc.createElement('main'); grid.className = 'print-grid';
  for (const row of model.rows) {
    const card = doc.createElement('article'); card.className = 'print-card';
    const img = doc.createElement('img'); img.src = row.qrDataUrl; img.alt = `卡号 ${row.id} 的领取二维码`;
    const info = doc.createElement('div');
    const heading = doc.createElement('h2'); heading.textContent = model.title;
    const meta = doc.createElement('p'); meta.textContent = `${model.monthKey} · 每卡 1 分`;
    const number = doc.createElement('p'); number.textContent = `卡号 ${row.id}`;
    const hint = doc.createElement('small'); hint.textContent = '本班学生扫码领取 · 仅可领取一次';
    info.append(heading, meta, number, hint); card.append(img, info); grid.append(card);
  }
  doc.body.append(grid);
  await Promise.all([...doc.images].map(img => img.decode()));
  await doc.fonts.ready;
  if (!popup.closed) { popup.focus(); popup.print(); }
}
