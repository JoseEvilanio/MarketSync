export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly detalhes?: any;

  constructor(message: string, statusCode = 400, detalhes?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.detalhes = detalhes;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}
