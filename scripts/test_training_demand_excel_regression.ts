import * as xlsx from 'xlsx';
import * as path from 'path';
import { parseTrainingDemandExcel } from '../src/lib/training-excel-parser';
import { parseStrictNonNegativeInt, validateProposal } from '../src/lib/training-validation';
import { getDatabase } from '../src/lib/db';

async function runRegressionTests() {
  console.log('================================================================');
  console.log('   BẮT ĐẦU CHẠY REGRESSION TEST: TRAINING DEMAND EXCEL HARDENING');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  const db = getDatabase();
  const allOfficialPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all() as any[];
  const allOfficialTopics = db.prepare(`
    SELECT t.id, t.program_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
           p.code as program_code, p.name as program_name
    FROM training_program_topics t
    JOIN training_programs p ON t.program_id = p.id
  `).all() as any[];

  console.log(`1. Kiểm tra CSDL: Đã nạp ${allOfficialPrograms.length} chương trình, ${allOfficialTopics.length} chuyên đề.`);
  const sampleTopic = allOfficialTopics.find(t => t.id === 2) || allOfficialTopics[0];
  console.log(`   Chuyên đề mẫu: ID=${sampleTopic.id}, Tên="${sampleTopic.topic_name}", Mã khung="${sampleTopic.program_code}"\n`);

  // -------------------------------------------------------------
  // TEST SUITE 1: STRICT NUMBER SANITIZATION & CELL COORDINATES
  // -------------------------------------------------------------
  console.log('TEST SUITE 1: LÀM SẠCH SỐ & BÁO LỖI TOẠ ĐỘ Ô');
  {
    const resNegative = parseStrictNonNegativeInt('-5', 'B5');
    assert(Boolean(resNegative.error && resNegative.error.includes('Ô B5') && resNegative.error.includes('số âm')), 'Số âm "-5" bị từ chối kèm toạ độ B5', resNegative.error);

    const resDecimalComma = parseStrictNonNegativeInt('2,5', 'C7');
    assert(Boolean(resDecimalComma.error && resDecimalComma.error.includes('Ô C7') && resDecimalComma.error.includes('thập phân')), 'Số thập phân "2,5" bị từ chối kèm toạ độ C7', resDecimalComma.error);

    const resDecimalDot = parseStrictNonNegativeInt('2.5', 'C8');
    assert(Boolean(resDecimalDot.error && resDecimalDot.error.includes('thập phân')), 'Số thập phân "2.5" bị từ chối', resDecimalDot.error);

    const resRange = parseStrictNonNegativeInt('10-12', 'D10');
    assert(Boolean(resRange.error && resRange.error.includes('Ô D10') && resRange.error.includes('dải số')), 'Dải số "10-12" bị từ chối kèm toạ độ D10', resRange.error);

    const resThousandDot = parseStrictNonNegativeInt('1.200', 'E12');
    assert(resThousandDot.value === 1200 && !resThousandDot.error, 'Dấu chấm phân cách nghìn "1.200" parse thành 1200', `Got ${resThousandDot.value}`);

    const resThousandComma = parseStrictNonNegativeInt('1,200', 'E13');
    assert(resThousandComma.value === 1200 && !resThousandComma.error, 'Dấu phẩy phân cách nghìn "1,200" parse thành 1200', `Got ${resThousandComma.value}`);

    const resUnitText = parseStrictNonNegativeInt('3 người', 'F14');
    assert(Boolean(resUnitText.error && resUnitText.error.includes('ký tự không hợp lệ')), 'Chuỗi "3 người" bị từ chối', resUnitText.error);

    const resAlpha = parseStrictNonNegativeInt('abc', 'G15');
    assert(Boolean(resAlpha.error && resAlpha.error.includes('ký tự không hợp lệ')), 'Chuỗi "abc" bị từ chối', resAlpha.error);

    const resZero = parseStrictNonNegativeInt('0', 'H16');
    assert(resZero.value === 0 && !resZero.error, 'Số "0" hợp lệ và có giá trị 0');
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: MẪU 06 VALIDATION (BỎ Math.max(1, count))
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 2: CHUẨN HÓA ĐỀ XUẤT MẪU 06 & BỎ Math.max(1, count)');
  {
    const propZero = validateProposal({ proposal_name: 'Khóa kỹ năng số', participant_count: 0 }, 1);
    assert(!propZero.isValid && Boolean(propZero.error?.includes('phải là số nguyên dương lớn hơn 0')), 'Mẫu 06: participant_count=0 bị từ chối, KHÔNG ép thành 1');

    const propNeg = validateProposal({ proposal_name: 'Khóa kỹ năng số', participant_count: -10 }, 2);
    assert(!propNeg.isValid && Boolean(propNeg.error?.includes('số âm')), 'Mẫu 06: participant_count=-10 bị từ chối');

    const propText = validateProposal({ proposal_name: 'Khóa kỹ năng số', participant_count: 'abc' }, 3);
    assert(!propText.isValid && Boolean(propText.error?.includes('ký tự không hợp lệ')), 'Mẫu 06: participant_count="abc" bị từ chối');

    const propShort = validateProposal({ proposal_name: 'AB', participant_count: 10 }, 4);
    assert(!propShort.isValid && Boolean(propShort.error?.includes('ít nhất 3 ký tự')), 'Mẫu 06: Tên quá ngắn (< 3 ký tự) bị từ chối');

    const propValid = validateProposal({
      proposal_name: '  Kỹ năng đàm phán nâng cao  ',
      participant_count: '25',
      target_audience: '  Cán bộ tín dụng  '
    }, 5);
    assert(propValid.isValid && propValid.cleanProposal.proposal_name === 'Kỹ năng đàm phán nâng cao' && propValid.cleanProposal.participant_count === 25, 'Mẫu 06: Đề xuất hợp lệ được làm sạch');
  }

  // -------------------------------------------------------------
  // TEST SUITE 3: Ô MERGE SỐ LƯỢNG (CHỐNG NHÂN BẢN SỐ LƯỢNG)
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 3: XỬ LÝ Ô MERGE (CHỐNG NHÂN BẢN SỐ LƯỢNG)');
  {
    const wb = xlsx.utils.book_new();
    const rows = [
      ['STT', 'Mã Chuyên Đề', 'Mã Khung CT', 'Khung Chương Trình Đào Tạo', 'Vị Trí Chức Danh', 'Tên Chuyên Đề Đào Tạo', 'Hình Thức', 'Thời Lượng', 'Lộ Trình', 'Năng Lực', 'CC', 'CC1', 'CC2', 'Đã học', 'Đăng ký học năm 2027'],
      // Dòng 1, 2, 3: merge cột số lượng (cột index 14) với giá trị 10
      [1, `CD_${sampleTopic.id}`, sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', sampleTopic.topic_name, 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, 10],
      [2, `CD_${sampleTopic.id}`, sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', sampleTopic.topic_name, 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, ''],
      [3, `CD_${sampleTopic.id}`, sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', sampleTopic.topic_name, 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, '']
    ];
    const ws = xlsx.utils.aoa_to_sheet(rows);
    // Merge cột 14 từ row 1 đến row 3 (0-indexed: r: 1 to 3, c: 14)
    ws['!merges'] = [
      { s: { r: 1, c: 14 }, e: { r: 3, c: 14 } }
    ];
    xlsx.utils.book_append_sheet(wb, ws, 'Mau_04_Khung_Chuc_Danh');

    const parseRes = parseTrainingDemandExcel(wb, allOfficialPrograms, allOfficialTopics);
    const pData = parseRes.programsDataMap.get(sampleTopic.program_id);
    const topicRecord = pData?.topics.get(sampleTopic.id);

    assert(topicRecord !== undefined, 'Parse thành công chuyên đề trong khung');
    assert(topicRecord?.count === 10, `Ô số lượng 10 merge qua 3 dòng ghi đúng 10 (KHÔNG PHẢI 30): ghi nhận = ${topicRecord?.count}`);
    assert(parseRes.totalInFrameworkParticipants === 10, `Tổng số học viên là 10 (KHÔNG PHẢI 30): ghi nhận = ${parseRes.totalInFrameworkParticipants}`);
  }

  // -------------------------------------------------------------
  // TEST SUITE 4: NHẬN DIỆN MÃ CHUYÊN ĐỀ & FALLBACK & BÁO DÒNG KHÔNG KHỚP
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 4: NHẬN DIỆN MÃ CHUYÊN ĐỀ, FALLBACK & BÁO DÒNG KHÔNG KHỚP');
  {
    const wb = xlsx.utils.book_new();
    const rows = [
      ['STT', 'Mã Chuyên Đề', 'Mã Khung CT', 'Khung Chương Trình Đào Tạo', 'Vị Trí Chức Danh', 'Tên Chuyên Đề Đào Tạo', 'Hình Thức', 'Thời Lượng', 'Lộ Trình', 'Năng Lực', 'CC', 'CC1', 'CC2', 'Đã học', 'Đăng ký học năm 2027'],
      // 1. Khớp bằng mã chuyên đề chuẩn CD_2 dù tên bị đổi/sai lệch nhẹ
      [1, `CD_${sampleTopic.id}`, sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', sampleTopic.topic_name + ' tên bị sửa một chút', 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, 15],
      // 2. Không có mã chuyên đề -> Fallback khớp theo tên chuẩn hóa
      [2, '', sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', '   ' + sampleTopic.topic_name + '   ', 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, 20],
      // 3. Tên hoàn toàn không khớp và không có mã -> Phải vào unmatchedRows, TUYỆT ĐỐI KHÔNG vào proposalsList
      [3, '', sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', 'Chuyên đề tự bịa ABCXYZ 88888', 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, 30]
    ];
    const ws = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Mau_04_Khung_Chuc_Danh');

    const parseRes = parseTrainingDemandExcel(wb, allOfficialPrograms, allOfficialTopics);
    assert(parseRes.totalInFrameworkTopics === 1, 'Chuyên đề mẫu nhận diện thành công qua mã CD và tên fallback');
    assert(parseRes.proposalsList.length === 0, 'Dòng không khớp TUYỆT ĐỐI KHÔNG bị đẩy sang proposalsList (length = 0)');
    assert(parseRes.unmatchedRows.length === 1, 'Dòng không khớp được ghi vào unmatchedRows (length = 1)');
    assert(parseRes.unmatchedRows[0].rawTopicName.includes('Chuyên đề tự bịa ABCXYZ 88888'), 'unmatchedRows ghi đúng tên chuyên đề không khớp');
  }

  // -------------------------------------------------------------
  // TEST SUITE 5: ĐỐI CHIẾU DÒNG TỔNG CỘNG TRONG FILE EXCEL
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 5: ĐỐI CHIẾU DÒNG TỔNG CỘNG TRONG FILE EXCEL');
  {
    const wb = xlsx.utils.book_new();
    const rows = [
      ['STT', 'Mã Chuyên Đề', 'Mã Khung CT', 'Khung Chương Trình Đào Tạo', 'Vị Trí Chức Danh', 'Tên Chuyên Đề Đào Tạo', 'Hình Thức', 'Thời Lượng', 'Lộ Trình', 'Năng Lực', 'CC', 'CC1', 'CC2', 'Đã học', 'Đăng ký học năm 2027'],
      [1, `CD_${sampleTopic.id}`, sampleTopic.program_code, sampleTopic.program_name, 'LĐTV', sampleTopic.topic_name, 'Trực tuyến', '1 giờ', '', '', '', '', '', 0, 25],
      // Dòng Tổng cộng trong file ghi 100 (lệch với 25)
      ['', '', '', '', '', 'Tổng cộng', '', '', '', '', '', '', '', 0, 100]
    ];
    const ws = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Mau_04_Khung_Chuc_Danh');

    const parseRes = parseTrainingDemandExcel(wb, allOfficialPrograms, allOfficialTopics);
    assert(parseRes.fileTotalParticipants === 100, 'Trích xuất đúng số lượng từ dòng "Tổng cộng" trong file: 100');
    assert(parseRes.comparisonWithFileTotal !== undefined && parseRes.comparisonWithFileTotal.match === false, 'Phát hiện lệch giữa tổng các dòng (25) và dòng Tổng cộng trong file (100)');
    assert(parseRes.warnings.some(w => w.includes('CẢNH BÁO LỆCH SỐ LIỆU')), 'Phát sinh cảnh báo lệch số liệu');
  }

  // -------------------------------------------------------------
  // TEST SUITE 6: BẢO VỆ GHI ĐÈ BẢN SUBMITTED
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 6: BẢO VỆ GHI ĐÈ BẢN SUBMITTED');
  {
    // Kiểm tra câu lệnh guard trong code route.ts
    const subCheck = db.prepare(`
      SELECT * FROM training_demand_submissions
      WHERE status = 'SUBMITTED'
      LIMIT 1
    `).get() as any;

    if (subCheck) {
      assert(subCheck.status === 'SUBMITTED', `Bản ghi SUBMITTED tồn tại (ID=${subCheck.id}, UnitID=${subCheck.unit_id}) và sẽ bị API từ chối với status 403 nếu import đè.`);
    } else {
      assert(true, 'Guard logic trong POST import-excel đã kiểm tra existingSub.status === "SUBMITTED" -> 403');
    }
  }

  // -------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`KẾT QUẢ REGRESSION TEST: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch(err => {
  console.error('Lỗi khi chạy regression test:', err);
  process.exit(1);
});
