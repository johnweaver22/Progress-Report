import { sections, ratings, groupTargets } from './criteria.js';

let assetPromise;
async function loadAssets() {
  if (!assetPromise) assetPromise = Promise.all(['assets/DejaVuSans.ttf','assets/DejaVuSans-Bold.ttf','assets/logo.jpg'].map(async path => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error('PDF asset unavailable');
    return new Uint8Array(await response.arrayBuffer());
  })).catch(error => { assetPromise = null; throw error; });
  return assetPromise;
}
function base64(bytes) {
  let binary = '';
  for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export async function createReviewPDF(swimmer, review, dependencies = {}) {
  const PDF = dependencies.jsPDF || globalThis.jspdf?.jsPDF;
  if (!PDF) throw new Error('PDF library unavailable');
  const [regular, bold, logo] = dependencies.assets || await loadAssets();
  const doc = new PDF({orientation:'portrait',unit:'pt',format:[390,844],compress:true,putOnlyUsedFonts:true});
  doc.addFileToVFS('DejaVuSans.ttf',base64(regular)); doc.addFont('DejaVuSans.ttf','Review','normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf',base64(bold)); doc.addFont('DejaVuSans-Bold.ttf','Review','bold');
  const INK = '#303236', MUTED = '#555c62', RED = '#d71920', LIGHT = '#f1f1f0';
  const W=390, H=844, M=22, WIDTH=W-2*M, PAD=16, TEXT=WIDTH-2*PAD, BOTTOM=H-42;
  const name = `${swimmer.firstName} ${swimmer.lastName}`;
  const formattedDate = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(review.date+'T12:00:00'));
  doc.setProperties({title:`${name} - Aquabears Swimmer Development Review`,subject:'Swimmer development review',author:'Aquabears of Rochdale',creator:'Aquabears Review'});
  let y=0;
  function font(size=12, weight='normal', color=INK) { doc.setFont('Review',weight); doc.setFontSize(size); doc.setTextColor(color); }
  function lines(text, size, weight='normal', width=TEXT) { font(size,weight); return doc.splitTextToSize(String(text).replace(/\r\n?/g,'\n'),width); }
  function text(value,x,baseline,size=12,weight='normal',color=INK) { font(size,weight,color); doc.text(value,x,baseline); }
  function shortName() {
    font(10.5,'bold'); let str = name;
    while (doc.getTextWidth(str) > 255) str = str.slice(0,-2);
    return str === name ? str : str+'…';
  }
  function header(first=false) {
    doc.setFillColor('#ffffff'); doc.rect(0,0,W,H,'F');
    doc.setFillColor(RED); doc.rect(0,0,W,4,'F');
    if (first) {
      doc.addImage(logo,'JPEG',M+3,23,55,62.7);
      text('AQUABEARS OF ROCHDALE',95,34,8.5,'bold');
      text('Swimmer Development',95,57,15,'bold');
      text('Review',95,77,15,'bold');
      y=116;
      for (const line of lines(name,22,'bold',WIDTH)) { text(line,M,y,22,'bold'); y+=28; }
      text(`${swimmer.group} · ${formattedDate}`,M,y-5,11,'normal',MUTED); y+=15;
      if (groupTargets[swimmer.group]) {
        const target = lines(groupTargets[swimmer.group],11.5,'normal',WIDTH-28);
        const height=38+target.length*17;
        doc.setFillColor(LIGHT); doc.roundedRect(M,y,WIDTH,height,6,6,'F');
        doc.setFillColor(RED); doc.rect(M,y,3,height,'F');
        text('GROUP TARGET',M+14,y+20,9,'bold');
        target.forEach((line,i) => text(line,M+14,y+39+i*17,11.5));
        y+=height+19;
      } else y+=6;
    } else {
      doc.addImage(logo,'JPEG',M,21,29,33);
      text('SWIMMER DEVELOPMENT REVIEW',63,31,8.5,'bold');
      text(shortName(),63,49,10.5,'bold');
      doc.setDrawColor('#dedfdf'); doc.line(M,67,W-M,67); y=84;
    }
  }
  function newPage() { doc.addPage([390,844]); header(); }
  function textRows(value,size=12.4,weight='normal',color=INK,leading=18.5,extra={}) {
    return lines(value,size,weight).map(line=>({text:line,size,weight,color,height:leading,...extra}));
  }
  const gap = height => ({height});
  function makeRows(section, answer) {
    const rows = [...textRows(section.note,12.3,'normal',MUTED,18),gap(14)];
    rows.push(gap(5),...textRows(answer.rating || ratings[4].label,11.2,'bold',INK,17,{background:true}),gap(11));
    if (answer.comments?.trim()) rows.push({text:'COACH COMMENTS',size:9,weight:'bold',color:INK,height:22,keepNext:true},...textRows(answer.comments.trim(),12.7,'normal',INK,19));
    return rows;
  }
  function drawCard(category,title,allRows) {
    let remaining=allRows.slice(), continued=false;
    while (remaining.length) {
      const titleLines=lines(title+(continued?' (continued)':''),16.6,'bold');
      const topHeight=PAD+15+titleLines.length*21+10;
      const total=topHeight+remaining.reduce((sum,r)=>sum+r.height,0)+PAD;
      if (y+total>BOTTOM && y>85) newPage();
      const available=BOTTOM-y-topHeight-PAD;
      let used=0, count=0;
      for (let i=0;i<remaining.length;i++) {
        const row=remaining[i];
        if (used+row.height>available) break;
        if (row.keepNext && used+row.height+(remaining[i+1]?.height||0)>available) break;
        used+=row.height; count++;
      }
      if (!count) { newPage(); continue; }
      let chunk=remaining.splice(0,count);
      while(chunk.length && !chunk[chunk.length-1].text) {used-=chunk.pop().height;}
      const height=topHeight+used+PAD;
      doc.setFillColor('#ffffff'); doc.setDrawColor('#dedfdf'); doc.setLineWidth(.7);
      doc.roundedRect(M,y,WIDTH,height,7,7,'FD');
      let cursor=y+PAD;
      text(category.toUpperCase(),M+PAD,cursor+8,8.7,'bold'); cursor+=15;
      for (const line of titleLines) { text(line,M+PAD,cursor+16.6,16.6,'bold'); cursor+=21; }
      cursor+=10;
      for (const row of chunk) {
        if (row.background) { doc.setFillColor(LIGHT); doc.rect(M+PAD-5,cursor-1,TEXT+10,row.height+1,'F'); }
        if (row.text) text(row.text,M+PAD,cursor+row.size,row.size,row.weight,row.color);
        cursor+=row.height;
      }
      y+=height+16;
      while(remaining.length && !remaining[0].text) remaining.shift();
      if(remaining.length) { continued=true; newPage(); }
    }
  }
  header(true);
  for (const section of sections) drawCard(section.group,section.title,makeRows(section,review.answers[section.id] || {}));
  if (review.remedial?.trim()) drawCard('Next steps','Remedial action',textRows(review.remedial.trim(),12.7,'normal',INK,19));
  const pages=doc.getNumberOfPages();
  for (let i=1;i<=pages;i++) {
    doc.setPage(i); doc.setDrawColor('#dedfdf'); doc.line(M,H-31,W-M,H-31);
    text('AQUABEARS · SWIMMER REVIEW',M,H-16,7.7,'bold',MUTED);
    font(8,'normal',MUTED); doc.text(`${i} / ${pages}`,W-M,H-16,{align:'right'});
  }
  const cleanName=name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim();
  return {blob:doc.output('blob'),pages,filename:`Aquabears-${cleanName.replace(/\s+/g,'-')}-${review.date}.pdf`};
}
