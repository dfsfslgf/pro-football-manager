/** 지갑 단순 조회 (잠금 없음) */
export const SELECT_WALLET = 'SELECT user_id AS userId, cash_paid AS cashPaid, cash_free AS cashFree, gold FROM user_wallets WHERE user_id = ?';

/** 지갑 행 잠금 조회 (FOR UPDATE) */
export const SELECT_WALLET_FOR_UPDATE = `
  SELECT user_id AS userId, cash_paid AS cashPaid, cash_free AS cashFree, gold
  FROM user_wallets
  WHERE user_id = ?
  FOR UPDATE
`;

/** 지갑 잔액 갱신 */
export const UPDATE_WALLET_BALANCE = `
  UPDATE user_wallets
  SET cash_paid = ?, cash_free = ?, gold = ?
  WHERE user_id = ?
`;

/** 재화 변동 로그 기록 */
export const INSERT_TRANSACTION = `
  INSERT INTO transactions
  (user_id, type, currency_type, amount, balance_after_paid, balance_after_free, reason)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;
