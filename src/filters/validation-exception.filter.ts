// src/filters/validation-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { customResponse } from 'src/utils/responses';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
    catch(exception: BadRequestException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const status = exception.getStatus();
        
        // Get the detailed error response
        const exceptionResponse = exception.getResponse();
        
        let message = 'Bad Request';
        let data = null;
        
        if (typeof exceptionResponse === 'object') {
            const responseObj = exceptionResponse as any;
            
            // If there are validation errors, format them properly
            if (Array.isArray(responseObj.message)) {
                // Multiple validation errors
                message = responseObj.message.join(' | ');
                data = { 
                    validationErrors: responseObj.message,
                    error: responseObj.error || 'Validation Failed'
                };
            } else if (typeof responseObj.message === 'string') {
                // Single error message
                message = responseObj.message;
                if (responseObj.error) {
                    data = { error: responseObj.error };
                }
            } else if (responseObj.error) {
                message = responseObj.error;
            }
        } else if (typeof exceptionResponse === 'string') {
            message = exceptionResponse;
        }

        // Log for debugging
        console.log('ValidationExceptionFilter - Message:', message);
        console.log('ValidationExceptionFilter - Data:', data);

        // Return consistent response structure with detailed errors
        customResponse(response, status, message, data);
    }
}