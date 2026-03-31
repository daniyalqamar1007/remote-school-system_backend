// import { BadRequestException } from '@nestjs/common';
// import { CreateStudentDto } from '../dto/create-student.dto';

// export class StudentValidationService {
//     static validateCreateStudent(dto: CreateStudentDto): void {
//         const errors: string[] = [];

//         // Check required fields
//         const requiredFields = [
//             'firstName', 'lastName', 'class', 'section', 'gender', 'dob',
//             'email', 'address', 'emergencyContact', 'enrollDate', 'expectedGraduation'
//         ];

//         for (const field of requiredFields) {
//             if (!dto[field] || dto[field] === '' || dto[field] === null || dto[field] === undefined) {
//                 errors.push(`${field} is required`);
//             }
//         }

//         // Validate email format
//         if (dto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
//             errors.push('Invalid email format');
//         }

//         // Validate password
//         if (dto.password && dto.password.length < 8) {
//             errors.push('Password must be at least 8 characters long');
//         }

//         // Validate date formats
//         if (dto.dob && isNaN(new Date(dto.dob).getTime())) {
//             errors.push('Invalid date of birth format');
//         }

//         if (dto.enrollDate && isNaN(new Date(dto.enrollDate).getTime())) {
//             errors.push('Invalid enrollment date format');
//         }

//         if (dto.expectedGraduation && isNaN(new Date(dto.expectedGraduation).getTime())) {
//             errors.push('Invalid expected graduation date format');
//         }

//         // Validate arrays
//         if (dto.allergies !== undefined && dto.allergies !== null) {
//             if (!Array.isArray(dto.allergies)) {
//                 errors.push(`allergies must be an array, received: ${typeof dto.allergies}`);
//             } else {
//                 const invalidElements = dto.allergies.filter(item => typeof item !== 'string');
//                 if (invalidElements.length > 0) {
//                     errors.push(`allergies array must contain only strings, found: ${invalidElements.map(item => typeof item).join(', ')}`);
//                 }
//             }
//         }

//         if (dto.medicalConditions !== undefined && dto.medicalConditions !== null) {
//             if (!Array.isArray(dto.medicalConditions)) {
//                 errors.push(`medicalConditions must be an array, received: ${typeof dto.medicalConditions}`);
//             } else {
//                 const invalidElements = dto.medicalConditions.filter(item => typeof item !== 'string');
//                 if (invalidElements.length > 0) {
//                     errors.push(`medicalConditions array must contain only strings, found: ${invalidElements.map(item => typeof item).join(', ')}`);
//                 }
//             }
//         }

//         if (dto.parents !== undefined && dto.parents !== null) {
//             if (!Array.isArray(dto.parents)) {
//                 errors.push(`parents must be an array, received: ${typeof dto.parents}`);
//             } else {
//                 const invalidElements = dto.parents.filter(item => typeof item !== 'string');
//                 if (invalidElements.length > 0) {
//                     errors.push(`parents array must contain only strings, found: ${invalidElements.map(item => typeof item).join(', ')}`);
//                 }
//             }
//         }

//         // Validate boolean fields
//         if (dto.iipFlag !== undefined && dto.iipFlag !== null && typeof dto.iipFlag !== 'boolean') {
//             errors.push('iipFlag must be a boolean');
//         }

//         if (dto.honorRolls !== undefined && dto.honorRolls !== null && typeof dto.honorRolls !== 'boolean') {
//             errors.push('honorRolls must be a boolean');
//         }

//         if (dto.athletics !== undefined && dto.athletics !== null && typeof dto.athletics !== 'boolean') {
//             errors.push('athletics must be a boolean');
//         }

//         // If there are validation errors, throw exception
//         if (errors.length > 0) {
//             throw new BadRequestException(`Validation failed: ${errors.join(', ')}`);
//         }
//     }
// }