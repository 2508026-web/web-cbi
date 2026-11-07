const ExcelJS = require('exceljs');
const path = require('path');

/**
 * 匯出核銷明細表 Excel
 * 依照會議日期、會議名稱排序
 * 套用範例/核銷明細表格式.xlsx 的結構與樣式
 */
async function generateReimbursementExcel(records, meetingTitle = '', outputPath = null) {
  // 依照會議日期、會議名稱排列
  const sortedRecords = [...records].sort((a, b) => {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.meeting_name || '').localeCompare(b.meeting_name || '');
  });

  const workbook = new ExcelJS.Workbook();
  const templatePath = path.resolve(__dirname, '../../範例/核銷明細表格式.xlsx');
  
  // 嘗試讀取模板保留原始樣式，若不可讀則建立標準樣式
  let worksheet;
  try {
    await workbook.xlsx.readFile(templatePath);
    worksheet = workbook.getWorksheet(1);
    
    // 清除模板中原本第3列以下的範例列，重新填寫
    const rowCount = worksheet.rowCount;
    for (let r = rowCount; r >= 3; r--) {
      worksheet.spliceRows(r, 1);
    }
  } catch (err) {
    worksheet = workbook.addWorksheet('核銷明細表');
  }

  // 1. 設定標題
  const titleText = meetingTitle 
    ? `晶創計畫辦公室\n${meetingTitle}費用核銷`
    : '晶創計畫辦公室\n費用核銷明細表';

  const cellA1 = worksheet.getCell('A1');
  cellA1.value = titleText;
  cellA1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cellA1.font = { name: '微軟正黑體', size: 16, bold: true };
  worksheet.getRow(1).height = 45;

  // 2. 表頭設定 (Row 2)
  const headers = [
    { col: 'A', text: '項次', width: 8 },
    { col: 'B', text: '姓名', width: 14 },
    { col: 'C', text: '日期', width: 14 },
    { col: 'D', text: '會議', width: 28 },
    { col: 'E', text: '審查費\n51330909', width: 16 },
    { col: 'F', text: '專家旅費\n51330906', width: 16 },
    { col: 'G', text: '會議費用\n51330604', width: 16 },
    { col: 'H', text: '小計', width: 16 },
    { col: 'I', text: '備註', width: 24 }
  ];

  const row2 = worksheet.getRow(2);
  row2.height = 35;
  headers.forEach((h, idx) => {
    const cell = row2.getCell(idx + 1);
    cell.value = h.text;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.font = { name: '微軟正黑體', size: 11, bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getColumn(idx + 1).width = h.width;
  });

  // 3. 資料填入 (從 Row 3 開始)
  const startRow = 3;
  sortedRecords.forEach((item, index) => {
    const currentRow = startRow + index;
    const row = worksheet.getRow(currentRow);
    row.height = 24;

    const feeReview = Number(item.fee_review) || 0;
    const feeTraffic = Number(item.fee_traffic) || 0;
    const feeMeal = Number(item.fee_meal) || 0;

    row.getCell(1).value = index + 1; // 項次
    row.getCell(2).value = item.name || ''; // 姓名
    row.getCell(3).value = item.date || ''; // 日期
    row.getCell(4).value = item.meeting_name || ''; // 會議
    row.getCell(5).value = feeReview; // 審查費
    row.getCell(6).value = feeTraffic; // 專家旅費
    row.getCell(7).value = feeMeal; // 會議費用
    row.getCell(8).value = { formula: `SUM(E${currentRow}:G${currentRow})` }; // 小計公式
    row.getCell(9).value = item.note || ''; // 備註

    // 設定格式與框線
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.font = { name: '微軟正黑體', size: 11 };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      if (c === 1 || c === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (c === 2 || c === 4 || c === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        // 金額欄位 (E, F, G, H)
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      }
    }
  });

  // 4. 總計列
  const lastDataRow = startRow + sortedRecords.length - 1;
  const totalRowIndex = Math.max(lastDataRow + 1, startRow);
  const totalRow = worksheet.getRow(totalRowIndex);
  totalRow.height = 26;

  totalRow.getCell(4).value = '總計';
  totalRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
  totalRow.getCell(4).font = { name: '微軟正黑體', size: 11, bold: true };

  // 總計公式
  if (sortedRecords.length > 0) {
    totalRow.getCell(5).value = { formula: `SUM(E${startRow}:E${lastDataRow})` };
    totalRow.getCell(6).value = { formula: `SUM(F${startRow}:F${lastDataRow})` };
    totalRow.getCell(7).value = { formula: `SUM(G${startRow}:G${lastDataRow})` };
    totalRow.getCell(8).value = { formula: `SUM(H${startRow}:H${lastDataRow})` };
  } else {
    totalRow.getCell(5).value = 0;
    totalRow.getCell(6).value = 0;
    totalRow.getCell(7).value = 0;
    totalRow.getCell(8).value = 0;
  }

  for (let c = 1; c <= 9; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: '微軟正黑體', size: 11, bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'double' },
      right: { style: 'thin' }
    };
    if (c >= 5 && c <= 8) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '#,##0';
    }
  }

  if (outputPath) {
    await workbook.xlsx.writeFile(outputPath);
  }
  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateReimbursementExcel };
