const AdmZip = require('adm-zip');

function updateOrAddFile(zip, filePath, contentBuffer) {
  const entry = zip.getEntry(filePath);
  if (entry) {
    zip.updateFile(filePath, contentBuffer);
  } else {
    zip.addFile(filePath, contentBuffer);
  }
}

/**
 * 自動產生會議桌牌 PPTX
 * 依據修改後的範例/桌牌格式.pptx
 * 每頁 2 個人：
 *   - 上半部：〔上服務單位〕、〔上姓名〕、〔上職稱〕（正反兩面各一）
 *   - 下半部：〔下服務單位〕、〔下姓名〕、〔下職稱〕（正反兩面各一）
 */
function generateNameBadges(attendees, templatePath, outputPath) {
  const zip = new AdmZip(templatePath);
  
  // 讀取原始 slide1.xml 與 slide1.xml.rels
  const baseSlideXml = zip.readAsText('ppt/slides/slide1.xml');
  const baseSlideRels = zip.readAsText('ppt/slides/_rels/slide1.xml.rels');
  
  const totalAttendees = attendees.length;
  // 每頁 2 個人 (1 上, 1 下)
  const slideCount = Math.ceil(totalAttendees / 2) || 1;
  const slideIds = [];

  for (let s = 1; s <= slideCount; s++) {
    const personTop = attendees[(s - 1) * 2] || null;
    const personBottom = attendees[(s - 1) * 2 + 1] || null;

    let slideXml = baseSlideXml;
    
    // 1. 正規化可能被 PowerPoint 分拆的 下...職稱 run
    slideXml = slideXml.replace(/<a:t>下<\/a:t><\/a:r>\s*<a:r[^>]*>[\s\S]*?<a:t>職稱<\/a:t>/g, '<a:t></a:t></a:r><a:r><a:t>下職稱</a:t>');
    // 正規化可能被分拆的 上...職稱 run (預防性)
    slideXml = slideXml.replace(/<a:t>上<\/a:t><\/a:r>\s*<a:r[^>]*>[\s\S]*?<a:t>職稱<\/a:t>/g, '<a:t></a:t></a:r><a:r><a:t>上職稱</a:t>');

    // 2. 清除括號標記 [ 與 ] 以及全形 〔 與 〕
    slideXml = slideXml.split('<a:t>[</a:t>').join('<a:t></a:t>');
    slideXml = slideXml.split('<a:t>]</a:t>').join('<a:t></a:t>');
    slideXml = slideXml.split('<a:t>〔</a:t>').join('<a:t></a:t>');
    slideXml = slideXml.split('<a:t>〕</a:t>').join('<a:t></a:t>');

    // 3. 填入上半部人員 (上服務單位、上姓名、上職稱)
    const topDept = personTop ? escapeXml(personTop.department || '') : '';
    const topName = personTop ? escapeXml(personTop.name || '') : '';
    const topTitle = personTop ? escapeXml(personTop.title || '') : '';

    slideXml = slideXml.replace(/<a:t>上服務單位<\/a:t>/g, `<a:t>${topDept}</a:t>`);
    slideXml = slideXml.replace(/<a:t>上姓名<\/a:t>/g, `<a:t>${topName}</a:t>`);
    slideXml = slideXml.replace(/<a:t>上職稱<\/a:t>/g, `<a:t>${topTitle}</a:t>`);

    // 4. 填入下半部人員 (下服務單位、下姓名、下職稱)
    const botDept = personBottom ? escapeXml(personBottom.department || '') : '';
    const botName = personBottom ? escapeXml(personBottom.name || '') : '';
    const botTitle = personBottom ? escapeXml(personBottom.title || '') : '';

    slideXml = slideXml.replace(/<a:t>下服務單位<\/a:t>/g, `<a:t>${botDept}</a:t>`);
    slideXml = slideXml.replace(/<a:t>下姓名<\/a:t>/g, `<a:t>${botName}</a:t>`);
    slideXml = slideXml.replace(/<a:t>下職稱<\/a:t>/g, `<a:t>${botTitle}</a:t>`);

    // 亦相容無前綴之舊版模板 [服務單位]、[姓名]、[職稱] (若有)
    if (slideXml.includes('服務單位') || slideXml.includes('姓名')) {
      slideXml = slideXml.replace(/<a:t>服務單位<\/a:t>/g, `<a:t>${topDept}</a:t>`);
      slideXml = slideXml.replace(/<a:t>姓名<\/a:t>/g, `<a:t>${topName}</a:t>`);
      slideXml = slideXml.replace(/<a:t>職稱<\/a:t>/g, `<a:t>${topTitle}</a:t>`);
    }

    const slideFileName = `ppt/slides/slide${s}.xml`;
    updateOrAddFile(zip, slideFileName, Buffer.from(slideXml, 'utf8'));
    
    if (s > 1) {
      updateOrAddFile(zip, `ppt/slides/_rels/slide${s}.xml.rels`, Buffer.from(baseSlideRels, 'utf8'));
    }
    
    slideIds.push(s);
  }
  
  // 更新 presentation.xml 內的 sldIdLst
  let presXml = zip.readAsText('ppt/presentation.xml');
  let sldLstStr = '<p:sldIdLst>';
  slideIds.forEach((s, idx) => {
    sldLstStr += `<p:sldId id="${255 + idx + 1}" r:id="rId${10 + idx}"/>`;
  });
  sldLstStr += '</p:sldIdLst>';
  presXml = presXml.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/s, sldLstStr);
  updateOrAddFile(zip, 'ppt/presentation.xml', Buffer.from(presXml, 'utf8'));
  
  // 更新 ppt/_rels/presentation.xml.rels
  let presRelsXml = zip.readAsText('ppt/_rels/presentation.xml.rels');
  presRelsXml = presRelsXml.replace(/<Relationship[^>]*Target="slides\/slide[^>]*\/>/g, '');
  let relsToAdd = '';
  slideIds.forEach((s, idx) => {
    relsToAdd += `<Relationship Id="rId${10 + idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${s}.xml"/>`;
  });
  presRelsXml = presRelsXml.replace('</Relationships>', relsToAdd + '</Relationships>');
  updateOrAddFile(zip, 'ppt/_rels/presentation.xml.rels', Buffer.from(presRelsXml, 'utf8'));
  
  // 更新 [Content_Types].xml
  let ctXml = zip.readAsText('[Content_Types].xml');
  ctXml = ctXml.replace(/<Override[^>]*PartName="\/ppt\/slides\/slide[^>]*\/>/g, '');
  let ctToAdd = '';
  slideIds.forEach(s => {
    ctToAdd += `<Override PartName="/ppt/slides/slide${s}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  });
  ctXml = ctXml.replace('</Types>', ctToAdd + '</Types>');
  updateOrAddFile(zip, '[Content_Types].xml', Buffer.from(ctXml, 'utf8'));
  
  if (outputPath) {
    zip.writeZip(outputPath);
  }
  return zip.toBuffer();
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

module.exports = { generateNameBadges };
