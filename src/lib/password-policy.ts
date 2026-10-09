import bcrypt from 'bcryptjs';

// CÁC HẰNG SỐ CẤU HÌNH CHÍNH SÁCH MẬT KHẨU
export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_FAILED_ATTEMPTS: 5,
  LOCK_TIME_MINUTES: 15,
  PASSWORD_EXPIRY_DAYS: 90
};

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Kiểm tra tính hợp lệ và độ mạnh của mật khẩu mới theo chuẩn:
 * - Tối thiểu 8 ký tự
 * - Có ít nhất 1 chữ hoa, 1 chữ thường, 1 số
 * - Không trùng hoặc chứa tên đăng nhập
 * - Không trùng với mật khẩu hiện tại
 */
export function validatePasswordPolicy(
  newPassword: string,
  username?: string,
  currentPasswordHash?: string
): PasswordValidationResult {
  if (!newPassword || newPassword.length < PASSWORD_POLICY.MIN_LENGTH) {
    return {
      valid: false,
      message: `Mật khẩu phải có tối thiểu ${PASSWORD_POLICY.MIN_LENGTH} ký tự.`
    };
  }

  // Phải có chữ hoa
  if (!/[A-Z]/.test(newPassword)) {
    return {
      valid: false,
      message: 'Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z).'
    };
  }

  // Phải có chữ thường
  if (!/[a-z]/.test(newPassword)) {
    return {
      valid: false,
      message: 'Mật khẩu phải chứa ít nhất 1 chữ cái thường (a-z).'
    };
  }

  // Phải có chữ số
  if (!/[0-9]/.test(newPassword)) {
    return {
      valid: false,
      message: 'Mật khẩu phải chứa ít nhất 1 chữ số (0-9).'
    };
  }

  // Không được chứa tên đăng nhập
  if (username && username.trim().length >= 3) {
    const cleanUser = username.trim().toLowerCase();
    if (newPassword.toLowerCase().includes(cleanUser)) {
      return {
        valid: false,
        message: 'Mật khẩu không được trùng hoặc chứa tên đăng nhập.'
      };
    }
  }

  // Không trùng với mật khẩu hiện tại
  if (currentPasswordHash) {
    if (bcrypt.compareSync(newPassword, currentPasswordHash)) {
      return {
        valid: false,
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
      };
    }
  }

  return { valid: true };
}

/**
 * Kiểm tra xem mật khẩu đã quá hạn 90 ngày hay chưa
 */
export function isPasswordExpired(passwordChangedAt?: string | null): boolean {
  if (!passwordChangedAt) return false;
  const changedTime = new Date(passwordChangedAt).getTime();
  if (isNaN(changedTime)) return false;

  const now = new Date().getTime();
  const diffDays = (now - changedTime) / (1000 * 60 * 60 * 24);
  return diffDays >= PASSWORD_POLICY.PASSWORD_EXPIRY_DAYS;
}
