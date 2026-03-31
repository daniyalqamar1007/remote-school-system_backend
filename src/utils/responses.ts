// src/utils/responses.ts
import { HttpStatus } from "@nestjs/common";
import { Response } from "express";

export function successResponse(
    res: Response,
    message: string = "Success",
    data: any = {}
) {
    return res.status(200).json({ success: true, message, data, statusCode: 200 });
}

export function badRequestResponse(
    res: Response,
    message: string = "Bad Request",
    data: any = {}
) {
    return res.status(400).json({ success: false, message, data, statusCode: 400 });
}

export function unauthorizedResponse(
    res: Response,
    message: string = "Unauthorized",
    data: any = {}
) {
    return res.status(401).json({ success: false, message, data, statusCode: 401 });
}

export function forbiddenResponse(
    res: Response,
    message: string = "Forbidden",
    data: any = {}
) {
    return res.status(403).json({ success: false, message, data, statusCode: 403 });
}

export function notFoundResponse(
    res: Response,
    message: string = "Not Found",
    data: any = {}
) {
    return res.status(404).json({ success: false, message, data, statusCode: 404 });
}

export function conflictResponse(
    res: Response,
    message: string = "Conflict",
    data: any = {}
) {
    return res.status(409).json({ success: false, message, data, statusCode: 409 });
}

export function unsupportedMediaTypeResponse(
    res: Response,
    message: string = "Unsupported Media Type",
    data: any = {}
) {
    return res.status(415).json({ success: false, message, data, statusCode: 415 });
}

export function serverErrorResponse(
    res: Response,
    error: any,
    message: string = "Internal Server Error"
) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({ success: false, message, statusCode: 500 });
}

export function customResponse(
    res: Response,
    statusCode: number,
    message: string,
    data: any = null
  ) {
    // Ensure statusCode is valid
    const validStatusCode = Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 
      ? statusCode 
      : HttpStatus.INTERNAL_SERVER_ERROR;
  
    // Standardize response structure
    const response = {
      success: validStatusCode < 400,
      statusCode: validStatusCode,
      message: message || 'An error occurred',
      data: data ?? null
    };
  
    return res.status(validStatusCode).json(response);
  }

// export function customResponse(
//     res: Response,
//     statusCode: number,
//     message: string,
//     data: any = {}
// ) {
//     return res.status(statusCode).json({ success: statusCode < 400, message, data, statusCode: statusCode });
// }