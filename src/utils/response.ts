import { Response } from 'express';

interface SuccessOptions<T> {
  res: Response;
  status: number;
  message: string;
  data?: T;
}

interface ErrorOptions {
  res: Response;
  status: number;
  message: string;
  errors?: { field: string; message: string }[];
}

export const sendSuccess = <T>({ res, status, message, data }: SuccessOptions<T>): void => {
  const body: Record<string, unknown> = { success: true, status, message };
  if (data !== undefined) body['data'] = data;
  res.status(status).json(body);
};

export const sendError = ({ res, status, message, errors }: ErrorOptions): void => {
  const body: Record<string, unknown> = { success: false, status, message };
  if (errors) body['errors'] = errors;
  res.status(status).json(body);
};
