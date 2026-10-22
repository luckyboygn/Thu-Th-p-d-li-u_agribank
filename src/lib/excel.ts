import * as xlsx from 'xlsx';

export interface ColumnMapping {
  employeeCodeCol: string; // Tên cột hoặc chỉ số cột chứa Mã cán bộ
  elearningAccountCol: string; // Tên cột hoặc chỉ số cột chứa Tài khoản eLearning
  fullNameCol?: string; // Tên cột Họ và tên (nếu có)
}

export interface HeaderDetectionResult {
  headerRowIndex: number;
  headers: string[];
  suggestedMapping: ColumnMapping;
  confidence: number;
  sampleRows: any[];
  candidateCodeCols?: string[];
  candidateElearnCols?: string[];
  candidateNameCols?: string[];
  isAmbiguous?: boolean;
  ambiguityWarnings?: string[];
}

// Từ khóa nhận diện Mã cán bộ - Khớp chính xác (Ưu tiên cao nhất)
const EXACT_EMP_CODE_KEYWORDS = [
  'mã cán bộ', 'mã cb', 'macb', 'mã nv', 'mã nhân viên', 
  'mã cán bộ agribank', 'mã cán bộ (1)', 'ma can bo', 'ma cb', 'manv'
];

// Từ khóa loại trừ cho Mã cán bộ (nếu chứa thì không phải là mã thí sinh)
const NEGATIVE_EMP_CODE_KEYWORDS = [
  'giới thiệu', 'người giới thiệu', 'chi nhánh', 'đơn vị', 'phòng ban', 'ngân hàng'
];

// Từ khóa nhận diện Tài khoản eLearning - Khớp chính xác (Ưu tiên cao nhất)
const EXACT_ELEARN_KEYWORDS = [
  'tài khoản e-learning', 'tài khoản elearning', 'tk e-learning', 'tk elearning',
  'tài khoản e - learning', 'username elearning', 'tên đăng nhập elearning',
  'elearning', 'e-learning', 'tai khoan e-learning', 'tai khoan elearning'
];

// Từ khóa loại trừ cho Tài khoản eLearning (tránh chọn nhầm tài khoản ngân hàng / thẻ)
const NEGATIVE_ELEARN_KEYWORDS = [
  'ngân hàng', 'tài khoản số', 'stk', 'hệ thống khác', 'thẻ', 'atm', 'thanh toán'
];

// Từ khóa nhận diện Họ tên - Khớp chính xác
const EXACT_NAME_KEYWORDS = [
  'họ và tên', 'họ tên', 'họ và tên \'(2)', 'ho va ten', 'ho ten', 'tên cán bộ', 'họ tên cán bộ'
];

function normalizeKeyword(str: any): string {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Tự động giải phóng ô gộp (unmerge) trên Worksheet để tiêu đề 2 dòng hoặc ô gộp không bị khuyết dữ liệu
 */
export function unmergeSheetCells(ws: xlsx.WorkSheet): void {
  if (!ws || !ws['!merges']) return;
  const range = ws['!ref'] ? xlsx.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 2500, c: 30 } };
  const maxR = Math.min(range.e.r, 2500);

  for (const m of ws['!merges']) {
    if (m.s.r > maxR) continue;
    if (m.e.r - m.s.r > 200) continue;
    const endR = Math.min(m.e.r, maxR);
    const originCell = ws[xlsx.utils.encode_cell(m.s)];
    if (!originCell || originCell.v === undefined || originCell.v === null || originCell.v === '') continue;

    for (let r = m.s.r; r <= endR; r++) {
      for (let c = m.s.c; c <= Math.min(m.e.c, 30); c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        if (!ws[addr] || ws[addr].v === undefined || ws[addr].v === null || ws[addr].v === '') {
          ws[addr] = { ...originCell };
        }
      }
    }
  }
}

/**
 * Tính điểm khớp cho cột Mã cán bộ
 */
function scoreEmpCodeCol(cellVal: string): number {
  if (!cellVal) return 0;
  if (NEGATIVE_EMP_CODE_KEYWORDS.some(neg => cellVal.includes(neg))) return 0;

  // Cấp 1: Khớp chính xác 100%
  if (EXACT_EMP_CODE_KEYWORDS.includes(cellVal)) return 100;

  // Cấp 2: Chứa từ khóa chuyên biệt
  if (cellVal.includes('mã cán bộ') || cellVal.includes('mã cb') || cellVal.includes('mã nhân viên')) {
    return 70;
  }
  if (cellVal.includes('macb') || cellVal.includes('mã nv')) {
    return 60;
  }
  return 0;
}

/**
 * Tính điểm khớp cho cột Tài khoản eLearning
 */
function scoreElearnCol(cellVal: string): number {
  if (!cellVal) return 0;
  if (NEGATIVE_ELEARN_KEYWORDS.some(neg => cellVal.includes(neg))) return 0;

  // Cấp 1: Khớp chính xác 100%
  if (EXACT_ELEARN_KEYWORDS.includes(cellVal)) return 100;

  // Cấp 2: Chứa từ khóa chuyên biệt elearning
  if (cellVal.includes('elearning') || cellVal.includes('e-learning')) {
    return 70;
  }

  // Cấp 3: Từ khóa chung chung (chỉ xét khi không có từ khóa chuyên biệt)
  if (cellVal === 'tên đăng nhập' || cellVal === 'username') {
    return 35;
  }
  if (cellVal === 'tài khoản') {
    return 15;
  }
  return 0;
}

/**
 * Tính điểm khớp cho cột Họ và tên
 */
function scoreNameCol(cellVal: string): number {
  if (!cellVal) return 0;
  if (EXACT_NAME_KEYWORDS.includes(cellVal)) return 100;
  if (cellVal.includes('họ và tên') || cellVal.includes('họ tên') || cellVal.includes('tên cán bộ')) {
    return 60;
  }
  return 0;
}

export function detectHeaderAndMapping(rawData: any[][]): HeaderDetectionResult {
  let bestRowIndex = 0;
  let bestScore = -1;
  let detectedHeaders: string[] = [];
  let mapping: ColumnMapping = { employeeCodeCol: '', elearningAccountCol: '', fullNameCol: '' };

  let bestCandidates = {
    codeCols: [] as Array<{ col: string; score: number }>,
    elearnCols: [] as Array<{ col: string; score: number }>,
    nameCols: [] as Array<{ col: string; score: number }>
  };

  const maxScanRows = Math.min(30, rawData.length);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rawData[r] || [];
    if (!Array.isArray(row) || row.length === 0) continue;

    let rowScore = 0;
    const codeCandidates: Array<{ col: string; score: number }> = [];
    const elearnCandidates: Array<{ col: string; score: number }> = [];
    const nameCandidates: Array<{ col: string; score: number }> = [];

    for (let c = 0; c < row.length; c++) {
      const originalHeader = String(row[c] || '').trim();
      const cellVal = normalizeKeyword(row[c]);
      if (!cellVal || !originalHeader) continue;

      const codeScore = scoreEmpCodeCol(cellVal);
      if (codeScore > 0) {
        codeCandidates.push({ col: originalHeader, score: codeScore });
      }

      const elearnScore = scoreElearnCol(cellVal);
      if (elearnScore > 0) {
        elearnCandidates.push({ col: originalHeader, score: elearnScore });
      }

      const nameScore = scoreNameCol(cellVal);
      if (nameScore > 0) {
        nameCandidates.push({ col: originalHeader, score: nameScore });
      }

      // Cộng điểm nhẹ cho các cột thông dụng khác
      if (['stt', 'đơn vị', 'chức vụ', 'phòng ban', 'ngày kiểm tra', 'ca kiểm tra', 'ghi chú'].some(k => cellVal.includes(k))) {
        rowScore += 2;
      }
    }

    // Sắp xếp ứng cử viên theo điểm giảm dần
    codeCandidates.sort((a, b) => b.score - a.score);
    elearnCandidates.sort((a, b) => b.score - a.score);
    nameCandidates.sort((a, b) => b.score - a.score);

    const topCode = codeCandidates[0];
    const topElearn = elearnCandidates[0];
    const topName = nameCandidates[0];

    if (topCode) rowScore += topCode.score;
    if (topElearn) rowScore += topElearn.score;
    if (topName) rowScore += topName.score;

    if (rowScore > bestScore) {
      bestScore = rowScore;
      bestRowIndex = r;
      detectedHeaders = row.map(c => String(c || '').trim());
      mapping = {
        employeeCodeCol: topCode?.col || '',
        elearningAccountCol: topElearn?.col || '',
        fullNameCol: topName?.col || ''
      };
      bestCandidates = {
        codeCols: codeCandidates,
        elearnCols: elearnCandidates,
        nameCols: nameCandidates
      };
    }
  }

  // Kiểm tra tính mơ hồ (Ambiguity)
  let isAmbiguous = false;
  const ambiguityWarnings: string[] = [];

  const highCodeCandidates = bestCandidates.codeCols.filter(c => c.score >= 60);
  if (highCodeCandidates.length > 1) {
    isAmbiguous = true;
    ambiguityWarnings.push(`Phát hiện ${highCodeCandidates.length} cột có thể là Mã cán bộ: ${highCodeCandidates.map(c => `"${c.col}"`).join(', ')}. Hệ thống tạm chọn "${mapping.employeeCodeCol}". Vui lòng xác nhận.`);
  }

  const highElearnCandidates = bestCandidates.elearnCols.filter(c => c.score >= 60);
  if (highElearnCandidates.length > 1) {
    isAmbiguous = true;
    ambiguityWarnings.push(`Phát hiện ${highElearnCandidates.length} cột có thể là Tài khoản eLearning: ${highElearnCandidates.map(c => `"${c.col}"`).join(', ')}. Hệ thống tạm chọn "${mapping.elearningAccountCol}". Vui lòng xác nhận.`);
  }

  // Lấy 5 dòng mẫu tiếp theo làm preview
  const sampleRows: any[] = [];
  for (let i = bestRowIndex + 1; i < Math.min(bestRowIndex + 6, rawData.length); i++) {
    if (rawData[i] && rawData[i].some(v => v !== null && v !== '')) {
      const rowObj: Record<string, any> = {};
      detectedHeaders.forEach((h, idx) => {
        rowObj[h || `Cột_${idx + 1}`] = rawData[i][idx] !== undefined ? rawData[i][idx] : '';
      });
      sampleRows.push(rowObj);
    }
  }

  return {
    headerRowIndex: bestRowIndex,
    headers: detectedHeaders,
    suggestedMapping: mapping,
    confidence: bestScore,
    sampleRows,
    candidateCodeCols: bestCandidates.codeCols.map(c => c.col),
    candidateElearnCols: bestCandidates.elearnCols.map(c => c.col),
    candidateNameCols: bestCandidates.nameCols.map(c => c.col),
    isAmbiguous,
    ambiguityWarnings
  };
}

export interface SkippedRowDetail {
  sheetName: string;
  rowIndex: number;
  reason: string;
  preview: string;
  isWarning: boolean;
}

export interface ParseReport {
  totalRowsRead: number;
  rowsAccepted: number;
  rowsSkipped: number;
  skippedDetails: SkippedRowDetail[];
  warnings: string[];
}

export interface ParsedRowData {
  rowIndex: number; // 1-indexed trong Excel
  employeeCode: string;
  elearningAccount: string;
  fullName: string;
  sheetName?: string;
  rawData: Record<string, any>; // Lưu 100% cột nghiệp vụ gốc
  isCandidateRow: boolean; // Phân biệt dòng cán bộ với dòng tiêu đề con/chữ ký
}

export function parseSheetRecords(
  rawData: any[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
  options?: { sheetName?: string }
): { records: ParsedRowData[]; parseReport: ParseReport } {
  const currentSheetName = options?.sheetName || 'Sheet1';
  const headers = (rawData[headerRowIndex] || []).map((h, i) => String(h || `Cột_${i + 1}`).trim());
  const codeColIdx = headers.findIndex(h => h.toLowerCase() === mapping.employeeCodeCol.toLowerCase());
  const elearnColIdx = headers.findIndex(h => h.toLowerCase() === mapping.elearningAccountCol.toLowerCase());
  const nameColIdx = mapping.fullNameCol ? headers.findIndex(h => h.toLowerCase() === mapping.fullNameCol?.toLowerCase()) : -1;

  const records: ParsedRowData[] = [];
  const skippedDetails: SkippedRowDetail[] = [];
  const warnings: string[] = [];

  let totalRowsRead = 0;

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    totalRowsRead++;
    const row = rawData[r];
    const actualRowIndex = r + 1; // 1-indexed trong Excel

    if (!row || !Array.isArray(row)) {
      skippedDetails.push({
        sheetName: currentSheetName,
        rowIndex: actualRowIndex,
        reason: 'Dòng trống hoàn toàn',
        preview: '',
        isWarning: false
      });
      continue;
    }

    // Kiểm tra dòng trống hoàn toàn
    const hasAnyContent = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyContent) {
      skippedDetails.push({
        sheetName: currentSheetName,
        rowIndex: actualRowIndex,
        reason: 'Dòng trống hoàn toàn',
        preview: '',
        isWarning: false
      });
      continue;
    }

    // Tạo rawData object giữ nguyên 100% các cột
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = row[idx] !== undefined && row[idx] !== null ? row[idx] : '';
    });

    const empCodeRaw = codeColIdx >= 0 ? String(row[codeColIdx] || '').trim() : '';
    const elearnRaw = elearnColIdx >= 0 ? String(row[elearnColIdx] || '').trim() : '';
    const fullNameRaw = nameColIdx >= 0 ? String(row[nameColIdx] || '').trim() : '';

    const nonBlankValues = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '').map(v => String(v).trim());
    const rowPreview = nonBlankValues.slice(0, 4).join(' | ');

    // Nhận diện dòng phân cách ca thi (như "I. DANH SÁCH THI CA 1") hoặc dòng tổng cộng/chữ ký
    const isSectionHeader = nonBlankValues.length <= 2 && (
      String(nonBlankValues[0]).startsWith('I.') ||
      String(nonBlankValues[0]).startsWith('II.') ||
      String(nonBlankValues[0]).startsWith('III.') ||
      String(nonBlankValues[0]).startsWith('IV.') ||
      String(nonBlankValues[0]).startsWith('V.')
    );

    const isFooter = nonBlankValues.some(v => {
      const lower = v.toLowerCase();
      return lower.includes('tổng cộng') || lower.includes('người lập biểu') || lower.includes('giám đốc') || lower.includes('trưởng phòng');
    });

    if (isSectionHeader || isFooter) {
      const reason = isSectionHeader ? 'Dòng tiêu đề phân ca / phân đoạn' : 'Dòng tổng cộng / chữ ký chân trang';
      skippedDetails.push({
        sheetName: currentSheetName,
        rowIndex: actualRowIndex,
        reason,
        preview: rowPreview,
        isWarning: true
      });
      warnings.push(`Sheet "${currentSheetName}", Dòng ${actualRowIndex}: Đã bỏ qua (${reason}: "${rowPreview}").`);
      continue;
    }

    // Nếu dòng có dữ liệu nhưng thiếu cả Mã cán bộ và eLearning:
    // KHÔNG âm thầm loại bỏ! Đưa vào records để Validation Engine bắt lỗi MISSING_REQUIRED_FIELD
    // Giúp người dùng biết rõ dòng nào bị thiếu thông tin thay vì bị mất dữ liệu.
    records.push({
      rowIndex: actualRowIndex,
      employeeCode: empCodeRaw,
      elearningAccount: elearnRaw.toLowerCase(), // Chuẩn hóa chữ thường cho eLearning
      fullName: fullNameRaw,
      sheetName: currentSheetName,
      rawData: {
        ...rowObj,
        _sheet_name: currentSheetName
      },
      isCandidateRow: true
    });
  }

  const parseReport: ParseReport = {
    totalRowsRead,
    rowsAccepted: records.length,
    rowsSkipped: skippedDetails.length,
    skippedDetails,
    warnings
  };

  return { records, parseReport };
}

/**
 * Tạo Workbook Excel mẫu chuẩn cho các đơn vị nhập liệu
 */
export function generateTemplateWorkbook(unitCode?: string, unitName?: string): xlsx.WorkBook {
  const wb = xlsx.utils.book_new();

  // Sheet 1: Bảng dữ liệu đăng ký chuẩn
  const headers = [
    'STT',
    'Mã đơn vị',
    'Ca kiểm tra',
    'Ngày kiểm tra',
    'Mã cán bộ',
    'Họ và tên',
    'Chức danh/chức vụ',
    'Nghiệp vụ đăng ký kiểm tra',
    'Điện thoại di động',
    'Tài khoản E-learning',
    'Ghi chú'
  ];

  const sampleRows = [
    [
      1,
      unitCode || '8802',
      'Ca 1',
      '19/09/2026',
      '200733604',
      'Nguyễn Thị Thu Hà',
      'Nhân viên',
      'Kế toán',
      '0912345678',
      'hantt',
      'Dòng mẫu 1 (Xóa hoặc sửa lại khi nhập thực tế)'
    ],
    [
      2,
      unitCode || '8802',
      'Ca 1',
      '19/09/2026',
      '200733869',
      'Chu Mạnh Hùng',
      'Phó phòng',
      'Tín dụng',
      '0987654321',
      'hungchumanh',
      'Dòng mẫu 2 (Xóa hoặc sửa lại khi nhập thực tế)'
    ]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = xlsx.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 12 }, // Mã đơn vị
    { wch: 14 }, // Ca kiểm tra
    { wch: 16 }, // Ngày kiểm tra
    { wch: 16 }, // Mã cán bộ
    { wch: 24 }, // Họ và tên
    { wch: 20 }, // Chức danh/chức vụ
    { wch: 26 }, // Nghiệp vụ
    { wch: 16 }, // Điện thoại di động
    { wch: 22 }, // Tài khoản E-learning
    { wch: 34 }, // Ghi chú
  ];

  xlsx.utils.book_append_sheet(wb, ws, 'DS_Dang_Ky_Thi');

  // Sheet 2: Hướng dẫn chi tiết
  const guideData = [
    ['HƯỚNG DẪN KÊ KHAI DANH SÁCH THÍ SINH DỰ THI DÀNH CHO CÁC ĐƠN VỊ'],
    ['Đơn vị áp dụng: ' + (unitName ? `${unitName} (Mã: ${unitCode})` : 'Các đơn vị toàn hệ thống')],
    [''],
    ['1. NGUYÊN TẮC ĐỐI CHIẾU HAI CHIỀU QUAN TRỌNG NHẤT:'],
    ['- Hệ thống Web sẽ tự động kiểm tra HAI CHIỀU: "Mã cán bộ" ↔ "Tài khoản E-learning" với Database trung tâm.'],
    ['- Hai trường này bắt buộc phải thuộc cùng MỘT NGƯỜI trong Database trung tâm.'],
    ['- Trường hợp đúng eLearning nhưng sai Mã cán bộ hoặc ngược lại đều sẽ bị hệ thống báo lỗi chi tiết.'],
    ['- Hai cột "Mã cán bộ" và "Tài khoản E-learning" không được để trống bất kỳ dòng nào.'],
    [''],
    ['2. BẢO TOÀN DỮ LIỆU NGHIỆP VỤ:'],
    ['- Toàn bộ thông tin: Ca kiểm tra, Ngày kiểm tra, Chức danh, Nghiệp vụ, Điện thoại, Ghi chú... của đơn vị sẽ được BẢO TOÀN 100% theo file này.'],
    ['- Hệ thống KHÔNG tự ý sửa đổi hoặc lấy chức vụ từ Database trung tâm để ghi đè.'],
    [''],
    ['3. CHỐNG TRÙNG LẶP TRONG FILE:'],
    ['- Mỗi cán bộ chỉ được xuất hiện tối đa 01 lần trong toàn bộ danh sách.'],
    ['- Nếu trùng lặp Mã cán bộ hoặc eLearning giữa các dòng, hệ thống sẽ cảnh báo chính xác số dòng bị trùng.'],
    [''],
    ['4. QUY TRÌNH NỘP VÀ XÁC NHẬN CHÍNH THỨC:'],
    ['- Bước 1: Điền danh sách vào sheet "DS_Dang_Ky_Thi" (có thể xóa 2 dòng mẫu trước khi điền).'],
    ['- Bước 2: Đăng nhập vào Web App bằng tài khoản đơn vị và bấm "Chọn file Excel danh sách" để Upload.'],
    ['- Bước 3: Xem kết quả đối chiếu tự động. Nếu có lỗi, tải file lỗi về sửa trực tiếp trên file Excel rồi upload lại (v2, v3...).'],
    ['- Bước 4: Khi số lỗi = 0, nút "Xác nhận gửi chính thức" sẽ kích hoạt. Đơn vị bấm xác nhận để hoàn tất nghĩa vụ.']
  ];

  const wsGuide = xlsx.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 95 }];
  xlsx.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Ke_Khai');

  return wb;
}

/**
 * Tạo Workbook Excel mẫu chuẩn cho Database Cán Bộ Trung Tâm (Master Database ~34.000 người)
 */
export function generateMasterTemplateWorkbook(): xlsx.WorkBook {
  const wb = xlsx.utils.book_new();

  // Sheet 1: Bảng dữ liệu người dùng trung tâm
  const headers = [
    'STT',
    'Mã cán bộ',
    'Họ và tên',
    'Tên đăng nhập',
    'Mã đơn vị',
    'Tên đơn vị',
    'Ghi chú'
  ];

  const sampleRows = [
    [
      1,
      '200733604',
      'Nguyễn Thị Thu Hà',
      'hantt',
      '8802',
      'Chi nhánh Lào Cai II',
      'Ví dụ mẫu 1'
    ],
    [
      2,
      '200733869',
      'Chu Mạnh Hùng',
      'hungchumanh',
      '8802',
      'Chi nhánh Lào Cai II',
      'Ví dụ mẫu 2'
    ],
    [
      3,
      '200903092',
      'Nguyễn Văn A',
      'abc123',
      '3160',
      'Chi nhánh Sóc Sơn',
      'Ví dụ mẫu 3'
    ]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = xlsx.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 18 }, // Mã cán bộ (Unique)
    { wch: 26 }, // Họ và tên
    { wch: 22 }, // Tên đăng nhập (eLearning Unique)
    { wch: 14 }, // Mã đơn vị
    { wch: 30 }, // Tên đơn vị
    { wch: 26 }, // Ghi chú
  ];

  xlsx.utils.book_append_sheet(wb, ws, 'Danh_Sach_Nguoi_Dung');

  // Sheet 2: Hướng dẫn chi tiết
  const guideData = [
    ['HƯỚNG DẪN THIẾT LẬP FILE DATABASE CÁN BỘ TRUNG TÂM (NGUỒN ĐỐI CHIẾU 34.000 NGƯỜI)'],
    [''],
    ['1. NGUYÊN TẮC QUAN TRỌNG NHẤT (QUAN HỆ 1 - 1):'],
    ['- Mỗi Mã cán bộ chỉ có DUY NHẤT 01 Tên đăng nhập (Tài khoản eLearning).'],
    ['- Mỗi Tên đăng nhập chỉ thuộc về DUY NHẤT 01 Mã cán bộ.'],
    ['- Tuyệt đối KHÔNG có trường hợp 1 mã cán bộ gán 2 eLearning hoặc 1 eLearning thuộc 2 cán bộ.'],
    ['- Hai cột "Mã cán bộ" và "Tên đăng nhập" là 2 trường bắt buộc, không được để trống.'],
    [''],
    ['2. KIỂM TRA CHẤT LƯỢNG TỰ ĐỘNG KHI IMPORT:'],
    ['- Khi Quản trị viên nạp file này vào hệ thống, hệ thống sẽ tự động quét toàn bộ file.'],
    ['- Nếu phát hiện bất kỳ trường hợp trùng lặp hoặc vi phạm quan hệ 1-1, hệ thống sẽ từ chối nạp và chỉ rõ số dòng lỗi.'],
    [''],
    ['3. Ý NGHĨA NGHIỆP VỤ:'],
    ['- Database này là NGUỒN XÁC THỰC DUY NHẤT cho toàn bộ các đơn vị khi nộp danh sách.'],
    ['- Tất cả file danh sách do các đơn vị nộp lên sẽ được đối chiếu 2 chiều với Database này.'],
    [''],
    ['4. CÁCH NẠP VÀO HỆ THỐNG:'],
    ['- Bước 1: Điền dữ liệu toàn bộ cán bộ vào sheet "Danh_Sach_Nguoi_Dung" (có thể xóa 3 dòng mẫu).'],
    ['- Bước 2: Vào Web App -> Đăng nhập admin -> Bấm "Database Trung Tâm" -> Bấm "Chọn file Excel Master".']
  ];

  const wsGuide = xlsx.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 100 }];
  xlsx.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Database_Goc');

  return wb;
}


