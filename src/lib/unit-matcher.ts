/**
 * Module nhận diện Đơn vị (Chi nhánh Agribank) tự động dựa trên tên file và nội dung.
 * Được thiết kế với độ an toàn cao: Tuyệt đối không tự ý suy đoán bừa.
 * Nếu có bất kỳ sự mâu thuẫn hoặc không chắc chắn nào, hệ thống sẽ gắn cờ cảnh báo rõ ràng.
 */

export interface UnitInfo {
  id: number;
  unit_code: string;
  unit_name: string;
}

export interface UnitMatchResult {
  status: 'MATCHED' | 'CONFLICT' | 'AMBIGUOUS' | 'NOT_FOUND';
  confidence: 'HIGH' | 'NONE';
  unit: { id: number; unitCode: string; unitName: string } | null;
  matchedBy?: 'CODE_AND_NAME' | 'CODE_ONLY' | 'NAME_ONLY' | 'NAME_EXACT_LONGEST';
  warning?: string;
}

export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanUnitName(name: string): string {
  return normalizeText(name)
    .replace(/\bagribank\b/g, '')
    .replace(/\bchi nhanh\b/g, '')
    .replace(/\bcn\b/g, '')
    .replace(/\bphong giao dich\b/g, '')
    .replace(/\bpgd\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phân tích tên file và nhận diện đơn vị tương ứng một cách chặt chẽ.
 */
export function matchUnitFromFilename(filename: string, allUnits: UnitInfo[]): UnitMatchResult {
  const normFile = normalizeText(filename);

  // 1. Tìm các mã số đơn vị trong tên file (4 đến 6 chữ số: chi nhánh 4 số, ban/trung tâm TSC 4-6 số)
  const codeMatches = Array.from(filename.matchAll(/\b(\d{4,6})\b/g)).map(m => m[1]);
  let unitByCode: UnitInfo | null = null;
  let foundCode: string | null = null;

  for (const c of codeMatches) {
    const u = allUnits.find(unit => unit.unit_code === c);
    if (u) {
      unitByCode = u;
      foundCode = c;
      break;
    }
  }

  // 2. Tìm kiếm theo tên chi nhánh trong database
  const matchedByName: UnitInfo[] = [];

  for (const u of allUnits) {
    let cName = cleanUnitName(u.unit_name);
    if (!cName || cName.length < 2) continue;

    const isPureDigits = /^\d+$/.test(cName);
    let isMatch = false;

    if (isPureDigits) {
      // Đối với chi nhánh tên số như "Chi nhánh 10", "Chi nhánh 4" -> Phải có từ "cn" hoặc "chi nhanh" đi kèm số
      isMatch = new RegExp('(?:cn|chi\\s*nhanh)\\s*' + cName + '\\b').test(normFile);
    } else {
      // Kiểm tra cụm từ có ranh giới từ hợp lệ
      const wordPattern = new RegExp('(?:^|\\s)' + cName.replace(/ /g, '\\s+') + '(?:$|\\s)');
      isMatch = wordPattern.test(normFile);

      // Thử trường hợp số La Mã (II vs 2, I vs 1)
      if (!isMatch && (cName.endsWith(' ii') || cName.endsWith(' i'))) {
        const altCName = cName.replace(/\bii$/, '2').replace(/\bi$/, '1');
        const altFile = normFile.replace(/\bii\b/g, '2').replace(/\bi\b/g, '1');
        const altPattern = new RegExp('(?:^|\\s)' + altCName.replace(/ /g, '\\s+') + '(?:$|\\s)');
        isMatch = altPattern.test(altFile);
      }
    }

    if (isMatch) {
      matchedByName.push(u);
    }
  }

  // Sắp xếp ưu tiên theo độ dài tên dài nhất (ví dụ: "Bắc Giang II" ưu tiên hơn "Bắc Giang", "Phú Thọ II" ưu tiên hơn "Phú Thọ")
  matchedByName.sort((a, b) => cleanUnitName(b.unit_name).length - cleanUnitName(a.unit_name).length);

  // 3. Đối chiếu tính nhất quán giữa Mã và Tên
  if (unitByCode && matchedByName.length > 0) {
    const topNameMatch = matchedByName[0];
    if (unitByCode.id === topNameMatch.id) {
      return {
        status: 'MATCHED',
        confidence: 'HIGH',
        unit: { id: unitByCode.id, unitCode: unitByCode.unit_code, unitName: unitByCode.unit_name },
        matchedBy: 'CODE_AND_NAME'
      };
    } else {
      // Xảy ra mâu thuẫn: Mã chỉ đơn vị này nhưng tên lại chỉ đơn vị khác! (Ví dụ: 1200 Nam Định)
      return {
        status: 'CONFLICT',
        confidence: 'NONE',
        unit: null,
        warning: `Mâu thuẫn dữ liệu: Mã trong tên file là ${foundCode} (${unitByCode.unit_name}) nhưng tên chi nhánh là ${topNameMatch.unit_name} (Mã ${topNameMatch.unit_code}). Hệ thống không tự ý đưa vào bừa, vui lòng kiểm tra lại file này.`
      };
    }
  }

  // 4. Nếu chỉ khớp theo mã đơn vị hợp lệ và tên không bị mâu thuẫn
  if (unitByCode) {
    return {
      status: 'MATCHED',
      confidence: 'HIGH',
      unit: { id: unitByCode.id, unitCode: unitByCode.unit_code, unitName: unitByCode.unit_name },
      matchedBy: 'CODE_ONLY'
    };
  }

  // 5. Nếu chỉ khớp theo tên (không có mã số trong tên file, ví dụ: Hà Thành, Bắc Giang II)
  if (matchedByName.length === 1) {
    const top = matchedByName[0];
    return {
      status: 'MATCHED',
      confidence: 'HIGH',
      unit: { id: top.id, unitCode: top.unit_code, unitName: top.unit_name },
      matchedBy: 'NAME_ONLY'
    };
  }

  if (matchedByName.length > 1) {
    const top = matchedByName[0];
    const second = matchedByName[1];
    // Nếu tên dài hơn bao trùm hoàn toàn tên ngắn hơn (ví dụ "Bắc Giang II" chứa "Bắc Giang")
    if (cleanUnitName(top.unit_name).includes(cleanUnitName(second.unit_name))) {
      return {
        status: 'MATCHED',
        confidence: 'HIGH',
        unit: { id: top.id, unitCode: top.unit_code, unitName: top.unit_name },
        matchedBy: 'NAME_EXACT_LONGEST'
      };
    }

    return {
      status: 'AMBIGUOUS',
      confidence: 'NONE',
      unit: null,
      warning: `Tên file trùng khớp với nhiều chi nhánh (${matchedByName.map(u => `[${u.unit_code}] ${u.unit_name}`).join(', ')}). Không thể tự ý suy đoán.`
    };
  }

  // 6. Không tìm thấy đơn vị nào (ví dụ: QLLE3, TTCSKH, Ban Truyền thông, file không thuộc 155 chi nhánh)
  return {
    status: 'NOT_FOUND',
    confidence: 'NONE',
    unit: null,
    warning: 'Không tìm thấy đơn vị nào trên hệ thống khớp với tên file này (có thể là Phòng/Ban Trụ sở chính hoặc mã viết tắt nội bộ). Cần Admin kiểm tra trực tiếp.'
  };
}
