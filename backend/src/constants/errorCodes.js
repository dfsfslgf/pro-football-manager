/**
 * 애플리케이션 공통 커스텀 에러. HTTP 상태 코드와 에러 코드를 함께 보유합니다.
 */
export class CustomError extends Error {
  /**
   * @param {string} message 사용자에게 노출 가능한 에러 메시지
   * @param {number} statusCode HTTP 상태 코드
   * @param {string} errorCode 클라이언트 분기용 에러 코드 상수
   */
  constructor(message, statusCode, errorCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/** 재화 부족 에러 (400, INSUFFICIENT_FUNDS) */
export class InsufficientFundsError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '보유 재화가 부족합니다.') {
    super(message, 400, 'INSUFFICIENT_FUNDS');
  }
}

/** 인벤토리 한도 초과 에러 (400, INVENTORY_FULL) */
export class InventoryFullError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '인벤토리가 가득 찼습니다.') {
    super(message, 400, 'INVENTORY_FULL');
  }
}

/** 리소스 미존재 에러 (404, NOT_FOUND) */
export class NotFoundError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '요청한 리소스를 찾을 수 없습니다.') {
    super(message, 404, 'NOT_FOUND');
  }
}

/** 요청 파라미터 검증 실패 에러 (400, INVALID_REQUEST) */
export class ValidationError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '잘못된 요청입니다.') {
    super(message, 400, 'INVALID_REQUEST');
  }
}

/** 인증 실패 에러 (401, UNAUTHORIZED) */
export class UnauthorizedError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '로그인이 필요합니다.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** 중복/충돌 에러 (409, CONFLICT) */
export class ConflictError extends CustomError {
  /** @param {string} [message] */
  constructor(message = '이미 존재합니다.') {
    super(message, 409, 'CONFLICT');
  }
}
