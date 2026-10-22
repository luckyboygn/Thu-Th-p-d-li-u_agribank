/**
 * Shared validation and parsing logic for Training Demand Survey
 * Dùng chung giữa Web Form và Import Excel
 */

import { normalizeText } from './unit-matcher';

export interface StrictNumberResult {
  value: number;
  error?: string;
}

/**
 * Phân tích và làm sạch số lượng học viên nghiêm ngặt.
 * Chỉ chấp nhận số nguyên không âm >= 0.
 * Hỗ trợ dấu chấm (.) hoặc dấu phẩy (,) làm phân cách hàng nghìn.
 * Báo lỗi rõ ràng đối với: số âm, số thập phân, dải số (10-12), chuỗi chứa chữ (3 người, abc).
 */
export function parseStrictNonNegativeInt(raw: any, cellCoord?: string): StrictNumberResult {
  const coordPrefix = cellCoord ? `Ô ${cellCoord}: ` : '';

  if (raw === null || raw === undefined || raw === '') {
    return { value: 0 };
  }

  if (typeof raw === 'number') {
    if (isNaN(raw)) {
      return { value: 0, error: `${coordPrefix}Giá trị NaN không hợp lệ.` };
    }
    if (!Number.isFinite(raw)) {
      return { value: 0, error: `${coordPrefix}Giá trị vô cực không hợp lệ.` };
    }
    if (!Number.isInteger(raw)) {
      return { value: 0, error: `${coordPrefix}Giá trị ${raw} là số thập phân, yêu cầu số nguyên không âm.` };
    }
    if (raw < 0) {
      return { value: 0, error: `${coordPrefix}Giá trị ${raw} là số âm, yêu cầu số không âm (>= 0).` };
    }
    return { value: raw };
  }

  const str = String(raw).trim();
  if (str === '') {
    return { value: 0 };
  }

  // 1. Kiểm tra dải số trước (vd: 10-12, 10 - 12, 10~12)
  if (/\d+\s*[-~–—]\s*\d+/.test(str)) {
    return { value: 0, error: `${coordPrefix}Giá trị "${str}" là dải số, vui lòng nhập một số nguyên cụ thể.` };
  }

  // 2. Kiểm tra dấu âm
  if (str.startsWith('-') || /-\d/.test(str)) {
    return { value: 0, error: `${coordPrefix}Giá trị "${str}" là số âm không hợp lệ.` };
  }

  // 3. Số nguyên thuần túy (ví dụ: "0", "15", "1200")
  if (/^\d+$/.test(str)) {
    const val = parseInt(str, 10);
    return { value: val };
  }

  // 4. Số có dấu chấm phân cách hàng nghìn (chuẩn Việt Nam: "1.200", "10.000.000")
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    const val = parseInt(str.replace(/\./g, ''), 10);
    return { value: val };
  }

  // 5. Số có dấu phẩy phân cách hàng nghìn (chuẩn quốc tế: "1,200", "10,000,000")
  if (/^\d{1,3}(,\d{3})+$/.test(str)) {
    const val = parseInt(str.replace(/,/g, ''), 10);
    return { value: val };
  }

  // 6. Số thập phân (vd: "2,5" hoặc "2.5")
  if (/^\d+[,.]\d+$/.test(str)) {
    return { value: 0, error: `${coordPrefix}Giá trị "${str}" là số thập phân, yêu cầu số nguyên không âm.` };
  }

  // 7. Chứa chữ hoặc ký tự khác (vd: "3 người", "abc", "10 người")
  return { value: 0, error: `${coordPrefix}Giá trị "${str}" chứa ký tự không hợp lệ, yêu cầu số nguyên không âm.` };
}

/**
 * Validate một đề xuất ngoài khung (Mẫu 06) chuẩn hóa
 */
export function validateProposal(prop: any, index?: number): { isValid: boolean; error?: string; cleanProposal?: any } {
  const rowPrefix = index !== undefined ? `Dòng ${index}: ` : '';
  const name = typeof prop?.proposal_name === 'string' ? prop.proposal_name.trim() : '';

  if (!name || name.length < 3) {
    return {
      isValid: false,
      error: `${rowPrefix}Tên chương trình/chuyên đề đề xuất phải có ít nhất 3 ký tự.`
    };
  }

  const rawCount = prop.participant_count;
  const numRes = parseStrictNonNegativeInt(rawCount, index !== undefined ? `Dòng ${index}` : undefined);
  if (numRes.error) {
    return { isValid: false, error: numRes.error };
  }

  if (numRes.value <= 0) {
    return {
      isValid: false,
      error: `${rowPrefix}Số lượng học viên đề xuất cho "${name}" phải là số nguyên dương lớn hơn 0 (hiện tại: ${rawCount}).`
    };
  }

  return {
    isValid: true,
    cleanProposal: {
      proposal_name: name,
      target_audience: typeof prop.target_audience === 'string' ? prop.target_audience.trim() : '',
      expected_duration: typeof prop.expected_duration === 'string' ? prop.expected_duration.trim() : '',
      delivery_method: typeof prop.delivery_method === 'string' ? prop.delivery_method.trim() : '',
      faculty_source: typeof prop.faculty_source === 'string' ? prop.faculty_source.trim() : '',
      participant_count: numRes.value,
      notes: typeof prop.notes === 'string' ? prop.notes.trim() : ''
    }
  };
}
