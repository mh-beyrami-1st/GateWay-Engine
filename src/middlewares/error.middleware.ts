import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[-] Gateway Core Exception:', err.message);
    res.status(500).send('Gateway Core Error: Internal Architecture Failure.');
};