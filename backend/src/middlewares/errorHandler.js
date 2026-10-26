import { CustomError, NotFoundError } from '../constants/errorCodes.js';

/**
 * 존재하지 않는 경로에 대한 404 처리 미들웨어.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`${req.method} ${req.originalUrl} 경로를 찾을 수 없습니다.`));
}

/**
 * Express 전역 에러 핸들러.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof CustomError) {
    res.status(err.statusCode).json({ success: false, errorCode: err.errorCode, message: err.message });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, errorCode: 'INVALID_REQUEST', message: '잘못된 JSON 형식입니다.' });
    return;
  }

  console.error('[UnhandledError]', err);
  res.status(500).json({ success: false, errorCode: 'INTERNAL_SERVER_ERROR', message: '서버 내부 오류가 발생했습니다.' });
}

export default errorHandler;
